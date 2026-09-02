// Menú lateral reducido para colaboradores/vendedores: sólo lo que necesitan
// para operar. Compartido por app/admin/layout.js (cuando el usuario no es
// admin) y app/pos/punto-venta/layout.js (para que el menú esté integrado ahí
// mismo, sin necesidad de un botón aparte) — una sola fuente de verdad.
//
// Dos cosas que estuvieron aquí y ya no:
// · WHATSAPP → Pendientes. No funciona para el colaborador; sólo le mostraba
//   un contador de 99+ que no podía atender.
// · OPERACIONES → Domicilios. Estaba repetido: el punto de venta ya tiene su
//   propia pestaña de Domicilio, con el contador de cuántos hay hoy.
export const GRUPOS_COLABORADOR = [
  {
    label: 'OPERACIONES',
    items: [
      { label: 'Punto de venta', icon: '🏪', href: '/pos/punto-venta' },
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
