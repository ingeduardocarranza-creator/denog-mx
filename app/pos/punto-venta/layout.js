'use client'
import MenuLateral from '../../components/MenuLateral'
import { GRUPOS_COLABORADOR } from '../../../lib/menuColaborador'

// El menú lateral queda integrado directamente en Punto de Venta (mismo
// componente/lógica que usa app/admin/layout.js para colaboradores), para
// que puedan navegar a Domicilios o Pedidos del Mercadito sin necesidad de
// un botón aparte y sin tener que abrir turno primero — la máquina de
// estados de Punto de Venta (abrir turno, caja ocupada, turno activo, etc.)
// vive dentro de page.js y no se toca aquí.
export default function PuntoVentaLayout({ children }) {
  return <MenuLateral grupos={GRUPOS_COLABORADOR}>{children}</MenuLateral>
}
