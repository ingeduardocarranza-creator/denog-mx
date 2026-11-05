'use client'
import { useEffect, useRef, useState } from 'react'
import { crearEscaner } from '@/lib/bodega/escaner'

// Cámara para escanear códigos de barras desde el celular.
// Reutiliza el mismo lector de la sección Bodega. Cada lectura llama a
// onLeer(textos); después hace una pausa corta para que el colaborador
// mueva el producto (si lleva 2 piezas, el mismo código se escanea 2 veces).
export default function CamaraLector({ onLeer, pausa = 1800, ayuda = 'Apunta al código de barras' }) {
  const [abierta, setAbierta] = useState(false)
  const [error, setError] = useState('')
  const [hayLinterna, setHayLinterna] = useState(false)
  const [linterna, setLinterna] = useState(false)
  const videoRef = useRef(null)
  const escanerRef = useRef(null)
  const bloqueoRef = useRef(false)
  const onLeerRef = useRef(onLeer)
  useEffect(() => { onLeerRef.current = onLeer })

  useEffect(() => {
    if (!abierta) return
    let cancelado = false
    ;(async () => {
      try {
        setError('')
        const esc = await crearEscaner({
          video: videoRef.current,
          pausado: false,
          onCodigos: (codigos) => {
            if (bloqueoRef.current) return
            const textos = (codigos || []).map(c => c.texto).filter(Boolean)
            if (!textos.length) return
            bloqueoRef.current = true
            Promise.resolve(onLeerRef.current(textos)).catch(() => {}).finally(() => {
              setTimeout(() => { bloqueoRef.current = false }, pausa)
            })
          },
        })
        if (cancelado) { esc.detener(); return }
        escanerRef.current = esc
        setHayLinterna(esc.tieneLinterna)
      } catch {
        if (!cancelado) {
          setError('No se pudo abrir la cámara. Revisa que el navegador tenga permiso para usarla.')
          setAbierta(false)
        }
      }
    })()
    return () => {
      cancelado = true
      try { escanerRef.current?.detener() } catch {}
      escanerRef.current = null
      setHayLinterna(false); setLinterna(false)
    }
  }, [abierta, pausa])

  async function alternarLinterna() {
    const nuevo = await escanerRef.current?.linterna(!linterna)
    setLinterna(!!nuevo)
  }

  if (!abierta) {
    return (
      <div>
        <button onClick={() => setAbierta(true)}
          style={{ width: '100%', minHeight: 64, borderRadius: 14, border: '3px dashed #466D9B', background: 'transparent', color: '#466D9B', fontSize: 20, fontWeight: 800, cursor: 'pointer' }}>
          📷 Escanear con la cámara del celular
        </button>
        {error && <div style={{ marginTop: 8, color: '#C8362C', fontWeight: 700, fontSize: 15 }}>{error}</div>}
      </div>
    )
  }
  return (
    <div>
      <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: '#16202c', aspectRatio: '4 / 3', border: '4px solid #fff', boxShadow: '0 10px 26px rgba(47,77,112,0.25)' }}>
        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', left: '8%', right: '8%', top: '28%', height: '40%', border: '3px solid rgba(255,255,255,0.9)', borderRadius: 12, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(255,255,255,0.92)', color: '#2F4D70', borderRadius: 999, padding: '6px 14px', fontSize: 14, fontWeight: 700 }}>{ayuda}</div>
        </div>
        {hayLinterna && (
          <button onClick={alternarLinterna}
            style={{ position: 'absolute', right: 10, bottom: 10, height: 44, padding: '0 14px', borderRadius: 22, border: 'none', background: linterna ? '#fde68a' : 'rgba(255,255,255,0.92)', color: linterna ? '#7c4a03' : '#2F4D70', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {linterna ? 'Apagar luz' : 'Prender luz'}
          </button>
        )}
      </div>
      <button onClick={() => setAbierta(false)}
        style={{ marginTop: 10, minHeight: 44, padding: '0 18px', borderRadius: 12, border: '2px solid #C9A98F', background: 'transparent', color: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Cerrar cámara
      </button>
    </div>
  )
}
