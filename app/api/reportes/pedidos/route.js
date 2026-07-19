import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const entrega_id          = searchParams.get('entrega_id')
  const cliente_id          = searchParams.get('cliente_id')
  const cliente_id_in       = searchParams.get('cliente_id_in')
  const desde               = searchParams.get('desde')
  const hasta               = searchParams.get('hasta')
  const fecha_entrega_desde = searchParams.get('fecha_entrega_desde')
  const fecha_entrega_hasta = searchParams.get('fecha_entrega_hasta')
  const estadoParam         = searchParams.get('estado')

  let baseQuery = supabase
    .from('pedidos')
    .select('*, clientes!pedidos_cliente_id_fkey(nombre, telefono)')
    .order('creado_en')

  if (entrega_id)  baseQuery = baseQuery.eq('entrega_id', entrega_id)
  if (cliente_id)  baseQuery = baseQuery.eq('cliente_id', cliente_id)
  if (estadoParam) baseQuery = baseQuery.eq('estado', estadoParam)

  if (cliente_id_in) {
    const ids = cliente_id_in.split(',').filter(Boolean)
    if (ids.length > 0) baseQuery = baseQuery.in('cliente_id', ids)
  }

  if (desde && hasta) {
    baseQuery = baseQuery.gte('creado_en', `${desde}T00:00:00`).lte('creado_en', `${hasta}T23:59:59`)
  }

  if (fecha_entrega_desde && fecha_entrega_hasta) {
    const { data: entregasRango } = await supabase
      .from('entregas')
      .select('id')
      .gte('fecha_entrega', fecha_entrega_desde)
      .lte('fecha_entrega', fecha_entrega_hasta)
    const idsEntregas = (entregasRango || []).map(e => e.id)
    if (idsEntregas.length > 0) {
      baseQuery = baseQuery.in('entrega_id', idsEntregas)
    } else {
      return NextResponse.json({ ok: true, pedidos: [] })
    }
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

  return NextResponse.json({ ok: true, pedidos: allData })
}