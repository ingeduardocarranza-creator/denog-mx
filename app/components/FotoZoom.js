'use client'
import { useState, useEffect } from 'react'

// Foto de producto de MercadoLibre: se ve nítida y, al tocarla, se abre grande
// para ver bien qué producto es. Se cierra tocando, con Esc o con el botón.
// La miniatura que da MercadoLibre es de 90 px (versión -I): la -O es la mediana
// y la -F la más grande.
const version = (u, letra) => u ? String(u).replace(/-I\.(jpg|jpeg|webp|png)$/i, `-${letra}.$1`) : u

export default function FotoZoom({ url, tam = 64, radio = 10 }) {
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierta(false) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierta])

  if (!url) return <div style={{ width: tam, height: tam, borderRadius: radio, background: 'var(--w10)', flex: 'none' }} />
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} aria-label="Ver la foto grande"
        style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', flex: 'none', width: tam, height: tam, borderRadius: radio, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={version(url, 'O')} alt="" width={tam} height={tam} style={{ width: tam, height: tam, objectFit: 'cover', display: 'block' }} />
      </button>
      {abierta && (
        <div role="dialog" aria-modal="true" onClick={() => setAbierta(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar"
            style={{ position: 'absolute', top: 16, right: 16, width: 48, height: 48, borderRadius: '50%', border: 'none', background: '#fff', color: '#111', fontSize: 26, fontWeight: 800, cursor: 'pointer' }}>×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={version(url, 'F')} alt="Foto del producto" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, background: '#fff', cursor: 'default' }} />
        </div>
      )}
    </>
  )
}
