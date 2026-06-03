'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PuntoVentaLayout({ children }) {
  const [rol, setRol] = useState(null)

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) {
      const c = JSON.parse(datos)
      setRol(c.rol)
    }
  }, [])

  // Si es admin, usa el layout normal (ya tiene el menú del admin)
  // Si es vendedor, muestra solo el punto de venta sin menú
  if (rol === 'vendedor') {
    return <>{children}</>
  }

  return <>{children}</>
}