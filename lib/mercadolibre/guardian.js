import { mlPut } from '@/lib/mercadolibre/api'
import { calcularDinero, ultimasVentas } from '@/lib/mercadolibre/dinero'

// GUARDIÁN DE DISPONIBILIDAD
// Protege contra vender algo bajo pedido que ya no se puede conseguir.
// Semáforo por publicación (solo las de "bajo pedido": activas y con días de entrega):
//   verde    = comprado/verificado hace ≤ verde_dias
//   amarillo = hace ≤ amarillo_dias
//   rojo     = más tiempo, nunca verificado, o marcado "ya no se consigue"
// Con el interruptor ENCENDIDO: agotado → pausa; rojo → baja el stock en ML al tope;
// vuelve a verde → restaura las piezas. Venta sin comprar tras N días → avisa y pausa.
// Apagado: solo calcula el semáforo y genera avisos; no toca MercadoLibre.

const DIA = 86400000

export async function leerConfig(supabase) {
  const { data } = await supabase.from('ml_guardian_config').select('*').eq('id', 1).maybeSingle()
  return { activo: false, dias_sin_comprar: 3, tope_piezas: 2, verde_dias: 14, amarillo_dias: 42, ...(data || {}) }
}

export async function evaluar(supabase, cfg) {
  cfg = cfg || await leerConfig(supabase)
  const { data: pubs } = await supabase.from('ml_publicaciones')
    .select('id, item_id, variacion_id, titulo, estado_ml, stock_ml, tiempo_preparacion, bajo_pedido_piezas, creada_en, tope_aplicado, tope_stock_previo, guardian_pausada, verificada_en')
    .in('estado_ml', ['active', 'paused']).not('tiempo_preparacion', 'is', null)
  const lista = pubs || []
  const ids = [...new Set(lista.map(p => p.item_id))]
  const compras = {}, fichas = {}, enlaces = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    const { data: c } = await supabase.from('ml_venta_items').select('item_id, comprado_en').in('item_id', lote).not('comprado_en', 'is', null)
    for (const x of c || []) { const t = Date.parse(x.comprado_en); if (!compras[x.item_id] || t > compras[x.item_id]) compras[x.item_id] = t }
    const { data: f } = await supabase.from('ml_fichas_compra').select('item_id, disponible, revisada_en, enlace_compra').in('item_id', lote)
    for (const x of f || []) { if (x.enlace_compra) enlaces.add(x.item_id); const t = x.revisada_en ? Date.parse(x.revisada_en) : 0; const a = fichas[x.item_id]; if (!a || t >= a.t) fichas[x.item_id] = { t, disponible: x.disponible } }
  }
  const ahora = Date.now()
  const filas = lista.map(p => {
    const f = fichas[p.item_id]
    const cand = [compras[p.item_id], f && f.disponible !== false ? f.t : 0, p.creada_en ? Date.parse(p.creada_en) : 0, p.verificada_en ? Date.parse(p.verificada_en) : 0].filter(Boolean)
    const ult = cand.length ? Math.max(...cand) : null
    const dias = ult ? Math.floor((ahora - ult) / DIA) : null
    let riesgo, motivo
    if (f && f.disponible === false) { riesgo = 'agotado'; motivo = 'Marcado como "ya no se consigue"' }
    else if (dias == null) { riesgo = 'rojo'; motivo = 'Nunca verificado' }
    else if (dias <= cfg.verde_dias) { riesgo = 'verde'; motivo = `Verificado hace ${dias} día(s)` }
    else if (dias <= cfg.amarillo_dias) { riesgo = 'amarillo'; motivo = `Sin verificar hace ${dias} días` }
    else { riesgo = 'rojo'; motivo = `Sin verificar hace ${dias} días` }
    return { ...p, riesgo, motivo, dias, con_enlace: enlaces.has(p.item_id) }
  })
  // acciones que haría el guardián
  const plan = []
  for (const r of filas) {
    if (r.variacion_id) continue
    if (r.riesgo === 'agotado' && r.estado_ml === 'active') plan.push({ ...r, accion: 'pausar' })
    else if (r.riesgo === 'rojo' && r.estado_ml === 'active' && (r.stock_ml || 0) > cfg.tope_piezas) plan.push({ ...r, accion: 'bajar', a: cfg.tope_piezas })
    else if (r.riesgo === 'verde' && r.tope_aplicado && r.estado_ml === 'active') plan.push({ ...r, accion: 'restaurar', a: r.tope_stock_previo || r.bajo_pedido_piezas || 10 })
  }
  // ventas bajo pedido sin comprar
  const { data: vi } = await supabase.from('ml_venta_items')
    .select('id, item_id, titulo, venta:ml_ventas!inner(fecha_venta)').eq('estado', 'por_comprar')
  const atoradas = (vi || []).filter(x => x.venta?.fecha_venta && (ahora - Date.parse(x.venta.fecha_venta)) > cfg.dias_sin_comprar * DIA)
  return { cfg, filas, plan, atoradas }
}

export function resumen(ev) {
  const c = { verde: 0, amarillo: 0, rojo: 0, agotado: 0 }
  for (const f of ev.filas) c[f.riesgo]++
  return {
    total: ev.filas.length, ...c,
    bajar: ev.plan.filter(p => p.accion === 'bajar').length,
    pausar: ev.plan.filter(p => p.accion === 'pausar').length,
    restaurar: ev.plan.filter(p => p.accion === 'restaurar').length,
    atoradas: ev.atoradas.length,
    sin_enlace: ev.filas.filter(f => !f.con_enlace).length,
  }
}

async function alertar(supabase, tipo, item_id, titulo, mensaje) {
  const { data } = await supabase.from('ml_alertas').select('id').eq('tipo', tipo).eq('item_id', item_id).is('vista_en', null).limit(1)
  if (data?.length) return
  await supabase.from('ml_alertas').insert({ tipo, item_id, titulo, mensaje })
}
const log = (supabase, item_id, accion, valor, antes, ok, mensaje) =>
  supabase.from('ml_acciones').insert({ item_id, accion, valor: valor == null ? null : String(valor), antes: antes ?? null, ok, mensaje, hecho_por: 'guardian' })

// Alerta de margen: publicaciones activas ligadas al catálogo que pierden dinero o ganan menos
// del 15% sobre su costo. Un aviso por publicación cada 7 días como máximo.
export async function revisarMargenes(supabase, minimoPct = 15) {
  const { data: pubs } = await supabase.from('ml_publicaciones')
    .select('item_id, variacion_id, titulo, precio, producto_id, comision_pct_est').eq('estado_ml', 'active').not('producto_id', 'is', null)
  if (!pubs?.length) return 0
  const ids = [...new Set(pubs.map(p => p.producto_id))]
  const costos = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('productos_tienda').select('id, costo').in('id', ids.slice(i, i + 200))
    for (const x of data || []) costos[x.id] = x.costo
  }
  const ventas = await ultimasVentas(supabase).catch(() => ({}))
  const hace7 = new Date(Date.now() - 7 * DIA).toISOString()
  let n = 0
  for (const p of pubs) {
    const v = ventas[`${p.item_id}:${p.variacion_id || 0}`] || null
    const pct = v ? v.comisionPct : (p.comision_pct_est != null ? Number(p.comision_pct_est) : null)
    const d = calcularDinero({ precio: p.precio, costo: costos[p.producto_id], comisionPct: pct, envio: v?.envio })
    if (!d || d.ganancia == null || d.sobre_costo_pct >= minimoPct) continue
    const { data: ya } = await supabase.from('ml_alertas').select('id').eq('tipo', 'margen').eq('item_id', p.item_id).gte('creada_en', hace7).limit(1)
    if (ya?.length) continue
    const txt = d.ganancia < 0 ? `Pierdes $${Math.abs(d.ganancia)} por pieza` : `Ganas solo $${d.ganancia} (${d.sobre_costo_pct}% sobre el costo)`
    await supabase.from('ml_alertas').insert({ tipo: 'margen', item_id: p.item_id, titulo: p.titulo, mensaje: `${txt}: ${p.titulo}. Revisa el precio.` })
    n++
  }
  return n
}

// Guarda el semáforo y, si el interruptor está encendido (o forzar), aplica las acciones.
export async function correr(supabase, token, { forzar = false, max = 40 } = {}) {
  const ev = await evaluar(supabase)
  const ahoraIso = new Date().toISOString()
  for (const f of ev.filas) {
    if (f.riesgo !== undefined) await supabase.from('ml_publicaciones').update({ riesgo: f.riesgo, riesgo_motivo: f.motivo }).eq('id', f.id)
  }
  for (const a of ev.atoradas) {
    await alertar(supabase, 'venta_sin_comprar', a.item_id, a.titulo, `Se vendió hace más de ${ev.cfg.dias_sin_comprar} días y aún no la compras: ${a.titulo}`)
  }
  const hechas = []
  let margenes = 0
  try { margenes = await revisarMargenes(supabase) } catch {}
  if (ev.cfg.activo || forzar) {
    // pausar publicaciones con venta atorada
    const items = [...new Set(ev.atoradas.map(a => a.item_id))]
    for (const item_id of items) {
      if (hechas.length >= max) break
      const ps = ev.filas.filter(f => f.item_id === item_id && f.estado_ml === 'active')
      for (const p of ps) ev.plan.push({ ...p, accion: 'pausar', motivoExtra: 'venta sin comprar' })
    }
    const vistos = new Set()
    for (const p of ev.plan) {
      if (hechas.length >= max) break
      const clave = p.id + p.accion
      if (vistos.has(clave)) continue
      vistos.add(clave)
      try {
        if (p.accion === 'pausar') {
          await mlPut(token, `/items/${p.item_id}`, { status: 'paused' })
          await supabase.from('ml_publicaciones').update({ estado_ml: 'paused', guardian_pausada: true }).eq('id', p.id)
          await log(supabase, p.item_id, 'guardian_pausar', 'paused', { motivo: p.motivoExtra || p.motivo }, true, p.motivoExtra || p.motivo)
          await alertar(supabase, 'pausada', p.item_id, p.titulo, `Pausé la publicación: ${p.motivoExtra || p.motivo}. ${p.titulo}`)
        } else if (p.accion === 'bajar') {
          await mlPut(token, `/items/${p.item_id}`, { available_quantity: p.a })
          await supabase.from('ml_publicaciones').update({ stock_ml: p.a, tope_aplicado: true, tope_stock_previo: p.stock_ml }).eq('id', p.id)
          await log(supabase, p.item_id, 'guardian_bajar', p.a, { stock_ml: p.stock_ml }, true, p.motivo)
        } else if (p.accion === 'restaurar') {
          await mlPut(token, `/items/${p.item_id}`, { available_quantity: p.a })
          await supabase.from('ml_publicaciones').update({ stock_ml: p.a, tope_aplicado: false, tope_stock_previo: null }).eq('id', p.id)
          await log(supabase, p.item_id, 'guardian_restaurar', p.a, { stock_ml: p.stock_ml }, true, p.motivo)
        }
        hechas.push({ item_id: p.item_id, accion: p.accion })
      } catch (e) {
        await log(supabase, p.item_id, 'guardian_' + p.accion, p.a ?? null, null, false, String(e.message || e).slice(0, 200))
      }
    }
  }
  return { resumen: resumen(ev), margenes, hechas, activo: ev.cfg.activo, en: ahoraIso }
}

// Revisión manual / semanal: disponible true|false para una publicación (por item_id)
export async function marcarDisponibilidad(supabase, token, item_id, disponible, nota = null) {
  const ahora = new Date().toISOString()
  const { data: f } = await supabase.from('ml_fichas_compra').select('item_id, variacion_id').eq('item_id', item_id)
  if (f?.length) await supabase.from('ml_fichas_compra').update({ disponible, revisada_en: ahora, revision_nota: nota }).eq('item_id', item_id)
  else await supabase.from('ml_fichas_compra').insert({ item_id, variacion_id: 0, disponible, revisada_en: ahora, revision_nota: nota, actualizada_en: ahora })
  await supabase.from('ml_publicaciones').update({ verificada_en: ahora }).eq('item_id', item_id)
  if (disponible === false) await alertar(supabase, 'agotado', item_id, nota, `Marcaste/detectaste que ya no se consigue (${nota || item_id}).`)
  if (disponible === true && token) {
    const { data: ps } = await supabase.from('ml_publicaciones').select('id, guardian_pausada').eq('item_id', item_id).eq('guardian_pausada', true)
    if (ps?.length) {
      try {
        await mlPut(token, `/items/${item_id}`, { status: 'active' })
        await supabase.from('ml_publicaciones').update({ estado_ml: 'active', guardian_pausada: false }).eq('item_id', item_id)
        await log(supabase, item_id, 'guardian_reactivar', 'active', null, true, 'Disponibilidad confirmada')
      } catch (e) { await log(supabase, item_id, 'guardian_reactivar', 'active', null, false, String(e.message).slice(0, 200)) }
    }
  }
}
