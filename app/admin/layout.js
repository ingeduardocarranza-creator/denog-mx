'use client'
import { useState, useEffect } from 'react'
import MenuLateral from '../components/MenuLateral'
import JarvisBurbuja from '../components/JarvisBurbuja'
import { GRUPOS_COLABORADOR } from '../../lib/menuColaborador'
import { useTema } from '../../lib/tema'

// Menú del admin, agrupado por cómo se trabaja en Denog (no por quién lo
// programó primero). Las 33 secciones de siempre, ninguna se perdió:
//
//  · Tienda      — el mostrador: lo que pasa con el cliente enfrente.
//  · Mercadito   — lo que los clientes piden desde el sitio web.
//  · Encargos    — el ciclo de 15 días, EN ORDEN: pedido → cotización →
//                  paquetes en Nogales → empacado → entrega → domicilio o
//                  envío foráneo.
//  · Dinero      — caja, cobros, gastos y reportes.
//  · Publicar    — lo que se publica a grupos, Marketplace y WhatsApp.
//  · MercadoLibre, Gente.
//
// `icono` es el nombre de un icono de lucide (ver ICONOS_GRUPO en
// MenuLateral). El menú de colaboradores es aparte (lib/menuColaborador.js).

// Accesos fijos de HOY: lo que se usa todos los días, siempre a la mano.
const fijos = [
  { label: 'Jarvis · Mis misiones', icon: '🎯', href: '/admin/jarvis', ancho: true },
  { label: 'Punto de venta', icon: '🏪', href: '/admin/punto-venta' },
  { label: 'Domicilios',     icon: '🚚', href: '/admin/domicilios', badgeKey: 'domicilios' },
  { label: 'Empacado',       icon: '📦', href: '/admin/empacado' },
  { label: 'Pedidos',        icon: '📝', href: '/admin/pedidos', badgeKey: 'pendientes' },
]

const grupos = [
  {
    label: 'Tienda', icono: 'Store',
    items: [
      { label: 'Punto de venta', icon: '🏪', href: '/admin/punto-venta' },
      { label: 'Apartados',      icon: '🛍️', href: '/admin/apartados' },
      { label: 'Catálogo',       icon: '🏷️', href: '/admin/catalogo' },
      { label: 'Inventario',     icon: '🗃️', href: '/admin/inventario' },
    ],
  },
  {
    label: 'Mercadito', icono: 'ShoppingBag',
    items: [
      { label: 'Pedidos',  icon: '🛍️', href: '/admin/mercadito', badgeKey: 'mercadito' },
      { label: 'Reportes', icon: '📊', href: '/admin/mercadito/reportes' },
    ],
  },
  {
    label: 'Encargos', icono: 'Package',
    items: [
      { label: 'Pedidos',           icon: '📝', href: '/admin/pedidos', badgeKey: 'pendientes' },
      { label: 'Cotizador',         icon: '🧮', href: '/admin/cotizador' },
      { label: 'Paquetes Nogales',  icon: '📥', href: '/admin/paquetes-nogales' },
      { label: 'Empacado',          icon: '📦', href: '/admin/empacado' },
      { label: 'Entregas',          icon: '📅', href: '/admin/entregas' },
      { label: 'Domicilios',        icon: '🚚', href: '/admin/domicilios', badgeKey: 'domicilios' },
      { label: 'Envíos foráneos',   icon: '📦', href: '/admin/envios-foraneos' },
    ],
  },
  {
    label: 'Dinero', icono: 'Wallet',
    items: [
      { label: 'Caja',              icon: '💰', href: '/admin/caja' },
      { label: 'Anticipos',         icon: '💳', href: '/admin/anticipos' },
      { label: 'Cobranza',          icon: '📞', href: '/admin/cobranza' },
      { label: 'Estados de cuenta', icon: '📋', href: '/admin/estados-cuenta' },
      { label: 'Gastos',            icon: '🧾', href: '/admin/gastos', badgeKey: 'gastos' },
      { label: 'Reportes',          icon: '📊', href: '/admin/reportes' },
    ],
  },
  {
    label: 'Publicar', icono: 'Megaphone',
    items: [
      { label: 'Tendencias',       icon: '📈', href: '/admin/tendencias' },
      { label: 'Marketplace',      icon: '🛍️', href: '/admin/marketplace' },
      { label: 'Reenvío WhatsApp', icon: '📲', href: '/admin/reenvio-whatsapp' },
    ],
  },
  {
    label: 'MercadoLibre', icono: 'ShoppingCart',
    items: [
      { label: 'Por comprar', icon: '🛒', href: '/admin/mercadolibre/por-comprar' },
      { label: 'Empacar MercadoLibre', icon: '📦', href: '/admin/mercadolibre/empaque' },
      { label: 'Borradores de publicación', icon: '📝', href: '/admin/mercadolibre/borradores' },
      { label: 'Oportunidades', icon: '💡', href: '/admin/mercadolibre/oportunidades' },
      { label: 'Conexión y publicaciones', icon: '🟡', href: '/admin/mercadolibre' },
    ],
  },
  {
    label: 'Gente', icono: 'Users',
    items: [
      { label: 'Clientes',       icon: '👥', href: '/admin/clientes' },
      { label: 'Score',          icon: '⭐', href: '/admin/clientes/score' },
      { label: 'Colaboradores',  icon: '🏆', href: '/admin/colaboradores' },
      { label: 'Gestión equipo', icon: '👤', href: '/admin/colaboradores-admin' },
      // Sólo en el menú de admin: es el registro de quién tocó el dinero.
      { label: 'Bitácora',       icon: '📜', href: '/admin/bitacora' },
    ],
  },
]

export default function AdminLayout({ children }) {
  const [usuario, setUsuario] = useState(null)
  const { clase } = useTema()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) setUsuario(JSON.parse(datos))
  }, [])

  const esAdmin = usuario?.rol === 'admin'
  const gruposVisibles = esAdmin ? grupos : GRUPOS_COLABORADOR

  // De esta clase cuelgan los tokens de color que usan el menú y las 22
  // pantallas.
  return (
    <div className={clase} style={{ minHeight: '100vh' }}>
      <MenuLateral grupos={gruposVisibles} fijos={esAdmin ? fijos : []} acordeon={esAdmin}>{children}</MenuLateral>
      <JarvisBurbuja />
    </div>
  )
}
