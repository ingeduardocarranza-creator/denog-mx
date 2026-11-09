// Ventas de MercadoLibre (solo servidor): convierte los avisos (orders_v2 y
// shipments) en ventas, decide qué hay que comprar y mantiene el estado del
// envío (etiqueta lista o pendiente).
//
// Regla de decisión por cada producto vendido:
//   · Si la publicación está ligada a un producto del catálogo y HAY stock
//     libre (stock menos lo ya apartado) → se aparta ("reservado"). El stock
//     se descuenta hasta que el paquete se termina de empacar.
//   · Si no → entra a "Por comprar". Es urgente si la publicación prometía
//     entrega inmediata (sin días de entrega).
// Nunca se crea ni modifica un producto del catálogo desde aquí.

import { mlGet } from './api'

const CABECERA_ENVIO = { 'x-format-new': 'true' }

export function datosEnvio(e) {
  if (!e) return {}
  const estado = e.status || null
  const sub = e.substatus || null
  return {
    envio_estado: estado,
    envio_subestado: sub,
    tipo_logistica: e.logistic_type || e.logistic?.type || null,
    limite_despacho: e.shipping_option?.estimated_handling_limit?.date || e.sla?.expected_date || null,
    etiqueta_lista: estado === 'ready_to_ship' && (sub === 'ready_to_print' || sub === 'printed'),
    etiqueta_disponible_en: sub === 'buffered' ? (e.buffering?.date || e.shipping_option?.buffering?.date || null) : null,
  }
}

export async function traerEnvio(token, id) {
  const envio = await mlGet(token, `/shipments/${id}`, {}, CABECERA_ENVIO)
  // Fecha límite de despacho que da MercadoLibre (si la tiene para este envío).
  const sla = await mlGet(token, `/shipments/${id}/sla`).catch(() => null)
  if (sla?.expected_date) envio.sla = sla
  return envio
}

// Dinero real de la orden: comisión de MercadoLibre (sale_fee × piezas) y lo que
// pagas tú del envío (si MercadoLibre lo da). Nunca falla: si algo no se puede
// leer, esos campos quedan vacíos y se reintentan después.
export async function finanzasDeOrden(token, orden, envioId) {
  const lineas = orden.order_items || []
  const fees = lineas.map(l => ({ item_id: l.item?.id, variacion: l.item?.variation_id || 0, comision: l.sale_fee != null ? Number(l.sale_fee) * (Number(l.quantity) || 1) : null }))
  const comision_total = fees.every(f => f.comision != null) && fees.length ? fees.reduce((s, f) => s + f.comision, 0) : null
  let envio_costo = null
  const id = envioId || orden.shipping?.id
  if (id) {
    const c = await mlGet(token, `/shipments/${id}/costs`).catch(() => null)
    const v = c?.senders?.[0]?.cost
    if (v != null && !Number.isNaN(Number(v))) envio_costo = Number(v)
  }
  return {
    fees,
    venta: {
      total_orden: orden.total_amount != null ? Number(orden.total_amount) : null,
      // Retenciones de MercadoLibre: ISR 2.5% + IVA 8% sobre el precio sin IVA (total ÷ 1.16).
      // Cada impuesto se redondea por separado (como el panel): $465 → $42.09, $1,299 → $117.59.
      impuestos: orden.total_amount != null ? Math.round(Number(orden.total_amount) / 1.16 * 0.025 * 100) / 100 + Math.round(Number(orden.total_amount) / 1.16 * 0.08 * 100) / 100 : null,
      comision_total,
      envio_costo,
      finanzas_en: comision_total != null ? new Date().toISOString() : null,
    },
  }
}

async function guardarFinanzas(supabase, ventaId, fin) {
  await supabase.from('ml_ventas').update(fin.venta).eq('id', ventaId)
  for (const f of fin.fees) {
    if (f.comision == null || !f.item_id) continue
    await supabase.from('ml_venta_items').update({ comision: f.comision }).eq('venta_id', ventaId).eq('item_id', f.item_id).eq('variacion_id', f.variacion)
  }
}

// Completa el dinero de ventas que todavía no lo tienen (ventas anteriores).
export async function completarFinanzas(supabase, token, { max = 40 } = {}) {
  const { data: ventas } = await supabase.from('ml_ventas').select('id, order_id, shipment_id').is('finanzas_en', null).neq('empaque_estado', 'cancelada').order('fecha_venta', { ascending: false }).limit(max)
  let hechas = 0, errores = 0
  await conPool(ventas || [], 4, async (v) => {
    try {
      const orden = await mlGet(token, `/orders/${v.order_id}`)
      const fin = await finanzasDeOrden(token, orden, v.shipment_id)
      if (fin.venta.finanzas_en) { await guardarFinanzas(supabase, v.id, fin); hechas++ } else errores++
    } catch { errores++ }
  })
  return { pendientes: (ventas || []).length, hechas, errores }
}

async function conPool(lista, n, fn) {
  const salida = []
  for (let i = 0; i < lista.length; i += n) {
    salida.push(...await Promise.all(lista.slice(i, i + n).map(fn)))
  }
  return salida
}

async function liberarItems(supabase, ventaId) {
  await supabase.from('ml_venta_items')
    .update({ estado: 'cancelado', cantidad_reservada: 0 })
    .eq('venta_id', ventaId)
    .neq('estado', 'empacado')
}

async function crearItems(supabase, ventaId, orden) {
  const lineas = orden.order_items || []
  const ids = [...new Set(lineas.map(l => l.item?.id).filter(Boolean))]
  const { data: pubs } = ids.length
    ? await supabase.from('ml_publicaciones')
        .select('item_id, variacion_id, producto_id, miniatura, tiempo_preparacion, sku, titulo')
        .in('item_id', ids)
    : { data: [] }

  for (const l of lineas) {
    const it = l.item || {}
    if (!it.id) continue
    const variacion = it.variation_id || 0
    const cantidad = Math.max(1, Number(l.quantity) || 1)
    const lista = (pubs || []).filter(p => p.item_id === it.id)
    const pub = lista.find(p => Number(p.variacion_id) === Number(variacion)) || lista[0] || null

    let reservar = false
    if (pub?.producto_id) {
      const { data: prod } = await supabase.from('productos_tienda').select('stock').eq('id', pub.producto_id).maybeSingle()
      const { data: apartados } = await supabase.from('ml_venta_items')
        .select('cantidad_reservada').eq('producto_id', pub.producto_id).eq('estado', 'reservado')
      const yaApartado = (apartados || []).reduce((s, x) => s + (x.cantidad_reservada || 0), 0)
      reservar = (prod?.stock ?? 0) - yaApartado >= cantidad
    }
    const prometioInmediata = !(pub?.tiempo_preparacion > 0)

    await supabase.from('ml_venta_items').upsert({
      venta_id: ventaId,
      item_id: it.id,
      variacion_id: variacion,
      titulo: it.title || pub?.titulo || null,
      sku: it.seller_sku || it.seller_custom_field || pub?.sku || null,
      miniatura: pub?.miniatura ? String(pub.miniatura).replace(/^http:\/\//, 'https://') : null,
      cantidad,
      precio_unitario: l.unit_price ?? null,
      producto_id: pub?.producto_id || null,
      origen: reservar ? 'stock' : 'compra',
      estado: reservar ? 'reservado' : 'por_comprar',
      cantidad_reservada: reservar ? cantidad : 0,
      urgente: !reservar && prometioInmediata,
      dias_prometidos: pub?.tiempo_preparacion ?? null,
    }, { onConflict: 'venta_id,item_id,variacion_id', ignoreDuplicates: true })
  }
}

// Guarda o actualiza una orden. `envio` puede ser null (no se pudo traer):
// entonces no se tocan los datos de envío que ya hubiera.
export async function registrarOrden(supabase, orden, envio, token = null) {
  const orderId = orden.id
  const shipmentId = orden.shipping?.id || envio?.id || null
  const cancelada = ['cancelled', 'invalid'].includes(orden.status)
  const base = {
    order_id: orderId,
    pack_id: orden.pack_id || null,
    shipment_id: shipmentId,
    paquete: shipmentId ? String(shipmentId) : `o${orderId}`,
    estado_orden: orden.status || null,
    fecha_venta: orden.date_created || null,
    actualizada_en: new Date().toISOString(),
    ...(envio ? datosEnvio(envio) : {}),
  }

  const { data: existente } = await supabase.from('ml_ventas').select('id, empaque_estado').eq('order_id', orderId).maybeSingle()

  if (existente) {
    const cambios = { ...base }
    if (cancelada && existente.empaque_estado === 'pendiente') {
      cambios.empaque_estado = 'cancelada'
      await liberarItems(supabase, existente.id)
      await supabase.from('ml_eventos').insert({ venta_id: existente.id, paquete: base.paquete, tipo: 'cancelada', detalle: { estado: orden.status } })
    }
    await supabase.from('ml_ventas').update(cambios).eq('id', existente.id)
    if (token && !cancelada) { try { await guardarFinanzas(supabase, existente.id, await finanzasDeOrden(token, orden, shipmentId)) } catch {} }
    return { ventaId: existente.id, nueva: false }
  }

  // Solo se crean ventas ya pagadas; las demás se ignoran hasta que se paguen.
  if (orden.status !== 'paid') return { ignorada: true }

  const { data: nueva, error } = await supabase.from('ml_ventas').insert(base).select('id').single()
  if (error) throw new Error(error.message)
  await crearItems(supabase, nueva.id, orden)
  if (token) { try { await guardarFinanzas(supabase, nueva.id, await finanzasDeOrden(token, orden, shipmentId)) } catch {} }
  await supabase.from('ml_eventos').insert({ venta_id: nueva.id, paquete: base.paquete, tipo: 'venta_nueva', detalle: { order_id: orderId } })
  return { ventaId: nueva.id, nueva: true }
}

const idDe = (recurso, tipo) => {
  const m = String(recurso || '').match(new RegExp(`/${tipo}/(\\d+)`))
  return m ? m[1] : null
}

// Atiende los avisos pendientes (orders_v2 y shipments). Los de otros temas se
// marcan como atendidos sin hacer nada. Si algo falla, el aviso queda
// pendiente (hasta 5 intentos) con el error guardado.
export async function procesarPendientes(supabase, token, { limite = 40 } = {}) {
  const resumen = { avisos: 0, ordenes: 0, nuevas: 0, errores: 0 }
  const { data: avisos, error } = await supabase.from('ml_notificaciones')
    .select('id, topic, recurso, proc_intentos')
    .is('procesada_en', null).lt('proc_intentos', 5)
    .order('recibida_en').limit(limite)
  if (error) throw new Error(error.message)
  if (!avisos?.length) return resumen
  resumen.avisos = avisos.length

  const ahora = () => new Date().toISOString()
  const otros = avisos.filter(a => a.topic !== 'orders_v2' && a.topic !== 'shipments').map(a => a.id)
  if (otros.length) await supabase.from('ml_notificaciones').update({ procesada_en: ahora() }).in('id', otros)

  // 1) A qué órdenes se refiere cada aviso.
  const porOrden = new Map()   // orderId -> { avisos:Set, envio }
  const fallidos = new Map()   // aviso.id -> mensaje
  const anotar = (orderId, aviso, envio) => {
    const cur = porOrden.get(orderId) || { avisos: new Set(), envio: null }
    cur.avisos.add(aviso.id)
    if (envio) cur.envio = envio
    porOrden.set(orderId, cur)
  }
  await conPool(avisos.filter(a => a.topic === 'orders_v2' || a.topic === 'shipments'), 5, async (a) => {
    try {
      if (a.topic === 'orders_v2') {
        const id = idDe(a.recurso, 'orders')
        if (!id) throw new Error(`Recurso raro: ${a.recurso}`)
        anotar(id, a, null)
      } else {
        const id = idDe(a.recurso, 'shipments')
        if (!id) throw new Error(`Recurso raro: ${a.recurso}`)
        const envio = await traerEnvio(token, id)
        const lista = await mlGet(token, `/shipments/${id}/items`, {}, CABECERA_ENVIO).catch(() => [])
        const ordenes = new Set((Array.isArray(lista) ? lista : []).map(x => x.order_id).filter(Boolean).map(String))
        if (envio.order_id) ordenes.add(String(envio.order_id))
        if (!ordenes.size) throw new Error('El envío no trae órdenes')
        for (const o of ordenes) anotar(o, a, envio)
      }
    } catch (e) { fallidos.set(a.id, e.message) }
  })

  // 2) Cada orden, una sola vez.
  await conPool([...porOrden.entries()], 4, async ([orderId, info]) => {
    try {
      const orden = await mlGet(token, `/orders/${orderId}`)
      let envio = info.envio && String(info.envio.id) === String(orden.shipping?.id) ? info.envio : null
      if (!envio && orden.shipping?.id) envio = await traerEnvio(token, orden.shipping.id).catch(() => null)
      const r = await registrarOrden(supabase, orden, envio, token)
      resumen.ordenes += 1
      if (r.nueva) resumen.nuevas += 1
    } catch (e) {
      for (const idAviso of info.avisos) fallidos.set(idAviso, e.message)
    }
  })

  // 3) Marcar resultado.
  const buenos = avisos.filter(a => (a.topic === 'orders_v2' || a.topic === 'shipments') && !fallidos.has(a.id)).map(a => a.id)
  if (buenos.length) await supabase.from('ml_notificaciones').update({ procesada_en: ahora(), error: null }).in('id', buenos)
  for (const [id, msg] of fallidos) {
    const previo = avisos.find(a => a.id === id)?.proc_intentos || 0
    await supabase.from('ml_notificaciones').update({ error: String(msg).slice(0, 300), proc_intentos: previo + 1 }).eq('id', id)
  }
  resumen.errores = fallidos.size
  return resumen
}

// Red de seguridad: trae las ventas de los últimos días directo de la API por
// si algún aviso no llegó. Procesa como máximo `max` órdenes por llamada.
export async function traerVentasRecientes(supabase, token, userId, { dias = 14, max = 60 } = {}) {
  const resumen = { revisadas: 0, nuevas: 0, errores: 0, primer_error: null }
  const desde = new Date(Date.now() - dias * 86400000).toISOString()
  const ordenes = []
  for (let offset = 0; offset < max; offset += 50) {
    const r = await mlGet(token, '/orders/search', {
      seller: String(userId), 'order.date_created.from': desde, sort: 'date_desc', limit: '50', offset: String(offset),
    })
    ordenes.push(...(r.results || []))
    if ((r.results || []).length < 50) break
  }
  const lote = ordenes.slice(0, max)
  const { data: previas } = lote.length
    ? await supabase.from('ml_ventas').select('order_id, empaque_estado').in('order_id', lote.map(o => o.id))
    : { data: [] }
  const cerradas = new Set((previas || []).filter(v => v.empaque_estado !== 'pendiente').map(v => String(v.order_id)))

  await conPool(lote.filter(o => !cerradas.has(String(o.id))), 4, async (orden) => {
    try {
      const envio = orden.shipping?.id ? await traerEnvio(token, orden.shipping.id).catch(() => null) : null
      const r = await registrarOrden(supabase, orden, envio, token)
      resumen.revisadas += 1
      if (r.nueva) resumen.nuevas += 1
    } catch (e) {
      resumen.errores += 1
      resumen.primer_error = resumen.primer_error || e.message
    }
  })
  return resumen
}
