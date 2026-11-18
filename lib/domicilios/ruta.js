// Cálculo de ruta del día: orden, horas estimadas y si alcanza el tiempo.
// Sin APIs de pago: distancia en línea recta x factor de calle, a velocidad
// promedio urbana. Google Maps da los tiempos reales al abrir la ruta.

import { ventanaEfectiva } from './horarios'

export const SERVICIO_MIN = 8        // minutos por parada (entregar y cobrar)
export const VELOCIDAD_KMH = 25      // promedio urbano en Hermosillo
export const FACTOR_CALLE = 1.4      // la calle real es más larga que la línea recta

export function haversineKm(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function minutosViaje(a, b) {
  return (haversineKm(a, b) * FACTOR_CALLE / VELOCIDAD_KMH) * 60
}

// paradas: [{ id, lat, lng, horario, hora_exacta, orden_ruta }]
// Orden: manual (orden_ruta) si existe; si no, por ventana y luego vecino más cercano.
export function ordenarRuta(paradas, origen) {
  const conV = paradas.map((p) => ({ ...p, _v: ventanaEfectiva(p) }))
  const manuales = conV.filter((p) => p.orden_ruta != null).sort((a, b) => a.orden_ruta - b.orden_ruta)
  const auto = conV.filter((p) => p.orden_ruta == null)

  const claveVentana = (p) => (p._v ? p._v.inicioMin : 99999)
  const grupos = new Map()
  for (const p of auto) {
    const k = p._v?.exacta ? `x${p.id}` : String(claveVentana(p))   // la hora exacta va sola en su lugar
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p)
  }
  const ordenGrupos = [...grupos.values()].sort((g1, g2) => {
    const m = (g) => Math.min(...g.map((p) => (p._v ? (p._v.exacta ? p._v.inicioMin + 15 : p._v.inicioMin) : 99999)))
    return m(g1) - m(g2)
  })

  const salida = []
  let pos = origen
  for (const g of ordenGrupos) {
    const resto = [...g]
    while (resto.length) {
      let mejor = 0
      if (pos && resto[0].lat != null) {
        let dMin = Infinity
        resto.forEach((p, i) => {
          if (p.lat == null) return
          const d = haversineKm(pos, p)
          if (d < dMin) { dMin = d; mejor = i }
        })
      }
      const [p] = resto.splice(mejor, 1)
      salida.push(p)
      if (p.lat != null) pos = { lat: p.lat, lng: p.lng }
    }
  }
  return [...manuales, ...salida].map(({ _v, ...p }) => p)
}

// Simula la salida desde la tienda. Devuelve cada parada con llegada estimada
// (minutos desde medianoche) y si llega tarde a su ventana.
export function estimarHoras(ordenadas, origen, salidaMin = null) {
  const inicios = ordenadas.map((p) => ventanaEfectiva(p)?.inicioMin).filter((x) => x != null)
  let t = salidaMin ?? (inicios.length ? Math.min(...inicios) : 600)
  let pos = origen
  return ordenadas.map((p) => {
    const v = ventanaEfectiva(p)
    if (pos && p.lat != null) t += minutosViaje(pos, p)
    if (v && t < v.inicioMin) t = v.inicioMin
    const llegada = t
    const tarde = !!v && llegada > v.finMin
    t += SERVICIO_MIN
    if (p.lat != null) pos = { lat: p.lat, lng: p.lng }
    return { ...p, llegadaMin: Math.round(llegada), tarde }
  })
}
