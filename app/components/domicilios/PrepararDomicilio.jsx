'use client'
import { useState } from 'react'

// Preparación de un domicilio dentro de su tarjeta: etiqueta "Por preparar" /
// "Preparado", la lista de piezas con foto (frágiles primero) y el botón para
// marcarlo preparado. Lo usa quien empaca; el admin solo agenda.
// `items` vienen de /api/domicilios/carga; `onMarcar(true|false)` guarda.
const chip = (bg, color) => ({ background: bg, color, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' })

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (f) => { if (!f) return ''; const [y, m, d] = f.split('-').map(Number); return `${d} ${MESES[m - 1]} ${y}` }
const piezasDe = (arr) => arr.reduce((s, i) => s + (i.cantidad || 1), 0)

// Agrupa las piezas por entrega (la más antigua primero); lo que no viene de
// un estado de cuenta va en sus propios grupos al final.
function agrupar(items) {
  const mapa = new Map()
  for (const it of items) {
    const k = it.entrega_fecha ? `e:${it.entrega_fecha}` : it.origen === 'tienda' ? 'tienda' : it.origen === 'mercadito' ? 'mercadito' : 'sin'
    if (!mapa.has(k)) mapa.set(k, { k, fecha: it.entrega_fecha || null, titulo: null, items: [] })
    mapa.get(k).items.push(it)
  }
  const titulo = { tienda: '🛍️ Compras de la tienda', mercadito: '🛒 Pedido del Mercadito', sin: 'Otras piezas' }
  return [...mapa.values()]
    .map(g => ({ ...g, titulo: g.fecha ? `Entrega del ${fechaCorta(g.fecha)}` : titulo[g.k] }))
    .sort((a, b) => (a.fecha && b.fecha ? a.fecha.localeCompare(b.fecha) : a.fecha ? -1 : b.fecha ? 1 : 0))
}

function Fila({ it }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--w06)' }}>
      <div style={{ flex: 'none', minWidth: 34, height: 30, padding: '0 8px', borderRadius: 8, background: 'var(--w06)', color: 'var(--marca-t)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>×{it.cantidad || 1}</div>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--w05)', overflow: 'hidden', flex: 'none', border: it.fragil ? '2px solid var(--ambar-borde)' : '1px solid var(--w15)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {it.foto ? <img src={it.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tinta)', lineHeight: 1.3 }}>{it.nombre}</span>
        {it.fragil && <span style={{ flex: 'none', background: 'var(--ambar)', color: '#ffffff', borderRadius: 7, padding: '3px 9px', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>⚠ APARTADOS / FRÁGIL</span>}
      </div>
      {!it.empacado && <span style={{ flex: 'none', ...chip('rgba(251,191,36,0.2)', 'var(--ambar-t)') }}>Falta empacar</span>}
    </div>
  )
}

export default function PrepararDomicilio({ preparado, items, onMarcar }) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  if (!items) return null
  const piezas = piezasDe(items)
  const fragiles = items.filter(i => i.fragil)
  const grupos = agrupar(items)
  const sinEmpacar = items.filter(i => !i.empacado).reduce((s, i) => s + (i.cantidad || 1), 0)

  const marcar = async (v) => {
    setGuardando(true)
    try { await onMarcar(v) } finally { setGuardando(false) }
  }

  return (
    <div style={{ border: `1px solid ${preparado ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.35)'}`, background: preparado ? 'rgba(74,222,128,0.07)' : 'rgba(251,191,36,0.07)', borderRadius: 12, padding: '8px 12px', marginBottom: 10 }}>
      <div onClick={() => setAbierto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
        <span style={chip(preparado ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.22)', preparado ? 'var(--verde)' : 'var(--ambar)')}>{preparado ? '✓ Preparado' : '⏳ Por preparar'}</span>
        {grupos.length > 1 && <span style={chip('var(--w05)', 'var(--w60)')}>{grupos.length} entregas</span>}
        <span style={chip('var(--w05)', 'var(--w60)')}>{piezas} pieza{piezas === 1 ? '' : 's'}</span>
        {fragiles.length > 0 && <span style={chip('rgba(251,191,36,0.18)', 'var(--ambar)')}>⚠️ {fragiles.reduce((s, i) => s + (i.cantidad || 1), 0)} frágiles</span>}
        {!preparado && sinEmpacar > 0 && <span style={chip('rgba(248,113,113,0.15)', 'var(--rojo-t)')}>{sinEmpacar} sin empacar</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--w40)', fontSize: 12 }}>{abierto ? 'Ocultar ▴' : 'Ver piezas ▾'}</span>
      </div>

      {abierto && (
        <div style={{ marginTop: 8 }}>
          {items.length === 0 && <div style={{ color: 'var(--w40)', fontSize: 12, padding: '6px 0' }}>Este domicilio no tiene piezas por preparar.</div>}
          {grupos.map(g => {
            const ordenados = [...g.items.filter(i => i.fragil), ...g.items.filter(i => !i.fragil)]
            const fr = piezasDe(g.items.filter(i => i.fragil))
            const sin = piezasDe(g.items.filter(i => !i.empacado))
            return (
              <div key={g.k} style={{ background: 'var(--sup, #fffaf3)', border: '1px solid var(--w08)', borderRadius: 16, overflow: 'hidden', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 16px', background: 'var(--w03)', borderBottom: '1px solid var(--w08)' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--tinta)', letterSpacing: '0.02em' }}>
                    {g.fecha ? `ENTREGA: ${fechaCorta(g.fecha).toUpperCase()}` : g.titulo.toUpperCase()}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {fr > 0 && <span style={chip('rgba(251,191,36,0.18)', 'var(--ambar-t)')}>⚠ {fr} frágil{fr === 1 ? '' : 'es'}</span>}
                    {sin > 0
                      ? <span style={chip('rgba(248,113,113,0.15)', 'var(--rojo-t)')}>{sin} sin empacar</span>
                      : <span style={chip('rgba(74,222,128,0.15)', 'var(--verde)')}>✓ Todo empacado</span>}
                  </div>
                </div>
                <div style={{ padding: '0 16px' }}>
                  {ordenados.map(it => <Fila key={it.clave} it={it} />)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--w03)', fontSize: 12.5, fontWeight: 700, color: 'var(--w60)' }}>
                  <span>Piezas de esta entrega</span>
                  <span style={{ color: 'var(--tinta)' }}>{piezasDe(g.items)}</span>
                </div>
              </div>
            )
          })}
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
