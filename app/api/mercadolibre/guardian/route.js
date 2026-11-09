import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { evaluar, resumen, correr, leerConfig, marcarDisponibilidad } from '@/lib/mercadolibre/guardian'

export const maxDuration = 60

// GET: estado del guardián (config, conteos de semáforo, qué haría, avisos).
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const ev = await evaluar(supabase)
  const { data: avisos } = await supabase.from('ml_alertas').select('*').is('vista_en', null).order('creada_en', { ascending: false }).limit(30)
  const rojas = ev.filas.filter(f => ['rojo', 'agotado'].includes(f.riesgo)).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999)).slice(0, 40)
    .map(f => ({ item_id: f.item_id, titulo: f.titulo, riesgo: f.riesgo, motivo: f.motivo, stock_ml: f.stock_ml }))
  return NextResponse.json({ ok: true, config: ev.cfg, resumen: resumen(ev), avisos: avisos || [], rojas })
}

// POST: { accion: 'config', activo, ... } | 'correr' | 'disponible' {item_id, disponible, nota} | 'visto' {id|todos}
export async function POST(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const supabase = clienteSupabaseServicio()
  if (b.accion === 'config') {
    const cambios = { actualizado_en: new Date().toISOString() }
    if (typeof b.activo === 'boolean') cambios.activo = b.activo
    for (const k of ['dias_sin_comprar', 'tope_piezas', 'verde_dias', 'amarillo_dias']) {
      if (b[k] != null) { const n = Number(b[k]); if (Number.isInteger(n) && n >= 1 && n <= 365) cambios[k] = n }
    }
    const { error } = await supabase.from('ml_guardian_config').update(cambios).eq('id', 1)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    // Al encender, aplicar de inmediato (el admin ya vio el conteo previo).
    if (cambios.activo === true) {
      try { const { token } = await obtenerAcceso(supabase); const r = await correr(supabase, token); return NextResponse.json({ ok: true, ...r }) }
      catch (e) { return NextResponse.json({ ok: false, mensaje: e.message }) }
    }
    return NextResponse.json({ ok: true, config: await leerConfig(supabase) })
  }
  if (b.accion === 'correr') {
    try { const { token } = await obtenerAcceso(supabase); return NextResponse.json({ ok: true, ...(await correr(supabase, token)) }) }
    catch (e) { return NextResponse.json({ ok: false, mensaje: e.message }) }
  }
  if (b.accion === 'disponible') {
    if (!/^MLM\d+$/.test(String(b.item_id || ''))) return NextResponse.json({ ok: false, mensaje: 'Publicación inválida' }, { status: 400 })
    let token = null
    try { ({ token } = await obtenerAcceso(supabase)) } catch {}
    await marcarDisponibilidad(supabase, token, b.item_id, Boolean(b.disponible), b.nota ? String(b.nota).slice(0, 200) : null)
    if (b.disponible === false && (await leerConfig(supabase)).activo && token) await correr(supabase, token)
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'visto') {
    const q = supabase.from('ml_alertas').update({ vista_en: new Date().toISOString() })
    const { error } = b.id ? await q.eq('id', b.id) : await q.is('vista_en', null)
    return NextResponse.json({ ok: !error, mensaje: error?.message })
  }
  return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
}
