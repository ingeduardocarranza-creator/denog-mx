import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const entrega_id = searchParams.get('entrega_id')
  const cliente_id = searchParams.get('cliente_id')
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  let query = supabase
    .from('pagos')
    .select('*, clientes!pagos_cliente_id_fkey(nombre)')
    .order('creado_en')
    .range(0, 9999)

  if (entrega_id) query = query.eq('entrega_id', entrega_id)
  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  if (desde && hasta) {
    query = query.gte('creado_en', `${desde}T00:00:00`).lte('creado_en', `${hasta}T23:59:59`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, pagos: data })
}