'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PosRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.push('/pos/punto-venta')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--w40)', fontSize: 14 }}>Cargando...</div>
    </div>
  )
}