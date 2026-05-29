import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  const fecha = searchParams.get('fecha')

  let query = supabase
    .from('domicilios')
    .select('*, clientes(nombre, telefono)')
    .order('creado_en', { ascending: false })

  if (cliente_id) query = query.eq('cliente_id', cliente_id)
  if (fecha) query = query.eq('fecha_preferida', fecha)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const domiciliosConProductos = await Promise.all(
    data.map(async (d) => {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('descripcion, precio_venta, cantidad, entrega_id')
        .eq('cliente_id', d.cliente_id)
        .in('entrega_id', d.entrega_ids || [])

      const { data: anticipos } = await supabase
        .from('pagos')
        .select('monto, creado_en, entrega_id')
        .eq('cliente_id', d.cliente_id)
        .ilike('tipo', 'anticipo')
        .in('entrega_id', d.entrega_ids || [])
        .order('creado_en', { ascending: true })

      return {
        ...d,
        productos_detalle: pedidos || [],
        anticipos_detalle: anticipos || []
      }
    })
  )

  return NextResponse.json({ ok: true, domicilios: domiciliosConProductos })
}