// Menú lateral reducido para colaboradores/vendedores: solo lo que
// necesitan para operar (Punto de venta, Domicilios, Pedidos del
// Mercadito). Compartido por app/admin/layout.js (cuando el usuario no es
// admin) y app/pos/punto-venta/layout.js (para que el menú esté integrado
// ahí mismo, sin necesidad de un botón aparte) — una sola fuente de verdad.
export const GRUPOS_COLABORADOR = [
  {
    label: 'OPERACIONES',
    items: [
      { label: 'Punto de venta', icon: '🏪', href: '/pos/punto-venta' },
      { label: 'Domicilios',     icon: '🚚', href: '/admin/domicilios', badgeKey: 'domicilios' },
      { label: 'Catálogo',       icon: '🏷️', href: '/pos/catalogo' },
    ],
  },
  {
    label: 'MERCADITO',
    items: [
      { label: 'Pedidos', icon: '🛍️', href: '/admin/mercadito', badgeKey: 'mercadito' },
    ],
  },
]
