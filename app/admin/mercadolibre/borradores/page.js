'use client'
import { useState, useEffect, useCallback } from 'react'

// Borradores de publicación (MercadoLibre) — solo admin.
// Se arman desde el catálogo; tú pones el precio. MercadoLibre los revisa sin
// publicarlos y, al confirmar, se crean EN PAUSA (tú las activas en ML).

const AZUL = '#466D9B'
const campo = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '9px 11px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' }
const btn = (c = AZUL, oc = false) => ({ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: c, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: oc ? 'wait' : 'pointer', opacity: oc ? 0.6 : 1 })
const suave = { minHeight: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--w10)', background: 'var(--w04)', color: 'var(--w60)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }
const caja = { background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }

async function api(cuerpo) {
  const r = await fetch('/api/mercadolibre/borradores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  return r.json()
}

function Borrador({ b, alCambiar }) {
  const [f, setF] = useState(b)
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [cats, setCats] = useState([])
  const [oblig, setOblig] = useState([])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const publicado = b.estado === 'publicado'

  const guardar = async () => {
    const cambios = {
      titulo: f.titulo, descripcion: f.descripcion, categoria_id: f.categoria_id, categoria_nombre: f.categoria_nombre,
      precio: f.precio === '' ? null : Number(f.precio), cantidad: Number(f.cantidad) || 1,
      dias_entrega: f.dias_entrega ? Number(f.dias_entrega) : null, gtin: f.gtin, sku: f.sku, atributos: f.atributos || {},
    }
    return api({ accion: 'guardar', id: b.id, cambios })
  }
  const correr = async (fn) => {
    setOcupado(true); setMsg(null)
    try { await fn() } catch { setMsg({ t: 'rojo', x: 'No se pudo conectar.' }) }
    setOcupado(false)
  }
  const acGuardar = () => correr(async () => {
    const d = await guardar()
    if (d.ok) { setF(d.borrador); setMsg({ t: 'verde', x: 'Guardado.' }); alCambiar() } else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acCats = () => correr(async () => {
    await guardar()
    const d = await api({ accion: 'categorias', id: b.id })
    if (d.ok) setCats(d.categorias); else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acOblig = () => correr(async () => {
    await guardar()
    const d = await api({ accion: 'obligatorios', id: b.id })
    if (d.ok) setOblig(d.obligatorios); else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acValidar = () => correr(async () => {
    const g = await guardar()
    if (!g.ok) { setMsg({ t: 'rojo', x: g.mensaje }); return }
    const d = await api({ accion: 'validar', id: b.id })
    if (!d.ok) { setMsg({ t: 'rojo', x: d.mensaje }); return }
    setF(d.borrador); alCambiar()
    setMsg(d.validacion.ok ? { t: 'verde', x: 'MercadoLibre lo aceptó. Todavía NO está publicado.' } : { t: 'rojo', x: 'MercadoLibre pide corregir:\n• ' + d.validacion.errores.join('\n• ') })
  })
  const acPublicar = () => correr(async () => {
    if (!window.confirm(`Esto CREA la publicación en tu cuenta de MercadoLibre por $${f.precio} (queda en PAUSA). ¿Continuar?`)) return
    const d = await api({ accion: 'publicar', id: b.id, confirmar: true })
    if (d.ok) { setMsg({ t: 'verde', x: `Creada en pausa: ${d.item_id}. ${(d.aviso || []).join(' ')}` }); alCambiar() } else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acDescartar = () => correr(async () => {
    if (!window.confirm('¿Descartar este borrador?')) return
    await api({ accion: 'descartar', id: b.id }); alCambiar()
  })

  return (
    <div style={caja}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: b.estado === 'validado' ? 'rgba(47,143,78,0.15)' : publicado ? 'rgba(70,109,155,0.2)' : 'var(--w10)' }}>
          {publicado ? 'Publicado (en pausa)' : b.estado === 'validado' ? 'Validado por ML' : 'Borrador'}
        </span>
        {publicado && b.enlace_publicado && <a href={b.enlace_publicado} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Ver en MercadoLibre</a>}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {(f.imagenes || []).slice(0, 6).map((u, i) => <img key={i} src={u} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />)}
        {!(f.imagenes || []).length && <div style={{ color: '#C8362C', fontWeight: 700, fontSize: 13 }}>Este producto no tiene fotos en el catálogo.</div>}
      </div>
      <label style={{ fontSize: 12, fontWeight: 700 }}>Título ({(f.titulo || '').length}/60)</label>
      <input style={campo} value={f.titulo || ''} maxLength={60} disabled={publicado} onChange={e => set('titulo', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
        <div><label style={{ fontSize: 12, fontWeight: 700 }}>Precio (MXN)</label><input style={campo} inputMode="decimal" value={f.precio ?? ''} disabled={publicado} onChange={e => set('precio', e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700 }}>Cantidad</label><input style={campo} inputMode="numeric" value={f.cantidad ?? ''} disabled={publicado} onChange={e => set('cantidad', e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700 }}>Días de entrega (vacío = inmediata)</label><input style={campo} inputMode="numeric" value={f.dias_entrega ?? ''} disabled={publicado} onChange={e => set('dias_entrega', e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700 }}>Código de barras</label><input style={campo} value={f.gtin || ''} disabled={publicado} onChange={e => set('gtin', e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 700 }}>SKU</label><input style={campo} value={f.sku || ''} disabled={publicado} onChange={e => set('sku', e.target.value)} /></div>
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Categoría: {f.categoria_nombre ? `${f.categoria_nombre} (${f.categoria_id})` : 'sin elegir'}</label>
        {!publicado && <div style={{ marginTop: 6 }}><button style={suave} disabled={ocupado} onClick={acCats}>Sugerir categorías</button></div>}
        {cats.map(c => (
          <button key={c.categoria_id} style={{ ...suave, display: 'block', marginTop: 6, textAlign: 'left' }}
            onClick={() => { set('categoria_id', c.categoria_id); set('categoria_nombre', c.categoria_nombre); setCats([]) }}>
            {c.categoria_nombre} <span style={{ opacity: 0.6 }}>· {c.dominio}</span>
          </button>
        ))}
      </div>
      {!publicado && f.categoria_id && (
        <div>
          <button style={suave} disabled={ocupado} onClick={acOblig}>Ver datos que pide esta categoría</button>
          {oblig.map(o => (
            <div key={o.id} style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700 }}>{o.nombre}{o.opciones.length ? ` (ej.: ${o.opciones.slice(0, 4).join(', ')})` : ''}</label>
              <input style={campo} value={(f.atributos || {})[o.id] || ''} onChange={e => set('atributos', { ...(f.atributos || {}), [o.id]: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      {!publicado && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700 }}>Paquete para el envío (MercadoLibre lo pide)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginTop: 4 }}>
            {[['SELLER_PACKAGE_HEIGHT', 'Alto (cm)', 'cm'], ['SELLER_PACKAGE_WIDTH', 'Ancho (cm)', 'cm'], ['SELLER_PACKAGE_LENGTH', 'Largo (cm)', 'cm'], ['SELLER_PACKAGE_WEIGHT', 'Peso (g)', 'g']].map(([id, et, u]) => (
              <input key={id} style={campo} placeholder={et} inputMode="decimal"
                value={String((f.atributos || {})[id] || '').replace(/[^\d.]/g, '')}
                onChange={e => set('atributos', { ...(f.atributos || {}), [id]: e.target.value ? `${e.target.value} ${u}` : '' })} />
            ))}
          </div>
        </div>
      )}
      <label style={{ fontSize: 12, fontWeight: 700 }}>Descripción</label>
      <textarea style={{ ...campo, minHeight: 90 }} value={f.descripcion || ''} disabled={publicado} onChange={e => set('descripcion', e.target.value)} />
      {msg && <div style={{ whiteSpace: 'pre-wrap', fontWeight: 700, fontSize: 13.5, color: msg.t === 'rojo' ? '#C8362C' : '#2F8F4E' }}>{msg.x}</div>}
      {!publicado && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn(AZUL, ocupado)} disabled={ocupado} onClick={acGuardar}>Guardar</button>
          <button style={btn('#6B5B95', ocupado)} disabled={ocupado} onClick={acValidar}>Revisar con MercadoLibre</button>
          <button style={btn('#2F8F4E', ocupado || b.estado !== 'validado')} disabled={ocupado || b.estado !== 'validado'} onClick={acPublicar}>Crear en MercadoLibre (en pausa)</button>
          <button style={suave} disabled={ocupado} onClick={acDescartar}>Descartar</button>
        </div>
      )}
    </div>
  )
}

export default function Borradores() {
  const [lista, setLista] = useState([])
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    const r = await fetch('/api/mercadolibre/borradores', { cache: 'no-store' })
    const d = await r.json()
    if (d.ok) setLista(d.borradores); else setError(d.mensaje)
  }, [])
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t) }, [cargar])
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes([]); return }
      const r = await fetch(`/api/mercadolibre/empaque/productos?q=${encodeURIComponent(q)}`)
      const d = await r.json()
      if (d.ok) setRes(d.productos)
    }, 350)
    return () => clearTimeout(t)
  }, [q])
  async function crear(p) {
    const d = await api({ accion: 'crear', producto_id: p.id })
    if (d.ok) { setQ(''); setRes([]); cargar() } else setError(d.mensaje)
  }
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>Borradores de MercadoLibre</h1>
      <div style={{ color: 'var(--w60)', fontSize: 14, lineHeight: 1.5 }}>
        Elige un producto del catálogo, pon el precio y revisa. Nada se publica hasta que tú lo confirmes, y al crearse queda en pausa.
      </div>
      <div style={caja}>
        <label style={{ fontWeight: 800 }}>Nuevo borrador desde el catálogo</label>
        <input style={campo} value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe el nombre o el código del producto…" />
        {res.map(p => <button key={p.id} style={{ ...suave, textAlign: 'left' }} onClick={() => crear(p)}>{p.nombre} · hay {p.stock}</button>)}
      </div>
      {error && <div style={{ color: '#C8362C', fontWeight: 700 }}>{error}</div>}
      {lista.map(b => <Borrador key={`${b.id}-${b.actualizado_en}`} b={b} alCambiar={cargar} />)}
      {!lista.length && <div style={{ color: 'var(--w60)' }}>Todavía no hay borradores.</div>}
    </div>
  )
}
