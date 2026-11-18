import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

// POST { q, token } -> sugerencias de direcciones de Hermosillo (Google Places Autocomplete, API nueva).
// El token de sesión agrupa lo que se teclea con la selección final (ver /api/domicilios/lugar).
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { q, token } = await req.json()
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, mensaje: 'Falta la llave de Google Maps' })
    if (!q || q.trim().length < 3) return NextResponse.json({ ok: true, sugerencias: [] })

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({
        input: q.trim(),
        sessionToken: token,
        languageCode: 'es',
        regionCode: 'mx',
        includedRegionCodes: ['mx'],
        locationRestriction: {
          rectangle: {
            low: { latitude: 28.90, longitude: -111.20 },
            high: { latitude: 29.30, longitude: -110.80 },
          },
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      const motivo = data?.error?.message || 'Google rechazó la búsqueda'
      return NextResponse.json({ ok: false, mensaje: motivo })
    }
    const sugerencias = (data.suggestions || [])
      .filter((s) => s.placePrediction)
      .map((s) => ({
        placeId: s.placePrediction.placeId,
        principal: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || '',
        secundario: s.placePrediction.structuredFormat?.secondaryText?.text || '',
      }))
    return NextResponse.json({ ok: true, sugerencias })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
