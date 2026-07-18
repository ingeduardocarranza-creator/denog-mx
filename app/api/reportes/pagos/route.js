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

  let baseQuery = supabase
    .from('pagos')
    .select('*, clientes!pagos_cliente_id_fkey(nombre)')
    .order('creado_en')

  if (entrega_id) baseQuery = baseQuery.eq('entrega_id', entrega_id)
  if (cliente_id) baseQuery = baseQuery.eq('cliente_id', cliente_id)

  if (desde && hasta) {
    baseQuery = baseQuery.gte('creado_en', `${desde}T00:00:00`).lte('creado_en', `${hasta}T23:59:59`)
  }

  // Paginar para superar el max_rows=1000 de PostgREST
  const PAGE = 1000
  let allData = []
  let from = 0
  while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    allData = allData.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  return NextResponse.json({ ok: true, pagos: allData })
}