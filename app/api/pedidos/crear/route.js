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

    const { data, error } = await supabase
      .from('pedidos')
      .insert([{
        cliente_id, entrega_id, descripcion, lugar_compra,
        cantidad, fecha_compra, precio_usd, tipo_cambio,
        impuesto_pct, costo_mxn, precio_venta, utilidad,
        notas, estado: 'comprado'
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, pedido: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}