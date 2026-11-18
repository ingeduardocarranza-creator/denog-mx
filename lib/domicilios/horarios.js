// Ventanas de entrega a domicilio -- una sola fuente para las 4 pantallas
// que agendan (cliente, admin, punto de venta y tienda externa).
// Lunes a viernes: 2 ventanas. Sábado: 2 ventanas. Domingo: no hay.

export const HORARIOS_SEMANA = ['10:00am - 1:30pm', '3:00pm - 7:00pm']
export const HORARIOS_SABADO = ['10:00am - 1:00pm', '2:00pm - 5:00pm']

export function horariosDelDia(fecha) {
  if (!fecha) return []
  const dia = new Date(fecha + 'T12:00:00').getDay()
  if (dia === 0) return []
  if (dia === 6) return HORARIOS_SABADO
  return HORARIOS_SEMANA
}

// "10:00am - 1:30pm" -> { inicioMin: 600, finMin: 810 }. Acepta también
// "12:00 pm – 3:00 pm" (variantes viejas capturadas a mano).
export function parsearVentana(texto) {
  if (!texto) return null
  const m = String(texto).match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i)
  if (!m) return null
  const aMin = (h, mi, ap) => {
    let hh = parseInt(h, 10) % 12
    if (ap.toLowerCase() === 'p') hh += 12
    return hh * 60 + parseInt(mi, 10)
  }
  return { inicioMin: aMin(m[1], m[2], m[3]), finMin: aMin(m[4], m[5], m[6]) }
}

// "14:30" (o "14:30:00") -> minutos desde medianoche
export function horaAMinutos(hhmm) {
  if (!hhmm) return null
  const [h, m] = String(hhmm).split(':')
  return parseInt(h, 10) * 60 + parseInt(m || '0', 10)
}

// Ventana efectiva de un domicilio: si el cliente exige hora exacta manda esa
// (con 15 min de tolerancia a cada lado); si no, la ventana de "horario".
export function ventanaEfectiva({ horario, hora_exacta }) {
  const exacta = horaAMinutos(hora_exacta)
  if (exacta != null) return { inicioMin: exacta - 15, finMin: exacta + 15, exacta: true }
  const v = parsearVentana(horario)
  return v ? { ...v, exacta: false } : null
}

export function minutosATexto(min) {
  const h24 = Math.floor(min / 60) % 24
  const m = String(Math.round(min % 60)).padStart(2, '0')
  const ap = h24 >= 12 ? 'pm' : 'am'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${m}${ap}`
}
