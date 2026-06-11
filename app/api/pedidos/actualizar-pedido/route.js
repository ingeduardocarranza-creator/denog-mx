import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function PUT(req) {
  const { id, cliente_id, entrega_id, descripcion, lugar_compra, cantidad, fecha_compra,
    precio_usd, tipo_cambio, impuesto_pct, costo_mxn, precio_venta, utilidad, notas, estado, vendedor_id, categoria } = await req.json()

  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { data, error } = await supabase
    .from('pedidos')
    .update({ cliente_id, entrega_id, descripcion, lugar_compra, cantidad, fecha_compra,
      precio_usd, tipo_cambio, impuesto_pct, costo_mxn, precio_venta, utilidad, notas, estado, vendedor_id, categoria })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, pedido: data })
}

export async function DELETE(req) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
