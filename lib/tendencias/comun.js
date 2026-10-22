// ---------------------------------------------------------------------------
// Tendencias — piezas compartidas por la pantalla y las APIs.
//
// · normalizarDescripcion: la llave con la que se guarda cada producto en
//   producto_etiquetas (un renglón por descripción distinta, no por pedido).
// · normalizarTienda: "SAMS", "SAM´S" y "Sams" son la misma tienda.
// · calendario: las fechas que mueven la venta, calculadas para los próximos
//   12 meses y cruzadas con las entregas (cada ~14 días) para saber si
//   todavía alcanza a llegar lo que se publique hoy.
// ---------------------------------------------------------------------------

export function normalizarDescripcion(d) {
  return String(d || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function descripcionUtil(d) {
  const n = normalizarDescripcion(d)
  if (!n || n.length < 4) return false
  if (n.startsWith('(sin foto')) return false
  if (/^[\W\d\s]+$/.test(n)) return false
  return true
}

const TIENDAS = [
  [/^sam/i, "Sam's"],
  [/^dd/i, "dd's Discounts"],
  [/^tj/i, 'TJ Maxx'],
  [/^trader/i, "Trader Joe's"],
  [/^jc/i, 'JCPenney'],
  [/^(bbw|bath)/i, 'Bath & Body Works'],
  [/^five/i, 'Five Below'],
]
export function normalizarTienda(t) {
  const s = String(t || '').trim()
  if (!s) return 'Sin tienda'
  for (const [re, nombre] of TIENDAS) if (re.test(s)) return nombre
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Tiendas sin venta en línea: para estas se arma la "guía de qué buscar".
export const TIENDAS_FISICAS = ['Ross', 'Burlington', 'TJ Maxx', 'Marshalls', "dd's Discounts"]

// Llaves de temporada. Las usa la IA al etiquetar y el calendario.
export const TEMPORADAS = {
  todo_el_ano: 'Todo el año',
  regreso_clases: 'Regreso a clases',
  halloween: 'Halloween',
  dia_muertos: 'Día de Muertos',
  navidad: 'Navidad',
  reyes: 'Día de Reyes',
  san_valentin: 'San Valentín',
  dia_nino: 'Día del Niño',
  dia_madres: 'Día de las Madres',
  dia_padre: 'Día del Padre',
  verano: 'Verano',
  invierno: 'Frío / invierno',
}

export const FAMILIAS = [
  'Belleza y cuidado personal', 'Perfumes y fragancias', 'Ropa', 'Calzado', 'Accesorios y bolsas',
  'Hogar y cocina', 'Limpieza', 'Comida y snacks', 'Suplementos y vitaminas', 'Juguetes',
  'Útiles escolares y libros', 'Bebé', 'Electrónica', 'Decoración de temporada', 'Mascotas', 'Otro',
]

const iso = (d) => d.toISOString().slice(0, 10)
const sumar = (fechaIso, dias) => { const d = new Date(fechaIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dias); return iso(d) }
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)

function enesimoDia(anio, mes, diaSemana, n) {
  // n-ésimo día de la semana (0=domingo) del mes (1-12)
  const d = new Date(Date.UTC(anio, mes - 1, 1, 12))
  while (d.getUTCDay() !== diaSemana) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1))
  return iso(d)
}
function ultimoLunesAgosto(anio) {
  const d = new Date(Date.UTC(anio, 7, 31, 12))
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1)
  return iso(d)
}

// anticipo = días antes del evento en que conviene empezar a publicar.
function eventosDelAnio(a) {
  return [
    { clave: 'san_valentin', nombre: 'San Valentín', fecha: `${a}-02-14`, anticipo: 30 },
    { clave: 'dia_nino', nombre: 'Día del Niño', fecha: `${a}-04-30`, anticipo: 30 },
    { clave: 'dia_madres', nombre: 'Día de las Madres', fecha: `${a}-05-10`, anticipo: 35 },
    { clave: 'dia_padre', nombre: 'Día del Padre', fecha: enesimoDia(a, 6, 0, 3), anticipo: 30 },
    { clave: 'verano', nombre: 'Verano', fecha: `${a}-06-01`, anticipo: 35 },
    { clave: 'regreso_clases', nombre: 'Regreso a clases', fecha: ultimoLunesAgosto(a), anticipo: 45 },
    { clave: 'halloween', nombre: 'Halloween', fecha: `${a}-10-31`, anticipo: 40 },
    { clave: 'dia_muertos', nombre: 'Día de Muertos', fecha: `${a}-11-02`, anticipo: 30 },
    { clave: 'black_friday', nombre: 'Black Friday (ofertas en USA)', fecha: sumar(enesimoDia(a, 11, 4, 4), 1), anticipo: 14 },
    { clave: 'invierno', nombre: 'Temporada de frío', fecha: `${a}-12-01`, anticipo: 35 },
    { clave: 'navidad', nombre: 'Navidad', fecha: `${a}-12-25`, anticipo: 55 },
    { clave: 'reyes', nombre: 'Día de Reyes', fecha: `${a + 1}-01-06`, anticipo: 40 },
  ]
}

// hoy: 'YYYY-MM-DD'. proximaEntrega: fecha de la entrega futura (o null).
export function calendario(hoy, proximaEntrega, ciclo = 14) {
  const anio = Number(hoy.slice(0, 4))
  const eventos = [...eventosDelAnio(anio - 1), ...eventosDelAnio(anio), ...eventosDelAnio(anio + 1)]
    .filter(e => e.fecha >= hoy && diasEntre(hoy, e.fecha) <= 365)
    .sort((x, y) => x.fecha.localeCompare(y.fecha))

  const base = proximaEntrega && proximaEntrega >= hoy ? proximaEntrega : sumar(hoy, 7)
  return eventos.map(e => {
    const faltan = diasEntre(hoy, e.fecha)
    const publicarDesde = sumar(e.fecha, -e.anticipo)
    // Última entrega que llega ANTES del evento.
    let ultima = null
    for (let f = base; f < e.fecha; f = sumar(f, ciclo)) ultima = f
    let estado, tono
    if (e.clave === 'black_friday') {
      estado = faltan <= 14 ? 'Ofertas esta semana' : `Ofertas el ${fechaCorta(e.fecha)}`
      tono = faltan <= 14 ? 'ambar' : 'gris'
    } else if (!ultima) {
      estado = 'Ya no alcanza a llegar'; tono = 'gris'
    } else if (ultima === base) {
      estado = `Última llamada · llega el ${fechaCorta(base)}`; tono = 'rojo'
    } else if (hoy >= publicarDesde) {
      estado = 'Publica ya'; tono = 'ambar'
    } else {
      estado = `Publica desde el ${fechaCorta(publicarDesde)}`; tono = 'gris'
    }
    return { ...e, faltan, publicarDesde, ultimaEntrega: ultima, estado, tono, activo: tono === 'rojo' || tono === 'ambar' }
  })
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fechaCorta(f) {
  if (!f) return ''
  const d = new Date(String(f).slice(0, 10) + 'T12:00:00Z')
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

export function hoyHermosillo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date())
}

// Precio sugerido igual que lo hace Lalo: dólares × factor, redondeado a $5.
export function precioSugerido(usd, factor) {
  const n = Number(usd)
  if (!n || !factor) return null
  return Math.max(5, Math.round((n * factor) / 5) * 5)
}
export function utilidadEstimada(usd, precio, tc, impPct) {
  const n = Number(usd)
  if (!n || !precio) return null
  return Math.round(precio - n * tc * (1 + (impPct || 0) / 100))
}

// Tiendas donde compra Denog (para los prompts de la IA).
export const TIENDAS_DENOG = ['Amazon', 'Walmart', 'Target', 'Costco', "Sam's", 'Bath & Body Works', 'Five Below', 'Old Navy', 'JCPenney', 'eBay', 'Ross', 'TJ Maxx', 'Marshalls', 'Burlington', 'Kohl\'s', 'Ulta', 'Sephora', 'Nike', 'Adidas', 'Carter\'s', 'Gap', 'Victoria\'s Secret']
