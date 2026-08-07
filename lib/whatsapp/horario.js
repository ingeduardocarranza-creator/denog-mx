// Horario de atención de Denog (Hermosillo, Sonora — UTC-7 todo el año,
// Sonora no cambia de horario de verano). Fuera de este horario no se
// generan pendientes de "mensaje sin responder": de noche o domingo nadie
// está viendo el chat, y no tiene caso avisar de algo que no se puede
// atender hasta que abran de nuevo.
const OFFSET_HORAS = -7

export function dentroDeHorario(fecha = new Date()) {
  const local = new Date(fecha.getTime() + OFFSET_HORAS * 3600000)
  const dia = local.getUTCDay() // 0=domingo … 6=sábado
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes()

  if (dia === 0) return false // domingo: cerrado
  if (dia >= 1 && dia <= 5) return minutos >= 10 * 60 && minutos < 19 * 60 // L-V 10am–7pm
  if (dia === 6) return minutos >= 10 * 60 && minutos < 17 * 60 // sábado 10am–5pm
  return false
}
