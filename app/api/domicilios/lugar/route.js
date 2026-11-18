import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { dentroDeHermosillo } from '@/lib/domicilios/geocodificar'

// POST { placeId, token } -> calle y número, colonia y coordenadas exactas del lugar elegido.
// Esta llamada cierra la sesión de autocompletado (solo campos "Essentials").
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { placeId, token } = await req.json()
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey || !placeId) return NextResponse.json({ ok: false, mensaje: 'Faltan datos' })

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es&sessionToken=${encodeURIComponent(token || '')}`
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'location,addressComponents,formattedAddress' },
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ ok: false, mensaje: data?.error?.message || 'No se pudo leer el lugar' })

    const lat = data.location?.latitude
    const lng = data.location?.longitude
    if (lat == null || !dentroDeHermosillo(lat, lng)) return NextResponse.json({ ok: false, mensaje: 'Esa dirección no está en Hermosillo' })

    const comp = (tipo) => (data.addressComponents || []).find((c) => c.types?.includes(tipo))?.longText || ''
    const calle = comp('route')
    const numero = comp('street_number')
    const colonia = comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood')

    return NextResponse.json({
      ok: true,
      direccion: [calle, numero].filter(Boolean).join(' ').trim(),
      colonia,
      lat, lng,
      formateada: data.formattedAddress || '',
    })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
