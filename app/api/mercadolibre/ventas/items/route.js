import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

// Cambia el estado de productos de la lista "Por comprar" (solo admin):
//   comprado  → ya lo compraste (va en camino a Hermosillo)
//   llego     → ya está en Hermosillo; desde aquí lo ven los colaboradores
//   deshacer  → regresa un paso
export async function PATCH(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Number.isInteger) : []
  if (!ids.length || ids.length > 100) return NextResponse.json({ ok: false, mensaje: 'Elige entre 1 y 100 productos' }, { status: 400 })
  const por = sesion.nombre || String(sesion.id)
  const ahora = new Date().toISOString()
  const supabase = clienteSupabaseServicio()

  const pasos = {
    comprado: { de: ['por_comprar'], a: { estado: 'comprado', comprado_en: ahora, comprado_por: por } },
    llego:    { de: ['comprado'],    a: { estado: 'disponible', llego_en: ahora } },
    deshacer_comprado: { de: ['comprado'], a: { estado: 'por_comprar', comprado_en: null, comprado_por: null } },
    deshacer_llego:    { de: ['disponible'], a: { estado: 'comprado', llego_en: null } },
  }
  const paso = pasos[b.accion]
  if (!paso) return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })

  const { data, error } = await supabase.from('ml_venta_items')
    .update(paso.a).in('id', ids).in('estado', paso.de).select('id, venta_id')
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  if (data?.length) {
    await supabase.from('ml_eventos').insert(data.map(x => ({
      venta_id: x.venta_id, tipo: b.accion, detalle: { item_row: x.id }, hecho_por: por,
    })))
  }
  return NextResponse.json({ ok: true, cambiados: data?.length || 0 })
}
