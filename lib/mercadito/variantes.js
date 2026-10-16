// Variantes de un artículo (productos_tienda).
//
// Cada variante es un artículo normal, con su propio costo, precio, stock y
// código de barras, así que el POS, el inventario, las ventas y el carrito
// siguen funcionando igual que siempre. Lo único nuevo:
//   grupo_id  → id del artículo "cabeza" del grupo (la cabeza tiene null)
//   variante  → etiqueta corta, p. ej. "Talla M · Azul"
// El nombre completo de cada fila es "<título> · <variante>", para que en el
// POS y en los tickets se sepa exactamente cuál es.

const SEP = ' · ';

export const nombreCompleto = (titulo, variante) =>
  variante && variante.trim() ? `${titulo.trim()}${SEP}${variante.trim()}` : titulo.trim();

// El título del grupo: el nombre sin la variante pegada al final.
export function tituloDe(p) {
  const nombre = p?.nombre || '';
  const v = p?.variante;
  if (v && nombre.endsWith(SEP + v)) return nombre.slice(0, nombre.length - (SEP + v).length);
  return nombre;
}

export const cabezaId = (p) => p.grupo_id ?? p.id;

// Convierte la lista de artículos visibles en la lista de publicaciones que
// ve el cliente: un grupo de variantes es UNA tarjeta, no varias.
//  · Un artículo suelto (o un grupo con una sola variante visible) se ve igual
//    que siempre.
//  · Un grupo con varias: título del grupo, precio "desde" el más bajo, stock
//    sumado, y la lista de variantes en `variantes`.
export function agruparPublicaciones(productos) {
  const mapa = new Map();
  const orden = [];
  for (const p of productos) {
    const k = cabezaId(p);
    if (!mapa.has(k)) { mapa.set(k, []); orden.push(k); }
    mapa.get(k).push(p);
  }
  return orden.map((k) => {
    const miembros = mapa.get(k);
    if (miembros.length === 1) return miembros[0];
    const cabeza = miembros.find((m) => m.grupo_id == null) || miembros[0];
    const conStock = miembros.filter((m) => (Number(m.stock) || 0) > 0);
    const base = conStock.length ? conStock : miembros;
    const precios = base.map((m) => Number(m.precio_venta) || 0);
    const precioMin = Math.min(...precios);
    const precioMax = Math.max(...precios);
    return {
      ...cabeza,
      nombre: tituloDe(cabeza),
      precio_venta: precioMin,
      precioVaria: precioMax !== precioMin,
      stock: miembros.reduce((n, m) => n + (Number(m.stock) || 0), 0),
      imagen_url: cabeza.imagen_url || miembros.find((m) => m.imagen_url)?.imagen_url || null,
      variantes: miembros,
    };
  });
}
