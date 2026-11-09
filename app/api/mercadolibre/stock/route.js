import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { enviarStock } from '@/lib/mercadolibre/stock'

export const maxDuration = 60

// POST { id, accion: 'ahora' }                → manda el stock del catálogo a esa publicación
// POST { id, accion: 'auto', valor: true|false } → enciende/apaga la sincronización automática
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const supabase = clienteSupabaseServicio()
  const { data: pub } = await supabase.from('ml_publicaciones').select('*').eq('id', b.id).maybeSingle()
  if (!pub) return NextResponse.json({ ok: false, mensaje: 'No encontré esa publicación' })

  if (b.accion === 'auto') {
    const valor = b.valor === true
    if (valor && (!pub.producto_id || pub.liga_estado !== 'ligada')) return NextResponse.json({ ok: false, mensaje: 'Primero liga la publicación a un producto del catálogo.' })
    if (valor && pub.variacion_id) return NextResponse.json({ ok: false, mensaje: 'Las publicaciones con variantes no se sincronizan todavía.' })
    const { error } = await supabase.from('ml_publicaciones').update({ sync_stock: valor }).eq('id', pub.id)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    await supabase.from('ml_acciones').insert({ item_id: pub.item_id, accion: valor ? 'stock_auto_on' : 'stock_auto_off', valor: String(valor), ok: true, hecho_por: sesion.id })
    return NextResponse.json({ ok: true })
  }
  if (b.accion === 'ahora') {
    let token
    try { ({ token } = await obtenerAcceso(supabase)) } catch (e) { return NextResponse.json({ ok: false, mensaje: e.message }) }
    const r = await enviarStock(supabase, token, pub, { por: sesion.id })
    return NextResponse.json(r)
  }
  return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
}
