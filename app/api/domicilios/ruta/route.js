import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { geocodificar, ORIGEN_TIENDA } from '@/lib/domicilios/geocodificar'
import { ordenarRuta, estimarHoras } from '@/lib/domicilios/ruta'
import { generarEnlaces } from '@/lib/domicilios/enlaceMaps'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

let origenCache = null
async function origenTienda() {
  if (origenCache) return origenCache
  const g = await geocodificar({ direccion: 'Paseo de los Alamos 160A', colonia: 'Nueva Galicia' })
  if (g) origenCache = { lat: g.lat, lng: g.lng }
  return origenCache
}

// GET ?fecha=YYYY-MM-DD  -> orden, hora estimada de llegada y enlaces de Google Maps
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const fecha = new URL(req.url).searchParams.get('fecha')
  if (!fecha) return NextResponse.json({ ok: false, mensaje: 'Falta la fecha' })

  const { data, error } = await supabase
    .from('domicilios')
    .select('id, lat, lng, horario, hora_exacta, orden_ruta, estado')
    .eq('fecha_preferida', fecha)
    .in('estado', ['pendiente', 'confirmado', 'en_camino'])
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const origen = await origenTienda()
  const ubicados = (data || []).filter((d) => d.lat != null && d.lng != null)
  const sinUbicar = (data || []).filter((d) => d.lat == null || d.lng == null).map((d) => d.id)

  const ordenadas = ordenarRuta(ubicados, origen)
  const horas = estimarHoras(ordenadas, origen)
  const enlaces = generarEnlaces(ORIGEN_TIENDA.texto, horas)

  return NextResponse.json({
    ok: true,
    paradas: horas.map((p, i) => ({ id: p.id, orden: i + 1, llegadaMin: p.llegadaMin, tarde: p.tarde, manual: p.orden_ruta != null })),
    sin_ubicar: sinUbicar,
    enlaces,
  })
}
