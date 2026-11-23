// Cuenta de tienda (apartados): reglas compartidas entre la API, el POS y el
// estado de cuenta. Un apartado es un artículo del catálogo que el cliente
// dejó apartado; no depende de una fecha de entrega.

export const DIAS_PARA_LIBERAR = 30
export const TIPO_ANTICIPO_TIENDA = 'Anticipo Tienda'

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Total del renglón (precio final x cantidad).
export const totalApartado = (a) => round2((Number(a.precio_unitario) || 0) * (Number(a.cantidad) || 0))

// Lo que el cliente ya dejó de anticipo para este artículo.
export const anticipadoApartado = (a, pagos = []) =>
  round2(pagos.filter(p => p.apartado_id === a.id).reduce((s, p) => s + (Number(p.monto) || 0), 0))

export const saldoApartado = (a, pagos = []) =>
  Math.max(0, round2(totalApartado(a) - anticipadoApartado(a, pagos)))

// Cuántos días lleva apartado. `creado_en` es hora de Hermosillo sin zona.
export function diasApartado(a, ahora = new Date()) {
  if (!a?.creado_en) return 0
  const d = new Date(String(a.creado_en).replace(' ', 'T'))
  return Math.floor((ahora.getTime() - d.getTime()) / 86400000)
}

export const venceAviso = (a, ahora = new Date()) =>
  a.estado === 'apartado' && diasApartado(a, ahora) >= DIAS_PARA_LIBERAR

// Un remate es cuando el precio final es menor al del catálogo.
export function infoRemate(a) {
  const cat = Number(a.precio_catalogo) || 0
  const fin = Number(a.precio_unitario) || 0
  if (cat <= 0 || fin >= cat) return null
  return { descuentoUnit: round2(cat - fin), pct: (cat - fin) / cat }
}
