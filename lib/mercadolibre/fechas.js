// Fecha límite de un paquete: la que da MercadoLibre (si la trae) o, si no,
// el día de la venta + los días de entrega que prometía la publicación.

const TZ = 'America/Hermosillo'
export const diaLocal = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ }) // AAAA-MM-DD

// ventas: [{ fecha_venta, limite_despacho }], dias: días prometidos de sus productos.
// Devuelve { dia: 'AAAA-MM-DD', hora: ISO|null, origen: 'mercadolibre'|'calculada' } o null.
export function fechaLimite({ limite_despacho, fecha_venta }, diasPrometidos) {
  if (limite_despacho) return { dia: diaLocal(limite_despacho), hora: limite_despacho, origen: 'mercadolibre' }
  const dias = Number(diasPrometidos)
  if (fecha_venta && Number.isFinite(dias) && dias > 0) {
    return { dia: diaLocal(new Date(new Date(fecha_venta).getTime() + dias * 86400000)), hora: null, origen: 'calculada' }
  }
  return null
}

// Días que faltan para esa fecha (negativo = ya venció).
export function diasRestantes(dia) {
  const hoy = diaLocal(new Date())
  return Math.round((new Date(`${dia}T00:00:00Z`) - new Date(`${hoy}T00:00:00Z`)) / 86400000)
}
