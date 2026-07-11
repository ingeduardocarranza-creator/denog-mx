// Categorías del catálogo (productos_tienda, compartido con Operaciones):
// emoji para el riel lateral del cliente en Mercadito. Categorías nuevas
// capturadas por el admin (fuera de esta lista) usan el emoji de respaldo.
export const CATEGORIAS_DEFAULT = [
  { nombre: 'Ropa', emoji: '👕' },
  { nombre: 'Calzado', emoji: '👟' },
  { nombre: 'Comida / Snacks', emoji: '🍫' },
  { nombre: 'Artículos de Hogar', emoji: '🏠' },
  { nombre: 'Cuidado Personal', emoji: '🧴' },
  { nombre: 'Accesorios', emoji: '👜' },
  { nombre: 'Articulos Deportivos', emoji: '⚽' },
  { nombre: 'Tazas y Termos', emoji: '🥤' },
  { nombre: 'Automotriz', emoji: '🚗' },
  { nombre: 'Electronica', emoji: '🔌' },
  { nombre: 'Papeleria', emoji: '✏️' },
  { nombre: 'Juguetes', emoji: '🧸' },
  { nombre: 'Suplementos', emoji: '💊' },
];

const EMOJI_FALLBACK = '🛍️';

export function emojiPara(nombreCategoria) {
  const match = CATEGORIAS_DEFAULT.find(
    (c) => c.nombre.toLowerCase() === (nombreCategoria || '').toLowerCase()
  );
  return match ? match.emoji : EMOJI_FALLBACK;
}
