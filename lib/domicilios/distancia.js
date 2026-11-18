// Distancia en carro desde la tienda hasta el domicilio (Google Distance Matrix).
// $50 hasta 5 km, $70 de 5.1 km en adelante, y más de 15 km queda fuera de
// cobertura. Si hay coordenadas exactas se usan; si no, la dirección escrita.
const ORIGEN = 'Paseo de los Alamos 160A, Nueva Galicia, Hermosillo, Sonora, Mexico'
export const LIMITE_KM = 15

export async function calcularDistanciaTienda({ direccion, colonia, lat, lng }) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return null
    const destino = typeof lat === 'number' && typeof lng === 'number'
      ? `${lat},${lng}`
      : `${direccion}, ${colonia}, Hermosillo, Sonora, Mexico`
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(ORIGEN)}&destinations=${encodeURIComponent(destino)}&units=metric&key=${apiKey}`
    const data = await fetch(url).then(r => r.json())
    const el = data?.rows?.[0]?.elements?.[0]
    if (data?.status !== 'OK' || el?.status !== 'OK') return null
    const km = Math.round((el.distance.value / 1000) * 10) / 10
    return { km, dentroCobertura: km <= LIMITE_KM, costoSugerido: km <= LIMITE_KM ? (km <= 5 ? 50 : 70) : null }
  } catch { return null }
}
