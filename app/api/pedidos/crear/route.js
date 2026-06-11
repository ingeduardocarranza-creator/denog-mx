import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      cliente_id, entrega_id, descripcion, lugar_compra,
      cantidad, fecha_compra, precio_usd, tipo_cambio,
      impuesto_pct, costo_mxn, precio_venta, utilidad, notas
    } = body

    // Validar que la entrega no esté completamente entregada
    if (entrega_id && cliente_id) {
      const { data: pedidosEntrega } = await supabase
        .from('pedidos')
        .select('estado')
        .eq('cliente_id', cliente_id)
        .eq('entrega_id', entrega_id)

      if (pedidosEntrega && pedidosEntrega.length > 0) {
        const todosEntregados = pedidosEntrega.every(p => p.estado?.toLowerCase() === 'entregado')
        if (todosEntregados) {
          return NextResponse.json({
            ok: false,
            mensaje: 'No se pueden agregar pedidos a una entrega que ya fue completamente entregada y pagada.'
          })
        }
      }
    }

    const { data, error } = await supabase
      .from('pedidos')
      .insert([{
        vendedor_id: body.vendedor_id || null,
        cliente_id, entrega_id, descripcion, lugar_compra,
        cantidad, fecha_compra, precio_usd, tipo_cambio,
        impuesto_pct, costo_mxn, precio_venta, utilidad,
        notas, categoria: body.categoria || null, estado: 'comprado'
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, pedido: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}