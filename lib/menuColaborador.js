// Menú lateral reducido para colaboradores/vendedores: sólo lo que necesitan
// para operar. Compartido por app/admin/layout.js (cuando el usuario no es
// admin) y app/pos/punto-venta/layout.js (para que el menú esté integrado ahí
// mismo, sin necesidad de un botón aparte) — una sola fuente de verdad.
//
// Una cosa que estuvo aquí y ya no:
// · WHATSAPP → Pendientes. No funciona para el colaborador; sólo le mostraba
//   un contador de 99+ que no podía atender.
//
// OPERACIONES → Domicilios SÍ está, aunque el punto de venta también tiene su
// propia pestaña de Domicilio -- a propósito, pedido por Lalo el 22 sep 2026:
// el POS solo lo puede usar una persona a la vez, así que sin esta entrada
// aparte en el menú, ningún otro colaborador podía ver ni gestionar
// domicilios mientras alguien más estuviera en el punto de venta.
export const GRUPOS_COLABORADOR = [
  {
    label: 'OPERACIONES',
    items: [
      { label: 'Punto de venta', icon: '🏪', href: '/pos/punto-venta' },
      { label: 'Domicilios',     icon: '🚚', href: '/admin/domicilios', badgeKey: 'domicilios' },
      { label: 'Catálogo',       icon: '🏷️', href: '/pos/catalogo' },
      { label: 'Inventario',    icon: '🗃️', href: '/admin/inventario' },
    ],
  },
  {
    label: 'MERCADITO',
    items: [
      { label: 'Pedidos', icon: '🛍️', href: '/admin/mercadito', badgeKey: 'mercadito' },
    ],
  },
]
