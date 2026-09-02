'use client'
import { useTema } from '../../lib/tema'

// Las pantallas del colaborador (/pos/*) se habían quedado fuera del tema
// claro: ninguna llamaba a useTema(), así que <html> nunca recibía la clase y
// seguían oscuras mientras el resto del panel ya era claro. Este layout lo
// aplica una sola vez para toda la rama.
export default function PosLayout({ children }) {
  const { clase } = useTema()
  return <div className={clase}>{children}</div>
}
