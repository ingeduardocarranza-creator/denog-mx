// Cuánto te pagan realmente por una publicación y cuánto ganas.
//   Te pagan = precio − comisión de MercadoLibre − envío − impuestos (ISR 2.5% + IVA 8% sobre precio ÷ 1.16)
//   Ganancia = te pagan − lo que te costó (catálogo)
// Comisión y envío salen de la ÚLTIMA VENTA REAL de esa publicación. Si nunca vendió,
// la comisión es un estimado de MercadoLibre y el envío no se descuenta.

const r2 = (n) => Math.round(n * 100) / 100

export function impuestosDe(precio) {
  const base = Number(precio) / 1.16
  return r2(r2(base * 0.025) + r2(base * 0.08))
}

export function calcularDinero({ precio, costo, comisionPct, envio }) {
  const p = Number(precio)
  if (!(p > 0)) return null
  const comision = comisionPct != null ? r2(p * comisionPct / 100) : null
  const impuestos = impuestosDe(p)
  const neto = comision != null ? r2(p - comision - (envio || 0) - impuestos) : null
  const c = costo != null && Number(costo) > 0 ? Number(costo) : null
  const ganancia = neto != null && c != null ? r2(neto - c) : null
  return {
    precio: p, costo: c, comision, comision_pct: comisionPct, envio: envio ?? null, impuestos, neto, ganancia,
    margen_pct: ganancia != null ? r2(ganancia / p * 100) : null,
    sobre_costo_pct: ganancia != null ? r2(ganancia / c * 100) : null,
  }
}

// Última venta con dinero real por publicación: { item_id: { comisionPct, envio } }
export async function ultimasVentas(supabase) {
  const { data: ventas } = await supabase.from('ml_ventas').select('id, envio_costo, fecha_venta').not('finanzas_en', 'is', null).order('fecha_venta', { ascending: false }).limit(300)
  if (!ventas?.length) return {}
  const porVenta = new Map(ventas.map(v => [v.id, v]))
  const { data: items } = await supabase.from('ml_venta_items').select('venta_id, item_id, variacion_id, cantidad, precio_unitario, comision').in('venta_id', ventas.map(v => v.id))
  const cuenta = new Map()
  for (const i of items || []) cuenta.set(i.venta_id, (cuenta.get(i.venta_id) || 0) + 1)
  const salida = {}
  for (const v of ventas) {
    for (const i of (items || []).filter(x => x.venta_id === v.id)) {
      const llave = `${i.item_id}:${i.variacion_id || 0}`
      if (salida[llave] || i.comision == null || !(i.precio_unitario > 0)) continue
      salida[llave] = {
        comisionPct: r2(Number(i.comision) / (Number(i.precio_unitario) * (Number(i.cantidad) || 1)) * 100),
        // El envío es de todo el paquete: solo se usa si la orden es de un solo producto.
        envio: cuenta.get(v.id) === 1 && porVenta.get(v.id).envio_costo != null ? Number(porVenta.get(v.id).envio_costo) / (Number(i.cantidad) || 1) : null,
        fecha: v.fecha_venta,
      }
    }
  }
  return salida
}
