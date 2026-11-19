'use client'
import { useState } from 'react'

// Botón grande para copiar la guía con un toque (funciona en celular).
export default function BotonCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Respaldo para navegadores sin permiso de portapapeles.
      const t = document.createElement('textarea')
      t.value = texto
      document.body.appendChild(t)
      t.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(t)
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2200)
  }

  return (
    <button
      onClick={copiar}
      style={{
        width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', cursor: 'pointer',
        background: copiado ? '#0f9e72' : '#466D9B', color: '#fff', fontSize: 16, fontWeight: 700,
        fontFamily: 'inherit', transition: 'background .15s',
      }}
    >
      {copiado ? 'Guía copiada' : 'Copiar guía'}
    </button>
  )
}
