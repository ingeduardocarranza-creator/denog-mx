// Sugerencia de fecha límite para recoger un pedido.
//
// La regla de Lalo: 7 días después de la entrega, contando de lunes a sábado.
// El domingo no cuenta. Los días que la tienda no abre tampoco, pero eso el
// sistema no lo sabe —depende de cómo caiga la quincena— así que la fecha se
// SUGIERE y él la ajusta. Proponer le ahorra la cuenta; imponer pondría fechas
// equivocadas en un papel que ve el cliente.

const DIAS = 7

// Devuelve 'YYYY-MM-DD' o null. Trabaja a mediodía para que ningún cambio de
// horario mueva el día.
export function sugerirFechaLimite(fechaEntrega, dias = DIAS) {
  if (!fechaEntrega) return null
  const d = new Date(String(fechaEntrega).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return null

  let contados = 0
  while (contados < dias) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0) contados++   // 0 = domingo, no cuenta
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
