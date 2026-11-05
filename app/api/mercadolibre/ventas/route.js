import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { fechaLimite } from '@/lib/mercadolibre/fechas'

// Lista "Por comprar (MercadoLibre)" (solo admin): lo vendido que falta
// comprar ("por_comprar") y lo ya comprado que viene en camino ("comprado").
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()

  const { data: items, error } = await supabase
    .from('ml_venta_items')
    .select('id, venta_id, item_id, variacion_id, titulo, sku, miniatura, cantidad, precio_unitario, producto_id, estado, urgente, comprado_en, llego_en, dias_prometidos, venta:ml_ventas!inner(order_id, paquete, fecha_venta, limite_despacho, empaque_estado)')
    .in('estado', ['por_comprar', 'comprado'])
    .eq('venta.empaque_estado', 'pendiente')
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const ids = [...new Set((items || []).map(i => i.item_id))]
  const { data: fichas } = ids.length
    ? await supabase.from('ml_fichas_compra').select('*').in('item_id', ids)
    : { data: [] }
  const productoIds = [...new Set((items || []).map(i => i.producto_id).filter(Boolean))]
  const { data: productos } = productoIds.length
    ? await supabase.from('productos_tienda').select('id, costo_usd').in('id', productoIds)
    : { data: [] }

  const salida = (items || []).map(i => {
    const ficha = (fichas || []).find(f => f.item_id === i.item_id && Number(f.variacion_id) === Number(i.variacion_id)) || null
    const prod = (productos || []).find(p => p.id === i.producto_id)
    return {
      id: i.id, item_id: i.item_id, variacion_id: i.variacion_id, titulo: i.titulo, sku: i.sku,
      miniatura: i.miniatura, cantidad: i.cantidad, precio_unitario: i.precio_unitario,
      estado: i.estado, urgente: i.urgente, comprado_en: i.comprado_en,
      order_id: i.venta?.order_id, fecha_venta: i.venta?.fecha_venta, dias_prometidos: i.dias_prometidos,
      limite: fechaLimite({ limite_despacho: i.venta?.limite_despacho, fecha_venta: i.venta?.fecha_venta }, i.dias_prometidos),
      ficha: ficha ? { tienda: ficha.tienda, enlace_compra: ficha.enlace_compra, costo_usd: ficha.costo_usd, notas: ficha.notas } : null,
      costo_catalogo_usd: prod?.costo_usd ?? null,
    }
  })
  // Lo más urgente primero: por fecha límite y luego por antigüedad de la venta.
  salida.sort((a, b) =>
    String(a.limite?.dia || '9999').localeCompare(String(b.limite?.dia || '9999')) ||
    String(a.fecha_venta || '').localeCompare(String(b.fecha_venta || '')))
  return NextResponse.json({ ok: true, items: salida })
}
