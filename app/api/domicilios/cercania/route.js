import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { geocodificar, dentroDeHermosillo } from '@/lib/domicilios/geocodificar'
import { haversineKm, ordenarRuta, estimarHoras } from '@/lib/domicilios/ruta'

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

// POST { direccion, colonia, fecha_preferida, horario, hora_exacta }
// Dice qué tan cargada está esa ventana, qué hay cerca y si el tiempo alcanza.
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { direccion, colonia, entre_calles, fecha_preferida, horario, hora_exacta, lat: latPin, lng: lngPin } = await req.json()
    if (!direccion || !colonia || !fecha_preferida || !horario) return NextResponse.json({ ok: false, mensaje: 'Faltan datos' })

    const pinValido = typeof latPin === 'number' && typeof lngPin === 'number' && dentroDeHermosillo(latPin, lngPin)
    const [geo, origen] = await Promise.all([
      pinValido ? Promise.resolve({ lat: latPin, lng: lngPin, preciso: true }) : geocodificar({ direccion, colonia, entre_calles }),
      origenTienda(),
    ])
    if (!geo) return NextResponse.json({ ok: true, ubicada: false })

    const { data: dia } = await supabase
      .from('domicilios')
      .select('id, lat, lng, horario, hora_exacta, orden_ruta, estado')
      .eq('fecha_preferida', fecha_preferida)
      .in('estado', ['pendiente', 'confirmado', 'en_camino'])
    const existentes = (dia || []).filter((d) => d.lat != null)

    const mismaVentana = existentes.filter((d) => d.horario === horario)
    const cercanos = mismaVentana.filter((d) => haversineKm({ lat: geo.lat, lng: geo.lng }, d) <= 2)
    const masCercano = mismaVentana.length
      ? Math.min(...mismaVentana.map((d) => haversineKm({ lat: geo.lat, lng: geo.lng }, d)))
      : null

    const nueva = { id: 'nueva', lat: geo.lat, lng: geo.lng, horario, hora_exacta: hora_exacta || null, orden_ruta: null }
    const todas = [...existentes.map((d) => ({ ...d, orden_ruta: null })), nueva]
    const ordenadas = ordenarRuta(todas, origen)
    const horas = estimarHoras(ordenadas, origen)
    const tarde = horas.filter((p) => p.tarde)

    return NextResponse.json({
      ok: true,
      ubicada: true,
      preciso: geo.preciso,
      total_en_ventana: mismaVentana.length,
      cercanos: cercanos.length,
      mas_cercano_km: masCercano != null ? Math.round(masCercano * 10) / 10 : null,
      alcanza: tarde.length === 0,
      tarde_nueva: tarde.some((p) => p.id === 'nueva'),
      paradas_tarde: tarde.length,
    })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
