'use client'
import { useState } from 'react'

// Buscador de cliente para agendar un domicilio: se escriben unas letras del
// nombre (o del teléfono) y se elige de la lista, sin recorrer todos los
// clientes. Compartido por admin y POS. `valor` es el id elegido y
// `onSelect(id)` se llama al elegir ('' al pulsar Cambiar).
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function SelectorCliente({ clientes, valor, onSelect }) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const elegido = (clientes || []).find(c => String(c.id) === String(valor))

  if (elegido) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '8px 12px' }}>
        <span style={{ flex: 1, color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{elegido.nombre}</span>
        <button type="button" onClick={() => { setQ(''); onSelect('') }}
          style={{ background: 'transparent', border: '1px solid var(--w10)', borderRadius: 8, padding: '4px 10px', color: 'var(--w50)', fontSize: 11, cursor: 'pointer' }}>Cambiar</button>
      </div>
    )
  }

  const n = norm(q).trim()
  const lista = (clientes || [])
    .filter(c => !n || norm(c.nombre).includes(n) || norm(c.telefono).includes(n) || norm(c.celular_contacto).includes(n))
    .slice(0, 8)

  return (
    <div style={{ position: 'relative' }}>
      <input type="text" value={q} placeholder="Escribe el nombre del cliente…" autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      {abierto && lista.length > 0 && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--surface-2, #fff)', border: '1px solid var(--w10)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          {lista.map(c => (
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); setAbierto(false); onSelect(String(c.id)) }}
              style={{ padding: '9px 12px', cursor: 'pointer', borderTop: '1px solid var(--w06)', color: 'var(--tinta)', fontSize: 13 }}>
              {c.nombre}{c.telefono ? <span style={{ color: 'var(--w40)', fontSize: 11 }}> · {c.telefono}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
