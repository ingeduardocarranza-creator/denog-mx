// Convierte una dirección en coordenadas con la misma llave de Google que ya
// usa /api/domicilios/distancia. Nunca lanza: si falla devuelve null y el
// domicilio se guarda igual (la pantalla de ruta lo marcará como "sin ubicar").

// Caja aproximada de Hermosillo, para descartar resultados que Google
// resuelva en otra ciudad por error.
const CAJA_HERMOSILLO = { latMin: 28.90, latMax: 29.30, lngMin: -111.20, lngMax: -110.80 }

export const ORIGEN_TIENDA = {
  texto: 'Paseo de los Alamos 160A, Nueva Galicia, Hermosillo, Sonora, Mexico',
}

export function dentroDeHermosillo(lat, lng) {
  return lat >= CAJA_HERMOSILLO.latMin && lat <= CAJA_HERMOSILLO.latMax &&
         lng >= CAJA_HERMOSILLO.lngMin && lng <= CAJA_HERMOSILLO.lngMax
}

async function buscar(texto) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const q = encodeURIComponent(texto)
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&components=country:MX|administrative_area:Sonora&region=mx&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.length) return null
  const r = data.results[0]
  const { lat, lng } = r.geometry.location
  if (!dentroDeHermosillo(lat, lng)) return null
  // 'ROOFTOP'/'RANGE_INTERPOLATED' = calle y número; 'GEOMETRIC_CENTER'/'APPROXIMATE' = solo colonia o calle
  const preciso = ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(r.geometry.location_type)
  return { lat, lng, preciso, formateada: r.formatted_address }
}

// Busca la dirección: primero calle y número + colonia. Si Google solo ubica
// la colonia (no la calle exacta) y hay "entre calles", prueba con la esquina.
export async function geocodificar({ direccion, colonia, entre_calles }) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !direccion) return null
  try {
    const base = [colonia && `Col. ${colonia}`, 'Hermosillo', 'Sonora', 'México'].filter(Boolean).join(', ')
    const primera = await buscar(`${direccion}, ${base}`)
    if (primera?.preciso || !entre_calles) return primera

    const calleSinNumero = String(direccion).replace(/\s*(#|no\.?|num\.?|número)?\s*\d+[a-zA-Z]?\s*$/i, '').trim()
    const primeraCruce = String(entre_calles).split(/\s+y\s+|\s*\/\s*|\s*,\s*/i)[0]?.trim()
    if (calleSinNumero && primeraCruce) {
      const esquina = await buscar(`${calleSinNumero} y ${primeraCruce}, ${base}`)
      if (esquina) return { ...esquina, preciso: true }   // la esquina es mejor que el centro de la colonia
    }
    return primera
  } catch {
    return null
  }
}
