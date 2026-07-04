import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  let query = supabase
    .from('ventas_tienda')
    .select('*, clientes!ventas_tienda_vendedor_id_fkey(nombre), productos_tienda(stock), pagos!ventas_tienda_pago_id_fkey(metodo)')

  if (desde) query = query.gte('creado_en', `${desde}T00:00:00`)
  if (hasta) query = query.lte('creado_en', `${hasta}T23:59:59`)

  const { data, error } = await query.order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, ventas: data || [] })
}
