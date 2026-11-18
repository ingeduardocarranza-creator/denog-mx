// Enlaces de Google Maps con varias paradas (gratis, sin API).
// Google acepta como máximo 9 paradas intermedias + el destino por enlace,
// así que una ruta larga se parte en tramos que se encadenan.

export const MAX_PARADAS_ENLACE = 10

export function generarEnlaces(origenTexto, paradas) {
  const enlaces = []
  let desde = origenTexto
  for (let i = 0; i < paradas.length; i += MAX_PARADAS_ENLACE) {
    const tramo = paradas.slice(i, i + MAX_PARADAS_ENLACE)
    const destino = tramo[tramo.length - 1]
    const intermedias = tramo.slice(0, -1)
    const coord = (p) => `${p.lat},${p.lng}`
    const params = new URLSearchParams({
      api: '1',
      origin: typeof desde === 'string' ? desde : coord(desde),
      destination: coord(destino),
      travelmode: 'driving',
    })
    if (intermedias.length) params.set('waypoints', intermedias.map(coord).join('|'))
    enlaces.push({
      numero: enlaces.length + 1,
      paradas: tramo.length,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    })
    desde = destino
  }
  return enlaces
}

// Saca lat/lng de un enlace de Google Maps pegado a mano.
export function coordenadasDeEnlace(url) {
  if (!url) return null
  const patrones = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  ]
  for (const re of patrones) {
    const m = String(url).match(re)
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  }
  return null
}
