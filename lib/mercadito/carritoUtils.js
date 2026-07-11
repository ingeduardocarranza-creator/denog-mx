// Carrito del cliente en Mercadito: vive en localStorage mientras navega el
// catálogo (no hay cuenta requerida hasta el checkout). Compartido por
// app/mercadito/page.js, producto/[id]/page.js, carrito/page.js y
// checkout/page.js para que la matemática no se duplique.

const STORAGE_KEY = 'mercadito_carrito';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function leerCarrito() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function guardarCarrito(cart) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function vaciarCarrito() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function crearLinea(producto, cantidad = 1) {
  return {
    productoId: producto.id,
    nombre: producto.nombre,
    precioUnitario: Number(producto.precio_venta) || 0,
    imagenUrl: producto.imagen_url || null,
    cantidad,
  };
}

export function agregarAlCarrito(cart, producto, cantidad = 1) {
  const idx = cart.findIndex((l) => l.productoId === producto.id);
  if (idx === -1) return [...cart, crearLinea(producto, cantidad)];
  const next = [...cart];
  next[idx] = { ...next[idx], cantidad: next[idx].cantidad + cantidad };
  return next;
}

export function actualizarCantidad(cart, productoId, cantidad) {
  if (cantidad <= 0) return quitarLinea(cart, productoId);
  return cart.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l));
}

export function quitarLinea(cart, productoId) {
  return cart.filter((l) => l.productoId !== productoId);
}

export function calcularTotales(cart) {
  const totalArticulos = cart.reduce((acc, l) => acc + (Number(l.cantidad) || 0), 0);
  const total = round2(cart.reduce((acc, l) => acc + (Number(l.precioUnitario) || 0) * (Number(l.cantidad) || 0), 0));
  return { totalArticulos, total };
}

// Regla de negocio: si el stock de un producto llega a 0 mientras espera en
// el carrito, se quita solo; si baja pero sigue > 0, la cantidad se topa al
// stock disponible. `productosPorId` es un Map/objeto {id: producto} con el
// stock fresco leído del catálogo.
export function sincronizarStock(cart, productosPorId) {
  const siguiente = [];
  const removidos = [];
  for (const linea of cart) {
    const producto = productosPorId[linea.productoId];
    const stock = producto ? Number(producto.stock) || 0 : 0;
    if (!producto || stock <= 0) {
      removidos.push(linea);
      continue;
    }
    siguiente.push(linea.cantidad > stock ? { ...linea, cantidad: stock } : linea);
  }
  return { cart: siguiente, removidos };
}
