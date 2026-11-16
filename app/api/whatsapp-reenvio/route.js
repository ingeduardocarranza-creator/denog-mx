import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Reenvío programado de la venta por WhatsApp. Aquí Lalo marca los días de
// venta y los destinos; el agente de Claude en la Mac lee estas tablas, hace
// el reenvío en WhatsApp Web y anota el resultado (whatsapp_reenvio_envios).
// Ver claude/manual-reenvio-whatsapp-grupos.md. Sólo admin.

// Día calendario en Hermosillo (UTC-7 todo el año, sin horario de verano).
const hoyHermosillo = () => new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10)
const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const esHora = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const noAutorizado = () => NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

export async function GET(req) {
  if (!requerirAdmin(req)) return noAutorizado()

  const hoy = hoyHermosillo()
  const [config, dias, envios] = await Promise.all([
    supabase.from('whatsapp_reenvio_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('whatsapp_reenvio_dias').select('fecha, hora')
      .gte('fecha', sumarDias(hoy, -14)).lte('fecha', sumarDias(hoy, 120)).order('fecha'),
    supabase.from('whatsapp_reenvio_envios')
      .select('id, ejecutado_en, fecha, resultado, fijos, productos, destinos, detalle')
      .order('ejecutado_en', { ascending: false }).limit(60),
  ])

  const error = config.error || dias.error || envios.error
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  return NextResponse.json({
    ok: true,
    hoy,
    config: config.data || {
      pausado: false, hora_default: '08:30', destino_grupo1: true, destino_grupo2: true,
      destino_estado: true, buzon_pendientes: null, buzon_revisado_en: null,
    },
    dias: (dias.data || []).map(d => ({ fecha: d.fecha, hora: String(d.hora).slice(0, 5) })),
    envios: envios.data || [],
  })
}

export async function POST(req) {
  if (!requerirAdmin(req)) return noAutorizado()

  let body
  try { body = await req.json() } catch { body = null }
  if (!body) return NextResponse.json({ ok: false, mensaje: 'Solicitud inválida' }, { status: 400 })

  // Marcar o quitar un día de venta, o cambiarle la hora.
  if (body.accion === 'dia') {
    if (!esFecha(body.fecha)) return NextResponse.json({ ok: false, mensaje: 'Fecha inválida' }, { status: 400 })
    if (body.fecha < hoyHermosillo()) {
      return NextResponse.json({ ok: false, mensaje: 'Ese día ya pasó' }, { status: 400 })
    }
    if (body.activo === false) {
      const { error } = await supabase.from('whatsapp_reenvio_dias').delete().eq('fecha', body.fecha)
      if (error) return NextResponse.json({ ok: false, mensaje: error.message })
      return NextResponse.json({ ok: true })
    }
    let hora = body.hora
    if (!esHora(hora)) {
      const { data } = await supabase.from('whatsapp_reenvio_config').select('hora_default').eq('id', 1).maybeSingle()
      hora = data?.hora_default ? String(data.hora_default).slice(0, 5) : '08:30'
    }
    const { error } = await supabase.from('whatsapp_reenvio_dias').upsert({ fecha: body.fecha, hora }, { onConflict: 'fecha' })
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, hora })
  }

  // Pausa, destinos y hora por defecto.
  if (body.accion === 'config') {
    const cambios = { actualizado_en: new Date().toISOString() }
    for (const k of ['pausado', 'destino_grupo1', 'destino_grupo2', 'destino_estado']) {
      if (typeof body[k] === 'boolean') cambios[k] = body[k]
    }
    if (body.hora_default !== undefined) {
      if (!esHora(body.hora_default)) return NextResponse.json({ ok: false, mensaje: 'Hora inválida' }, { status: 400 })
      cambios.hora_default = body.hora_default
    }
    const { error } = await supabase.from('whatsapp_reenvio_config').upsert({ id: 1, ...cambios }, { onConflict: 'id' })
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
}
