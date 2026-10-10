// Limpieza del número de guía y detección de paquetería por su formato.
// Lo usan la pantalla de bodega (para mostrarlo al instante) y la API
// (para guardarlo igual sin importar quién lo mande).

export function limpiarGuia(texto) {
  let g = String(texto || '').toUpperCase().replace(/[^0-9A-Z]/g, '')

  // USPS: el código de barras de la etiqueta trae al inicio "420" + el
  // código postal (5 o 9 dígitos) antes del número de rastreo real.
  if (/^420\d{5}9\d{21}$/.test(g)) g = g.slice(8)
  else if (/^420\d{9}9\d{21}$/.test(g)) g = g.slice(12)

  return g
}

export function detectarPaqueteria(guia) {
  const g = limpiarGuia(guia)
  if (/^1Z[0-9A-Z]{16}$/.test(g)) return 'UPS'
  if (/^TBA\d{9,}$/.test(g)) return 'Amazon'
  if (/^9[1-5]\d{18,24}$/.test(g) || /^[A-Z]{2}\d{9}US$/.test(g)) return 'USPS'
  if (/^(\d{12}|\d{15}|\d{20}|\d{22}|96\d{20}|\d{34})$/.test(g)) return 'FedEx'
  if (/^1LS\d+/.test(g) || /^LX\d+/.test(g)) return 'LaserShip'
  if (/^[CD]\d{14}$/.test(g)) return 'OnTrac'
  if (/^\d{10}$/.test(g)) return 'DHL'
  return 'Otra'
}
