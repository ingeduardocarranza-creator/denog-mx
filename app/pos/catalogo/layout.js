'use client'
import MenuLateral from '../../components/MenuLateral'
import { GRUPOS_COLABORADOR } from '../../../lib/menuColaborador'

export default function CatalogoColaboradorLayout({ children }) {
  return <MenuLateral grupos={GRUPOS_COLABORADOR}>{children}</MenuLateral>
}
