'use client'
import { useState } from 'react'

// Preparación de un domicilio dentro de su tarjeta: etiqueta "Por preparar" /
// "Preparado", la lista de piezas con foto (frágiles primero) y el botón para
// marcarlo preparado. Lo usa quien empaca; el admin solo agenda.
// `items` vienen de /api/domicilios/carga; `onMarcar(true|false)` guarda.
const chip = (bg, color) => ({ background: bg, color, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' })

function Fila({ it }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--w06)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--w05)', overflow: 'hidden', flex: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {it.foto ? <img src={it.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0, color: 'var(--tinta)', fontSize: 12.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.nombre}</div>
      {!it.empacado && <span style={chip('rgba(251,191,36,0.18)', 'var(--ambar)')}>Falta empacar</span>}
      <span style={{ ...chip('var(--w05)', 'var(--tinta)'), fontSize: 12 }}>× {it.cantidad}</span>
    </div>
  )
}

export default function PrepararDomicilio({ preparado, items, onMarcar }) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  if (!items) return null
  const piezas = items.reduce((s, i) => s + (i.cantidad || 1), 0)
  const fragiles = items.filter(i => i.fragil)
  const resto = items.filter(i => !i.fragil)
  const sinEmpacar = items.filter(i => !i.empacado).reduce((s, i) => s + (i.cantidad || 1), 0)

  const marcar = async (v) => {
    setGuardando(true)
    try { await onMarcar(v) } finally { setGuardando(false) }
  }

  return (
    <div style={{ border: `1px solid ${preparado ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.35)'}`, background: preparado ? 'rgba(74,222,128,0.07)' : 'rgba(251,191,36,0.07)', borderRadius: 12, padding: '8px 12px', marginBottom: 10 }}>
      <div onClick={() => setAbierto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
        <span style={chip(preparado ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.22)', preparado ? 'var(--verde)' : 'var(--ambar)')}>{preparado ? '✓ Preparado' : '⏳ Por preparar'}</span>
        <span style={chip('var(--w05)', 'var(--w60)')}>{piezas} pieza{piezas === 1 ? '' : 's'}</span>
        {fragiles.length > 0 && <span style={chip('rgba(251,191,36,0.18)', 'var(--ambar)')}>⚠️ {fragiles.reduce((s, i) => s + (i.cantidad || 1), 0)} frágiles</span>}
        {!preparado && sinEmpacar > 0 && <span style={chip('rgba(248,113,113,0.15)', 'var(--rojo-t)')}>{sinEmpacar} sin empacar</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--w40)', fontSize: 12 }}>{abierto ? 'Ocultar ▴' : 'Ver piezas ▾'}</span>
      </div>

      {abierto && (
        <div style={{ marginTop: 8 }}>
          {items.length === 0 && <div style={{ color: 'var(--w40)', fontSize: 12, padding: '6px 0' }}>Este domicilio no tiene piezas por preparar.</div>}
          {fragiles.length > 0 && (
            <>
              <div style={{ color: 'var(--ambar)', fontSize: 11, fontWeight: 700, margin: '4px 0' }}>⚠️ Frágiles: llevar aparte</div>
              {fragiles.map(it => <Fila key={it.clave} it={it} />)}
            </>
          )}
          {resto.length > 0 && (
            <>
              {fragiles.length > 0 && <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 700, margin: '10px 0 4px' }}>Resto de la entrega</div>}
              {resto.map(it => <Fila key={it.clave} it={it} />)}
            </>
          )}
          {!preparado && sinEmpacar > 0 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ambar)' }}>⚠️ Todavía hay {sinEmpacar} pieza{sinEmpacar === 1 ? '' : 's'} sin empacar.</div>
          )}
        </div>
      )}

      <button type="button" disabled={guardando} onClick={() => marcar(!preparado)}
        style={{ width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: guardando ? 0.6 : 1,
          border: preparado ? '1px solid var(--w10)' : '1px solid rgba(74,222,128,0.5)',
          background: preparado ? 'var(--w04)' : 'rgba(74,222,128,0.18)', color: preparado ? 'var(--w50)' : 'var(--verde)' }}>
        {guardando ? 'Guardando…' : preparado ? 'Deshacer: volver a "Por preparar"' : '✓ Marcar como preparado'}
      </button>
    </div>
  )
}
