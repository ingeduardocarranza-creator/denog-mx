// Registra una solicitud de comisión por venta propia ("es mi cliente").
// Solo guarda la solicitud: el admin confirma el % y aprueba. Nunca debe romper
// un cobro, por eso quien la llama la envuelve en try/catch.
//
// El % sugerido sale de cada producto (productos_tienda.comision_pct) o, si
// está vacío, del % estándar (jarvis_config.comision_pct_default). Cuando una
// venta mezcla productos, se promedia ponderado por la utilidad de cada uno.

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

export async function pctEstandar(supabase) {
  const { data } = await supabase.from('jarvis_config').select('valor').eq('clave', 'comision_pct_default').maybeSingle()
  const n = Number(data?.valor)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 10
}

// lineas: [{ productoId, cantidad, precio, costo }] (precio y costo por pieza)
async function pctSugerido(supabase, lineas) {
  const estandar = await pctEstandar(supabase)
  const ids = [...new Set(lineas.map(l => l.productoId).filter(Boolean))]
  const { data } = ids.length ? await supabase.from('productos_tienda').select('id, comision_pct').in('id', ids) : { data: [] }
  const propio = Object.fromEntries((data || []).map(p => [p.id, p.comision_pct == null ? null : Number(p.comision_pct)]))
  let peso = 0, suma = 0
  for (const l of lineas) {
    const u = Math.max(0, (Number(l.precio) - Number(l.costo)) * Number(l.cantidad || 1))
    const pct = (l.productoId && propio[l.productoId] != null) ? propio[l.productoId] : estandar
    peso += u; suma += u * pct
  }
  return peso > 0 ? redondear(suma / peso) : estandar
}

// Venta de mostrador: utilidad = lo cobrado menos el costo de lo vendido.
// Si algún renglón no tiene costo (monto libre), la utilidad queda en null y
// el admin pone el monto a mano.
export async function registrarComisionVenta(supabase, { colaboradorId, transaccionId, ventasIds, totalCobrado }) {
  let utilidad = null, sugerido = await pctEstandar(supabase)
  if (ventasIds?.length) {
    const { data } = await supabase.from('ventas_tienda').select('producto_id, cantidad, precio_unitario, costo_unitario').in('id', ventasIds)
    const filas = data || []
    if (filas.length && filas.every(v => Number(v.costo_unitario) > 0)) {
      const costo = filas.reduce((s, v) => s + Number(v.costo_unitario) * Number(v.cantidad || 1), 0)
      utilidad = redondear(totalCobrado - costo)
      sugerido = await pctSugerido(supabase, filas.map(v => ({ productoId: v.producto_id, cantidad: v.cantidad, precio: v.precio_unitario, costo: v.costo_unitario })))
    }
  }
  return supabase.from('comisiones_colaborador').insert({
    colaborador_id: colaboradorId, origen: 'venta', transaccion_id: transaccionId,
    total_venta: redondear(totalCobrado), utilidad, porcentaje_sugerido: sugerido,
  })
}

// Domicilio agendado desde el POS: la utilidad sale de los artículos (sin el envío).
export async function registrarComisionDomicilio(supabase, { colaboradorId, domicilioId, items, subtotal }) {
  let utilidad = null, sugerido = await pctEstandar(supabase)
  const conProducto = (items || []).filter(i => i.productoId)
  if (items?.length && conProducto.length === items.length) {
    const { data } = await supabase.from('productos_tienda').select('id, costo').in('id', conProducto.map(i => i.productoId))
    const costos = Object.fromEntries((data || []).map(p => [p.id, Number(p.costo) || 0]))
    if (conProducto.every(i => costos[i.productoId] > 0)) {
      const costo = conProducto.reduce((s, i) => s + costos[i.productoId] * Number(i.cantidad || 1), 0)
      utilidad = redondear(Number(subtotal) - costo)
      sugerido = await pctSugerido(supabase, conProducto.map(i => ({ productoId: i.productoId, cantidad: i.cantidad, precio: i.precio, costo: costos[i.productoId] })))
    }
  }
  return supabase.from('comisiones_colaborador').insert({
    colaborador_id: colaboradorId, origen: 'domicilio', domicilio_id: domicilioId,
    total_venta: redondear(subtotal), utilidad, porcentaje_sugerido: sugerido,
  })
}
