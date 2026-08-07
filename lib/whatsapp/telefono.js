// Normalización de teléfonos mexicanos entre los formatos que usa
// WhatsApp Cloud API (wa_id: "52" + 10 dígitos, a veces con el viejo "1" de
// celular) y el formato de 10 dígitos que se guarda en clientes.telefono.

// A 10 dígitos, para comparar contra clientes.telefono.
export function a10Digitos(telefono) {
  const n = String(telefono || '').replace(/\D/g, '')
  if (n.length === 10) return n
  if (n.length === 12 && n.startsWith('52')) return n.slice(2)
  if (n.length === 13 && n.startsWith('521')) return n.slice(3)
  if (n.length === 11 && n.startsWith('1')) return n.slice(1)
  if (n.length === 11 && n.startsWith('52')) return n.slice(2)
  return n
}

// A formato wa.me (52 + 10 dígitos) — misma lógica que ya usa
// app/admin/estados-cuenta/page.js para los botones de WhatsApp.
export function paraWaMe(telefono) {
  const n = String(telefono || '').replace(/\D/g, '')
  if (n.length === 12 && n.startsWith('52')) return n
  if (n.length === 10) return '52' + n
  if (n.length === 11 && n.startsWith('1')) return '52' + n.slice(1)
  if (n.length === 11 && !n.startsWith('52')) return '52' + n.slice(1)
  if (n.length === 13 && n.startsWith('521')) return '52' + n.slice(3)
  return n
}
