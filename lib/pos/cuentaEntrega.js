// La cuenta de UNA entrega en el punto de venta. Es la misma que hace el
// servidor al cobrar (app/api/punto-venta/cobrar/route.js) y que muestra el
// estado de cuenta:
//
//   falta = (mercancía que ya se llevó + la que se lleva ahora)
//           - todo lo que ya abonó a esa entrega
//           - anticipos generales (sin entrega) que se le asignan
//
// `ya_entregado` y `pagado` vienen de /api/punto-venta/cliente dentro de cada
// entrega. NO se debe restar la lista de anticipos por separado: un anticipo de
// una entrega que ya se cobró en una primera vuelta (p. ej. Ana Luz, 17 nov:
// anticipo $1,615 + cobro $365 = $1,980 que ya cubrió lo entregado) volvería a
// descontarse contra lo que se lleva en la segunda vuelta y el saldo saldría $0.
//
// Este archivo existe igual en mobile/lib/pos/ — si se cambia aquí, cambiarlo allá.
export function calcularCuentaEntrega({ entrega, subtotalArticulos, generales = 0 }) {
  const yaEntregado = Number(entrega?.ya_entregado || 0)
  const yaPagado = Number(entrega?.pagado || 0)
  const ahora = Number(subtotalArticulos || 0)
  const total = yaEntregado + ahora
  const neto = Math.max(0, total - yaPagado - Number(generales || 0))
  return {
    yaEntregado,
    yaPagado,
    neto,
    // Cuánto del saldo a favor se aplica a lo que se lleva AHORA.
    descuentoAhora: Math.max(0, ahora - neto),
  }
}

// Los anticipos generales (sin entrega) se asignan al primer bloque cobrable,
// igual que el servidor (que los consume en el primer bloque con saldo).
export function indicePrimerBloqueCobrable(bloques) {
  return (bloques || []).findIndex(b => !b.bloqueada)
}
