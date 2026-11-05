'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import CamaraLector from '@/app/components/CamaraLector'

const AZUL = '#466D9B'
const ROJO = '#C8362C'
const borde = '2px solid var(--w10)'

// "Se sustituye por": busca en el catálogo (escribiendo o escaneando),
// pone cuántas piezas se mandan y confirma. onConfirmar(item_row_id, [{producto_id, cantidad}])
export default function SustituirProducto({ items, onConfirmar, onCerrar, ocupado }) {
  const pendientes = items.filter(i => i.escaneadas < i.cantidad)
  const lista = pendientes.length ? pendientes : items
  const [itemId, setItemId] = useState(lista[0]?.id)
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [cesta, setCesta] = useState([])
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)
  const seq = useRef(0)

  const buscar = useCallback(async (texto) => {
    const t = String(texto || '').trim()
    if (t.length < 2) { setRes([]); return }
    const mi = ++seq.current
    setBuscando(true)
    try {
      const r = await fetch(`/api/mercadolibre/empaque/productos?q=${encodeURIComponent(t)}`, { cache: 'no-store' })
      const d = await r.json()
      if (mi !== seq.current) return
      if (d.ok) { setRes(d.productos); setError(d.productos.length ? '' : 'No encontré ese producto en el catálogo.') }
      else setError(d.mensaje || 'No se pudo buscar')
    } catch { if (mi === seq.current) setError('No se pudo buscar') }
    if (mi === seq.current) setBuscando(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => buscar(q), 350)
    return () => clearTimeout(t)
  }, [q, buscar])

  const agregar = (p) => {
    setCesta(c => {
      const ya = c.find(x => x.id === p.id)
      if (ya) return c.map(x => x.id === p.id ? { ...x, cantidad: Math.min(x.cantidad + 1, p.stock) } : x)
      return [...c, { ...p, cantidad: 1 }]
    })
    setQ(''); setRes([]); setError('')
  }
  const cambiar = (id, d) => setCesta(c => c.map(x => x.id === id ? { ...x, cantidad: Math.max(1, Math.min(x.cantidad + d, x.stock)) } : x))
  const quitar = (id) => setCesta(c => c.filter(x => x.id !== id))

  // Un código escaneado (lector o cámara) se busca directo en el catálogo.
  const alLeer = useCallback(async (textos) => { setQ(String(textos[0] || '')) }, [])

  const vendido = items.find(i => i.id === itemId)
  const btn = { minHeight: 48, padding: '0 16px', borderRadius: 12, border: borde, background: 'var(--w04)', color: 'var(--tinta)', fontWeight: 700, fontSize: 16, cursor: 'pointer' }

  return (
    <div style={{ background: 'var(--w04)', border: `3px solid ${AZUL}`, borderRadius: 22, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Se sustituye por otro producto</div>
      {lista.length > 1 && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>¿Cuál producto vendido se está sustituyendo?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map(i => (
              <button key={i.id} onClick={() => setItemId(i.id)}
                style={{ ...btn, textAlign: 'left', borderColor: i.id === itemId ? AZUL : undefined, background: i.id === itemId ? 'rgba(70,109,155,0.15)' : btn.background }}>
                {i.titulo} · ×{i.cantidad}
              </button>
            ))}
          </div>
        </div>
      )}
      {vendido && lista.length === 1 && <div style={{ fontSize: 16 }}>Se vendió: <b>{vendido.titulo}</b> ×{vendido.cantidad}</div>}

      <label style={{ fontSize: 16, fontWeight: 800 }}>Busca el producto que sí vas a mandar</label>
      <input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Escribe el nombre o escanea el código…"
        style={{ minHeight: 56, borderRadius: 14, border: `3px solid ${AZUL}`, padding: '0 16px', fontSize: 20, background: 'var(--w05)', color: 'var(--tinta)', outline: 'none' }} />
      <CamaraLector onLeer={alLeer} ayuda="Apunta al código del producto" />
      {buscando && <div style={{ fontSize: 15 }}>Buscando…</div>}
      {error && <div style={{ color: ROJO, fontWeight: 700 }}>{error}</div>}
      {res.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {res.map(p => (
            <button key={p.id} onClick={() => agregar(p)} disabled={p.stock < 1}
              style={{ ...btn, minHeight: 64, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, opacity: p.stock < 1 ? 0.5 : 1 }}>
              {p.imagen_url && <img src={p.imagen_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />}
              <span style={{ flex: 1, minWidth: 0 }}>{p.nombre}{p.variante ? ` · ${p.variante}` : ''}</span>
              <span style={{ fontSize: 14, color: p.stock < 1 ? ROJO : 'inherit' }}>{p.stock < 1 ? 'Sin stock' : `Hay ${p.stock}`}</span>
            </button>
          ))}
        </div>
      )}

      {cesta.length > 0 && (
        <div style={{ borderTop: borde, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Se manda:</div>
          {cesta.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 180px', fontWeight: 700 }}>{p.nombre}</span>
              <button style={btn} onClick={() => cambiar(p.id, -1)} aria-label="Menos">−</button>
              <b style={{ fontSize: 28, minWidth: 36, textAlign: 'center' }}>{p.cantidad}</b>
              <button style={btn} onClick={() => cambiar(p.id, 1)} aria-label="Más">+</button>
              <button style={{ ...btn, color: ROJO }} onClick={() => quitar(p.id)}>Quitar</button>
            </div>
          ))}
          <button disabled={ocupado} onClick={() => onConfirmar(itemId, cesta.map(p => ({ producto_id: p.id, cantidad: p.cantidad })))}
            style={{ minHeight: 64, borderRadius: 14, border: 'none', background: AZUL, color: '#fff', fontSize: 20, fontWeight: 800, cursor: 'pointer', opacity: ocupado ? 0.6 : 1 }}>
            Mandar esto en lugar del vendido
          </button>
        </div>
      )}
      <button style={btn} onClick={onCerrar}>Cancelar</button>
    </div>
  )
}
