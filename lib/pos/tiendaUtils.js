// Lógica de dinero para la pestaña "Tienda" del POS: precio_venta y
// costo_unitario SIEMPRE se calculan/guardan por separado (ver README del
// handoff, sección "Costo y utilidad"). Compartido por app/pos/punto-venta,
// app/admin/punto-venta y app/components/pos/TiendaTienda.jsx para que la
// matemática de descuento/costo no se duplique ni se desincronice.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

let seq = 0;
const nextManualId = () => `manual-${Date.now()}-${seq++}`;

// Línea de carrito creada desde un producto de catálogo: el costo se toma
// como snapshot del producto AL MOMENTO de agregarlo (no se relee después,
// para no distorsionar utilidades pasadas si el costo del producto cambia).
export function crearLineaCatalogo(producto) {
  return {
    id: `p-${producto.id}`,
    origen: 'catalogo',
    productoId: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria || null,
    cantidad: 1,
    precioUnitario: Number(producto.precio_venta) || 0,
    costoUnitario: producto.costo != null ? Number(producto.costo) : null,
    descuentoTipo: null,
    descuentoValor: 0,
    imagenUrl: producto.imagen_url || null,
    stockDisponible: producto.stock != null ? Number(producto.stock) : null,
  };
}

// Línea de "venta rápida por monto" (pestaña Monto) o producto sin código
// capturado a mano: no hay costo conocido al cobrar — se marca "por
// conciliar" guardando costo_unitario = null; el admin lo captura después.
export function crearLineaMonto(descripcion, monto) {
  return {
    id: nextManualId(),
    origen: 'manual_monto',
    productoId: null,
    nombre: (descripcion || '').trim() || 'Venta rápida (monto)',
    categoria: null,
    cantidad: 1,
    precioUnitario: Number(monto) || 0,
    costoUnitario: null,
    descuentoTipo: null,
    descuentoValor: 0,
    imagenUrl: null,
    stockDisponible: null,
  };
}

// Precio unitario efectivo de una línea tras aplicar SOLO su descuento de
// línea (el override de "Editar precio" ya está reflejado en
// linea.precioUnitario — nunca se toca costoUnitario por un override, el
// costo sigue siendo el mismo producto).
export function calcularLineaEfectiva(linea) {
  const base = Number(linea.precioUnitario) || 0;
  const valor = Number(linea.descuentoValor) || 0;
  let descuentoUnit = 0;
  if (linea.descuentoTipo === 'amount') descuentoUnit = valor;
  else if (linea.descuentoTipo === 'percent') descuentoUnit = base * (valor / 100);
  descuentoUnit = Math.max(0, Math.min(base, descuentoUnit));

  const precioUnitEfectivo = Math.max(0, base - descuentoUnit);
  const cantidad = Number(linea.cantidad) || 0;

  return {
    precioUnitEfectivo,
    baseSubtotal: round2(base * cantidad),
    subtotal: round2(precioUnitEfectivo * cantidad),
    tieneDescuento: descuentoUnit > 0,
  };
}

// Totales del carrito + prorrateo del descuento "a nivel venta" (footer)
// entre las líneas, proporcional al subtotal de cada una. Prorratear es lo
// que permite que precio_venta guardado por línea siga sumando exactamente
// el total cobrado, y por lo tanto la utilidad por línea quede exacta.
export function calcularTotalesCarrito(cart, descuentoVenta) {
  const lineas = cart.map((linea) => ({ linea, ...calcularLineaEfectiva(linea) }));
  const subtotalBruto = round2(lineas.reduce((acc, l) => acc + l.subtotal, 0));

  const tipo = descuentoVenta?.tipo || null;
  const valor = Number(descuentoVenta?.valor) || 0;
  let descuentoVentaMonto = 0;
  if (tipo === 'amount') descuentoVentaMonto = valor;
  else if (tipo === 'percent') descuentoVentaMonto = subtotalBruto * (valor / 100);
  descuentoVentaMonto = Math.max(0, Math.min(subtotalBruto, descuentoVentaMonto));

  const total = round2(subtotalBruto - descuentoVentaMonto);

  // precioFinalLineaUnit ya incluye: override de precio + descuento de línea
  // + porción prorrateada del descuento de venta. Es el precio_venta final
  // que se persiste por unidad al cobrar.
  let acumuladoProrrateado = 0;
  const lineasConProrrateo = lineas.map((l, idx) => {
    const esUltima = idx === lineas.length - 1;
    const proporcion = subtotalBruto > 0 ? l.subtotal / subtotalBruto : 0;
    let montoProrrateado = esUltima
      ? round2(descuentoVentaMonto - acumuladoProrrateado)
      : round2(descuentoVentaMonto * proporcion);
    acumuladoProrrateado = round2(acumuladoProrrateado + montoProrrateado);

    const subtotalFinalLinea = round2(l.subtotal - montoProrrateado);
    const cantidad = Number(l.linea.cantidad) || 1;
    const precioFinalUnit = round2(subtotalFinalLinea / cantidad);

    return { ...l, subtotalFinalLinea, precioFinalUnit };
  });

  return { lineas: lineasConProrrateo, subtotalBruto, descuentoVentaMonto, total };
}

// Filas listas para insertar en la tabla ventas_tienda.
export function construirVentaItems(cart, descuentoVenta, { pagoId, vendedorId }) {
  const { lineas } = calcularTotalesCarrito(cart, descuentoVenta);
  return lineas.map(({ linea, precioFinalUnit }) => ({
    pago_id: pagoId,
    producto_id: linea.productoId,
    nombre_producto: linea.nombre,
    categoria: linea.categoria,
    cantidad: linea.cantidad,
    precio_unitario: precioFinalUnit,
    costo_unitario: linea.costoUnitario,
    origen: linea.origen,
    descuento_tipo: linea.descuentoTipo,
    descuento_valor: Number(linea.descuentoValor) || 0,
    vendedor_id: vendedorId,
  }));
}
