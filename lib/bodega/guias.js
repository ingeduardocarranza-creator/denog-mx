// Reconocer cuál de los códigos de una etiqueta es la GUÍA (número de rastreo).
//
// Las etiquetas traen varios códigos: el de la guía, el de código postal
// (USPS/UPS "420" + ZIP), el 2D (PDF417 de FedEx, MaxiCode de UPS), códigos
// de ruteo de Amazon, el código del producto (UPC/EAN), etc. Aquí solo se
// acepta lo que tiene forma de guía real de alguna paquetería; lo demás se
// rechaza con un mensaje que le dice al de bodega qué fue lo que escaneó.
//
// Lo usan la pantalla de bodega (al escanear) y la API (al guardar), para que
// la regla sea la misma en los dos lados.

// Formas de guía por paquetería. El orden importa: la primera que coincida gana.
const PATRONES = [
  { paqueteria: 'UPS',       re: /^1Z[0-9A-Z]{16}$/ },
  { paqueteria: 'Amazon',    re: /^TB[ACM]\d{12}$/ },
  { paqueteria: 'USPS',      re: /^9[2-5]\d{20}$/ },          // 22 dígitos (incluye UPS SurePost / FedEx SmartPost)
  { paqueteria: 'USPS',      re: /^9[2-5]\d{24}$/ },          // 26 dígitos
  { paqueteria: 'USPS',      re: /^[A-Z]{2}\d{9}US$/ },       // internacional
  { paqueteria: 'FedEx',     re: /^\d{12}$/ },
  { paqueteria: 'FedEx',     re: /^\d{15}$/ },
  { paqueteria: 'FedEx',     re: /^96\d{20}$/ },              // FedEx Ground (22 dígitos)
  { paqueteria: 'OnTrac',    re: /^1LS[0-9A-Z]{9,}$/ },       // OnTrac / LaserShip
  { paqueteria: 'OnTrac',    re: /^[CD]\d{14}$/ },
  { paqueteria: 'UniUni',    re: /^UUS[0-9A-Z]{10,}$/ },
  { paqueteria: 'DHL',       re: /^(GM|JJD|JD)\d{14,}$/ },    // DHL eCommerce / Parcel
  { paqueteria: 'DHL',       re: /^\d{10}$/ },                // DHL Express
]

// Mismo patrón pero para BUSCAR la guía dentro del texto largo de un código
// 2D (PDF417 de FedEx, QR) — ahí la guía viene mezclada con otros datos.
const BUSCAR_EN_2D = [
  /1Z[0-9A-Z]{16}/,
  /TB[ACM]\d{12}/,
  /(?:^|\D)(9[2-5]\d{20})(?!\d)/,
  /(?:^|[\x1d\x1e])(\d{12})(?=[\x1d\x1e]|$)/,               // FedEx: campo de 12 dígitos
  /(?:^|[\x1d\x1e])(\d{15})(?=[\x1d\x1e]|$)/,
]

const FORMATOS_PRODUCTO = ['EAN_8', 'EAN_13', 'UPC_A', 'UPC_E', 'UPC_EAN_EXTENSION', 'RSS_14', 'RSS_EXPANDED']
const FORMATOS_2D = ['PDF_417', 'QR_CODE', 'DATA_MATRIX', 'AZTEC', 'MAXICODE', 'MICRO_QR_CODE']

const soloAlfanum = (t) => String(t || '').toUpperCase().replace(/[^0-9A-Z]/g, '')

// Quita el prefijo de código postal que USPS/UPS ponen pegado a la guía y
// recorta el código de barras largo de FedEx a su número de rastreo.
export function limpiarGuia(texto) {
  let g = soloAlfanum(texto)
  if (/^420\d{5}9[2-5]\d{20,24}$/.test(g)) g = g.slice(8)        // 420 + ZIP5 + guía USPS
  else if (/^420\d{9}9[2-5]\d{20,24}$/.test(g)) g = g.slice(12)  // 420 + ZIP9 + guía USPS
  else if (/^\d{34}$/.test(g)) g = g.slice(-12)                  // FedEx 1D de 34 dígitos → últimos 12
  return g
}

function paqueteriaDe(guia) {
  const p = PATRONES.find(x => x.re.test(guia))
  return p ? p.paqueteria : null
}

// Compatibilidad: paquetería de una guía ya limpia ('Otra' si no se reconoce).
export function detectarPaqueteria(guia) {
  return paqueteriaDe(limpiarGuia(guia)) || 'Otra'
}

// Analiza lo que leyó la cámara (o lo que se escribió a mano).
//   texto   — contenido del código
//   formato — nombre del formato ZXing ('CODE_128', 'PDF_417', 'UPC_A'…), opcional
// Devuelve { ok: true, guia, paqueteria } o { ok: false, motivo }.
export function analizarCodigo(texto, formato = '') {
  const crudo = String(texto || '')

  if (FORMATOS_PRODUCTO.includes(formato)) {
    return { ok: false, motivo: 'Ese es el código del PRODUCTO, no la guía. Busca el código de la etiqueta de envío.' }
  }

  // Códigos 2D: buscar la guía dentro de su contenido.
  if (FORMATOS_2D.includes(formato) || crudo.startsWith('[)>') || crudo.length > 40) {
    const plano = crudo.toUpperCase()
    for (const re of BUSCAR_EN_2D) {
      const m = plano.match(re)
      if (m) {
        const guia = limpiarGuia(m[1] || m[0])
        const paqueteria = paqueteriaDe(guia)
        if (paqueteria) return { ok: true, guia, paqueteria }
      }
    }
    return { ok: false, motivo: 'Ese código cuadrado no trae la guía. Escanea el código de barras largo (de rayas) que dice TRACKING.' }
  }

  const sinLimpiar = soloAlfanum(crudo)

  // 420 + código postal solo (sin guía pegada): es el código de ruteo.
  if (/^420\d{5}(\d{4})?$/.test(sinLimpiar)) {
    return { ok: false, motivo: 'Ese es el código del CÓDIGO POSTAL (empieza con 420). Escanea el otro, el de la guía.' }
  }

  const guia = limpiarGuia(crudo)
  const paqueteria = paqueteriaDe(guia)
  if (paqueteria) return { ok: true, guia, paqueteria }

  if (guia.length < 8) {
    return { ok: false, motivo: 'Ese código es muy corto para ser una guía. Busca el que dice TRACKING.' }
  }
  return { ok: false, motivo: 'Ese código no parece una guía. Busca el código de barras que dice TRACKING # (o el más grande de la etiqueta).' }
}
