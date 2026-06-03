'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PosRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.push('/pos/punto-venta')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Cargando...</div>
    </div>
  )
}