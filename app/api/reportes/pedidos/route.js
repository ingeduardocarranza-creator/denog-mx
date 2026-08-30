import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlFirmada } from '@/lib/whatsapp/media'

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

  // "Por aprobar" (Encargos/Pedidos): borradores que llegaron por WhatsApp y
  // todavía no se revisan. Fuera de esa pestaña, nunca se mezclan con la
  // vista normal — por eso el filtro de pendiente_aprobacion=false va por
  // default y hay que pedir explícitamente lo contrario.
  const pendienteAprobacionParam = searchParams.get('pendiente_aprobacion')
  if (pendienteAprobacionParam === 'true') {
    baseQuery = baseQuery.eq('pendiente_aprobacion', true).neq('estado', 'descartado')
  } else {
    baseQuery = baseQuery.eq('pendiente_aprobacion', false)
  }

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

  // imagen_url de los pedidos manuales es pública (bucket de catálogo); la
  // de los que llegan por WhatsApp es una ruta dentro del bucket privado
  // 'whatsapp-media' (mismo criterio que /api/pendientes) — hay que
  // convertirla a URL firmada antes de mandarla al navegador.
  // OJO: se manda en un campo aparte (imagen_url_firmada) a propósito.
  // imagen_url sigue siendo la ruta permanente en storage — si el panel la
  // mandara de vuelta al guardar, se perdería la ruta real y quedaría
  // guardada una URL firmada que expira.
  const pedidosConFoto = await Promise.all(allData.map(async p => {
    if (!p.imagen_url || p.imagen_url.startsWith('http')) return { ...p, imagen_url_firmada: p.imagen_url }
    return { ...p, imagen_url_firmada: await urlFirmada(supabase, p.imagen_url, 3600) }
  }))

  return NextResponse.json({ ok: true, pedidos: pedidosConFoto })
}