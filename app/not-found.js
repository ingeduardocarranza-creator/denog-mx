'use client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(175deg, #fdfaf5 0%, #fbf8f3 40%, #f5ecdf 100%)',
      padding: '40px 24px', textAlign: 'center', fontFamily: 'sans-serif',
    }}>
      <Image src="/assets/wordmark-v2.png" alt="Denog" width={80} height={80}
        style={{ height: 80, width: 'auto', marginBottom: 24, filter: 'drop-shadow(0 6px 16px rgba(193,85,58,.3))' }} />

      <div style={{ fontSize: 72, fontWeight: 800, color: '#c1553a', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#2a2118', margin: '12px 0 8px' }}>
        Página no encontrada
      </div>
      <div style={{ fontSize: 15, color: 'rgba(42,33,24,0.55)', maxWidth: 340, lineHeight: 1.6, marginBottom: 32 }}>
        La dirección que buscas no existe o fue movida. Regresa al inicio y continúa desde ahí.
      </div>

      <button onClick={() => router.push('/')} style={{
        background: '#c1553a', color: '#fff', border: 'none', borderRadius: 14,
        padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(193,85,58,.35)',
      }}>
        Ir al inicio →
      </button>
    </div>
  )
}
