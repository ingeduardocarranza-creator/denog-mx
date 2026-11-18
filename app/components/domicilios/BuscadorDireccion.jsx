'use client'
import { useEffect, useRef, useState } from 'react'

// Barra de búsqueda de direcciones (Google Maps). Al elegir una opción llama
// onSelect({ direccion, colonia, lat, lng }) con la ubicación exacta.
const nuevoToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())

export default function BuscadorDireccion({ onSelect }) {
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const [cargandoLugar, setCargandoLugar] = useState(false)
  const token = useRef(nuevoToken())
  const ultima = useRef('')

  useEffect(() => {
    if (texto.trim().length < 3 || texto === ultima.current) return
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/domicilios/autocompletar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: texto, token: token.current }),
        }).then((r) => r.json())
        if (!vivo) return
        if (res.ok) { setSugerencias(res.sugerencias); setAbierto(true); setError('') }
        else setError(res.mensaje || 'Buscador no disponible')
      } catch { if (vivo) setError('Buscador no disponible') }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [texto])

  const elegir = async (s) => {
    setCargandoLugar(true)
    setAbierto(false)
    ultima.current = `${s.principal}, ${s.secundario}`
    setTexto(ultima.current)
    try {
      const res = await fetch('/api/domicilios/lugar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: s.placeId, token: token.current }),
      }).then((r) => r.json())
      if (res.ok) { onSelect(res); setError('') }
      else setError(res.mensaje || 'No se pudo leer la dirección')
    } catch { setError('No se pudo leer la dirección') }
    token.current = nuevoToken()   // una sesión nueva por cada dirección elegida
    setCargandoLugar(false)
  }

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>
        Buscar dirección en Google Maps
      </label>
      <input
        type="text" value={texto} placeholder="Escribe la calle, número y colonia…"
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onFocus={() => sugerencias.length && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
      />
      {cargandoLugar && <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 4 }}>Cargando ubicación…</div>}
      {error && <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 4 }}>Buscador no disponible ({error}). Puedes escribir la dirección a mano abajo.</div>}
      {abierto && sugerencias.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, marginTop: 4, background: 'var(--surface-2, #fff)', border: '1px solid var(--w10)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {sugerencias.map((s) => (
            <div key={s.placeId} onMouseDown={(e) => { e.preventDefault(); elegir(s) }}
              style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--w05)' }}>
              <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{s.principal}</div>
              <div style={{ color: 'var(--w40)', fontSize: 11 }}>{s.secundario}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
