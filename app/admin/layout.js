'use client'
import { useState, useEffect } from 'react'
import MenuLateral from '../components/MenuLateral'
import { GRUPOS_COLABORADOR } from '../../lib/menuColaborador'

const grupos = [
  {
    label: 'WHATSAPP',
    items: [
      { label: 'Pendientes', icon: '🔔', href: '/admin/pendientes', badgeKey: 'pendientes' },
    ],
  },
  {
    label: 'OPERACIONES',
    items: [
      { label: 'Punto de venta', icon: '🏪', href: '/admin/punto-venta' },
      { label: 'Domicilios',     icon: '🚚', href: '/admin/domicilios', badgeKey: 'domicilios' },
      { label: 'Caja',           icon: '💰', href: '/admin/caja' },
      { label: 'Catálogo',       icon: '🏷️', href: '/admin/catalogo' },
    ],
  },
  {
    label: 'MERCADITO',
    items: [
      { label: 'Pedidos',  icon: '🛍️', href: '/admin/mercadito', badgeKey: 'mercadito' },
      { label: 'Reportes', icon: '📊', href: '/admin/mercadito/reportes' },
    ],
  },
  {
    label: 'ENCARGOS',
    items: [
      { label: 'Pedidos',           icon: '📝', href: '/admin/pedidos' },
      { label: 'Entregas',          icon: '📅', href: '/admin/entregas' },
      { label: 'Empacado',          icon: '📦', href: '/admin/empacado' },
      { label: 'Anticipos',         icon: '💳', href: '/admin/anticipos' },
      { label: 'Estados de cuenta', icon: '📋', href: '/admin/estados-cuenta' },
      { label: 'Cotizador',         icon: '🧮', href: '/admin/cotizador' },
    ],
  },
  {
    label: 'CLIENTES',
    items: [
      { label: 'Clientes',  icon: '👥', href: '/admin/clientes' },
      { label: 'Score',     icon: '⭐', href: '/admin/clientes/score' },
      { label: 'Reportes',  icon: '📊', href: '/admin/reportes' },
    ],
  },
  {
    label: 'EQUIPO',
    items: [
      { label: 'Colaboradores', icon: '🏆', href: '/admin/colaboradores' },
      { label: 'Gestión equipo', icon: '👤', href: '/admin/colaboradores-admin' },
    ],
  },
]

export default function AdminLayout({ children }) {
  const [usuario, setUsuario] = useState(null)

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) setUsuario(JSON.parse(datos))
  }, [])

  const gruposVisibles = usuario?.rol === 'admin' ? grupos : GRUPOS_COLABORADOR

  return <MenuLateral grupos={gruposVisibles}>{children}</MenuLateral>
}
