import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const ORIGEN = 'Paseo de los Alamos 160A, Nueva Galicia, Hermosillo, Sonora, Mexico'
const LIMITE_KM = 15

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { direccion, colonia } = await req.json()
    const destino = `${direccion}, ${colonia}, Hermosillo, Sonora, Mexico`
    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(ORIGEN)}&destinations=${encodeURIComponent(destino)}&units=metric&key=${apiKey}`

    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK') {
      return NextResponse.json({ ok: false, mensaje: 'No se pudo calcular la distancia' })
    }

    const elemento = data.rows[0].elements[0]
    if (elemento.status !== 'OK') {
      return NextResponse.json({ ok: false, mensaje: 'Dirección no encontrada' })
    }

    const distanciaKm = elemento.distance.value / 1000
    const dentroCobertura = distanciaKm <= LIMITE_KM
    const costoEnvio = distanciaKm < 7 ? 50 : 70

    return NextResponse.json({
      ok: true,
      distanciaKm: Math.round(distanciaKm * 10) / 10,
      distanciaTexto: elemento.distance.text,
      duracion: elemento.duration.text,
      costoEnvio: dentroCobertura ? costoEnvio : null,
      dentroCobertura
    })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}