import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

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
  // Firmar cuesta una consulta a la base por foto. Cuatro pantallas que usan
  // esta API —Entregas, Estados de cuenta, Colaboradores y Reportes— no
  // muestran ni una sola foto, y aun así estaban pagando el precio de firmar
  // las 384 de la entrega. Con ?fotos=no se saltan ese trabajo.
  if (searchParams.get('fotos') === 'no') {
    return NextResponse.json({ ok: true, pedidos: allData })
  }

  // Cómo se pegó el cliente a esta foto: por RESPUESTA (el texto citaba la
  // foto — enlace exacto, no hay nada que revisar) o por ORDEN (se dedujo de
  // la secuencia de llegada — puede estar mal). Importa sobre todo cuando
  // varias personas mandan al mismo tiempo desde el celular de Denog: ahí
  // todos los mensajes llegan bajo el mismo número y el orden no separa a
  // nadie. Ver claude/whatsapp-ecos-smb-hallazgo.md.
  if (pendienteAprobacionParam === 'true' && allData.length > 0) {
    const { data: origenes } = await supabase
      .from('whatsapp_ventas_bandeja')
      .select('pedido_id, responde_a, clase, telefono')
      .in('pedido_id', allData.map(p => p.id))
    const filas = origenes || []
    const porRespuesta = new Set(filas.filter(o => o.clase === 'texto' && o.responde_a).map(o => o.pedido_id))
    const conTexto = new Set(filas.filter(o => o.clase === 'texto').map(o => o.pedido_id))

    // De qué bitácora vino cada venta. Eduardo revisa conversación por
    // conversación —entra a una, aprueba todo lo de ahí, y luego a la otra—
    // así que la pantalla las separa en pestañas. La etiqueta vive en la lista
    // blanca para que dar de alta una bitácora nueva no requiera tocar código.
    const bitacoraDe = new Map(filas.map(o => [o.pedido_id, o.telefono]))
    const { data: destinos } = await supabase
      .from('vendedores_whatsapp_ventas')
      .select('telefono, etiqueta')
      .eq('origen', 'eco')
    const etiquetas = new Map((destinos || []).map(d => [d.telefono, d.etiqueta]))

    for (const p of allData) {
      p.emparejado_por = porRespuesta.has(p.id) ? 'respuesta' : (conTexto.has(p.id) ? 'orden' : null)
      const tel = bitacoraDe.get(p.id) || null
      p.bitacora = tel
      p.bitacora_etiqueta = tel ? (etiquetas.get(tel) || tel) : null
    }
  }

  // Una sola llamada para todas las fotos de la entrega, no una por pedido:
  // con 384 fotos, firmar de a una saturaba Storage y ~14 volvían sin firmar.
  const firmadas = await urlsFirmadas(supabase, allData.map(p => p.imagen_url), 3600)
  const pedidosConFoto = allData.map(p => ({
    ...p,
    imagen_url_firmada: !p.imagen_url ? null
      : p.imagen_url.startsWith('http') ? p.imagen_url
      : (firmadas[p.imagen_url] || null),
  }))

  return NextResponse.json({ ok: true, pedidos: pedidosConFoto })
}