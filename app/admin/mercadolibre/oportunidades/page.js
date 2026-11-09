'use client'
import { useState, useEffect, useCallback } from 'react'

// Oportunidades (solo admin): productos de EE. UU. de tus ofertas que ya se venden en
// MercadoLibre México, con cuántos vendedores hay, a qué precio y cuánto te quedaría.
// SOLO LEE de MercadoLibre: no publica ni cambia nada.

const peso = (n) => n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const usd = (n) => n == null ? '—' : `US$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const TIPOS = {
  nicho:         { t: 'Nicho', d: '1–4 vendedores', c: '#4a3680', bg: 'rgba(107,79,160,0.14)' },
  intermedia:    { t: 'Competencia media', d: '5–9 vendedores', c: '#2F4D70', bg: 'rgba(70,109,155,0.14)' },
  competida:     { t: 'Mucha competencia', d: '10+ vendedores', c: '#8a4b3a', bg: 'rgba(217,115,26,0.16)' },
  sin_vendedores: { t: 'Sin ofertas visibles', d: 'está en el catálogo pero MercadoLibre no muestra ofertas; puede venderse fuera del catálogo, revísalo', c: '#0b6b4d', bg: 'rgba(15,138,99,0.14)' },
}
const chip = (activo, col = '#466D9B') => ({
  padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
  border: `2px solid ${activo ? col : 'var(--w10)'}`, background: activo ? col : 'var(--sup)', color: activo ? '#fff' : 'var(--tinta)',
})
const botonAzul = (ocupado) => ({
  minHeight: 42, padding: '0 18px', borderRadius: 11, border: 'none', background: '#466D9B', color: '#fff',
  fontWeight: 800, fontSize: 14, cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.65 : 1,
})

function Foto({ src, alt, tam = 110, alAbrir }) {
  const [err, setErr] = useState(false)
  return (
    <button type="button" onClick={() => src && !err && alAbrir?.({ src, titulo: alt })} style={{ width: tam, height: tam, borderRadius: 12, border: '1px solid var(--w10)', background: '#fff', padding: 0, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: src && !err ? 'zoom-in' : 'default' }}>
      {src && !err
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 11.5, color: 'var(--w40)', textAlign: 'center' }}>📦<br />sin foto</span>}
    </button>
  )
}

function Tarjeta({ o, alAbrir, alDescartar, alCambiar }) {
  const [crear, setCrear] = useState({ ocupado: false, msg: null })
  const crearBorrador = async () => {
    setCrear({ ocupado: true, msg: null })
    try {
      const d = await fetch('/api/mercadolibre/borradores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'desde_oportunidad', oferta_id: o.oferta_id }) }).then(r => r.json())
      if (!d.ok) { setCrear({ ocupado: false, msg: { ok: false, x: d.mensaje || 'No se pudo crear' } }); return }
      const v = d.validacion
      const x = d.existente ? 'Ya tenías un borrador de este producto.'
        : v?.ok ? 'Borrador listo: MercadoLibre lo revisó y no encontró problemas. Revisa precio y medidas.'
        : `Borrador creado. Falta: ${(v?.errores || ['revisar los datos']).slice(0, 2).join(' · ')}`
      setCrear({ ocupado: false, msg: { ok: true, x } })
      alCambiar?.()
    } catch { setCrear({ ocupado: false, msg: { ok: false, x: 'No se pudo conectar con el servidor' } }) }
  }
  const tipo = TIPOS[o.tipo] || TIPOS.nicho
  const buena = o.sobre_costo_pct != null && o.sobre_costo_pct >= 15
  const dudosa = o.sobre_costo_pct != null && o.sobre_costo_pct > 300
  const col = o.sobre_costo_pct == null ? 'var(--w50)' : o.sobre_costo_pct < 0 ? '#b3261e' : buena ? '#0b6b4d' : '#b26a00'
  const chipE = (t, c, bg) => <span key={t} style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', color: c, background: bg, whiteSpace: 'nowrap' }}>{t}</span>
  return (
    <div style={{ background: 'var(--sup)', border: '1.5px solid var(--w08)', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <div><Foto src={o.imagen_url ? `/api/tendencias/foto?oferta=${o.oferta_id}` : null} alt={o.nombre} tam={104} alAbrir={alAbrir} /><div style={{ fontSize: 10.5, color: 'var(--w40)', textAlign: 'center', marginTop: 3 }}>EE. UU.</div></div>
          <div><Foto src={o.ml_foto} alt={o.ml_nombre || o.nombre} tam={104} alAbrir={alAbrir} /><div style={{ fontSize: 10.5, color: 'var(--w40)', textAlign: 'center', marginTop: 3 }}>MercadoLibre</div></div>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {chipE(tipo.t, tipo.c, tipo.bg)}
            {o.ranking != null && chipE(`🔥 Más vendido #${o.ranking}`, '#8a1c14', 'rgba(185,28,28,0.12)')}
            {o.tendencia && chipE('📈 En tendencia', '#0b6b4d', 'rgba(15,138,99,0.14)')}
            {o.tienda && chipE(o.tienda, '#6b645a', 'rgba(42,33,24,0.08)')}
            {dudosa && chipE('⚠ Ganancia muy alta: confirma que sea el mismo producto (sabor, tamaño, cantidad)', '#8a5a00', 'rgba(201,151,0,0.2)')}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tinta)', lineHeight: 1.3 }}>{o.nombre}</div>
          <div style={{ fontSize: 12.5, color: 'var(--w50)', marginTop: 3 }}>En MercadoLibre: {o.ml_nombre}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: 'var(--w60)' }}>
            <span>Vendedores <b style={{ color: 'var(--tinta)' }}>{o.vendedores ?? 0}</b></span>
            {o.precio_min != null && <span>Precios <b style={{ color: 'var(--tinta)' }}>{peso(o.precio_min)}{o.precio_max !== o.precio_min ? ` – ${peso(o.precio_max)}` : ''}</b></span>}
            {o.envio_gratis_pct != null && <span>Envío gratis <b style={{ color: 'var(--tinta)' }}>{o.envio_gratis_pct}%</b></span>}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 13, color: 'var(--w60)' }}>
            <span>Cuesta en EE. UU. <b style={{ color: 'var(--tinta)' }}>{usd(o.precio_usd)}</b></span>
            <span>Te cuesta en México <b style={{ color: 'var(--tinta)' }}>{peso(o.costo_mxn)}</b></span>
          </div>
        </div>
        <div style={{ flex: '0 0 200px', maxWidth: '100%', textAlign: 'right', alignSelf: 'center', marginLeft: 'auto' }}>
          {o.tipo === 'sin_vendedores'
            ? <div style={{ fontSize: 12.5, color: 'var(--w50)', lineHeight: 1.4, textAlign: 'left' }}>El catálogo no muestra ofertas de este producto (puede venderse fuera del catálogo). No hay precio de referencia: búscalo en MercadoLibre antes de decidir.</div>
            : <>
              <div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700 }}>Venderías a {peso(o.precio_objetivo)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700, marginTop: 4 }}>GANANCIA</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: col, lineHeight: 1.1 }}>{peso(o.ganancia)}</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: col }}>{o.sobre_costo_pct != null ? `${o.sobre_costo_pct}% sobre costo` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--w40)', marginTop: 4, lineHeight: 1.35 }}>Estimado: comisión {o.comision_pct ?? '—'}%{o.envio_est ? `, envío ${peso(o.envio_est)}` : ', sin envío'}, impuestos incluidos. La coincidencia es automática: confirma que sea el mismo producto.</div>
            </>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, borderTop: '1px solid var(--w08)', paddingTop: 8, fontSize: 12.5 }}>
        {o.ml_producto_id && <a href={`https://www.mercadolibre.com.mx/p/${o.ml_producto_id}`} target="_blank" rel="noreferrer" style={{ color: '#466D9B', fontWeight: 700 }}>Ver en MercadoLibre ↗</a>}
        {o.url_oferta && <a href={o.url_oferta} target="_blank" rel="noreferrer" style={{ color: '#466D9B', fontWeight: 700 }}>Ver oferta en {o.tienda || 'la tienda'} ↗</a>}
        {o.borrador_id
          ? <a href="/admin/mercadolibre/borradores" style={{ color: '#0b6b4d', fontWeight: 800 }}>✓ Ya tiene borrador #{o.borrador_id} · abrir</a>
          : <button onClick={crearBorrador} disabled={crear.ocupado} style={{ minHeight: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: '#6B4FA0', color: '#fff', fontWeight: 800, fontSize: 13, cursor: crear.ocupado ? 'wait' : 'pointer' }}>{crear.ocupado ? 'Armando borrador…' : '📝 Crear borrador'}</button>}
        <button onClick={() => alDescartar(o.oferta_id)} style={{ background: 'none', border: 'none', color: 'var(--w40)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 12.5 }}>No me interesa</button>
      </div>
      {crear.msg && (
        <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: crear.msg.ok ? '#0b6b4d' : '#b3261e', lineHeight: 1.4 }}>
          {crear.msg.x} {crear.msg.ok && <a href="/admin/mercadolibre/borradores" style={{ color: '#466D9B' }}>Abrir Borradores →</a>}
          <div style={{ fontWeight: 600, color: 'var(--w50)' }}>Las medidas y el precio son estimados: ajústalos. Nada se publica hasta que tú lo confirmes y queda en pausa.</div>
        </div>
      )}
    </div>
  )
}

export default function Oportunidades() {
  const [datos, setDatos] = useState(null)
  const [tipo, setTipo] = useState('nicho')
  const [soloBuenas, setSoloBuenas] = useState(true)
  const [orden, setOrden] = useState('ganancia')
  const [buscar, setBuscar] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [error, setError] = useState('')
  const [foto, setFoto] = useState(null)
  const [limite, setLimite] = useState({ firma: '', n: 12 })

  const cargar = useCallback(async () => {
    try {
      const d = await fetch('/api/mercadolibre/oportunidades', { cache: 'no-store' }).then(r => r.json())
      if (d.ok) setDatos(d); else setError(d.mensaje || 'No se pudo leer')
    } catch { setError('No se pudo conectar con el servidor') }
  }, [])
  useEffect(() => { cargar() }, [cargar]) // eslint-disable-line react-hooks/set-state-in-effect

  const analizar = async () => {
    setAnalizando(true); setError(''); let hechas = 0
    try {
      for (let i = 0; i < 80; i++) {
        const d = await fetch('/api/mercadolibre/oportunidades', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lote: 15 }) }).then(r => r.json())
        if (!d.ok) { setError(d.mensaje || 'No se pudo analizar'); break }
        hechas += d.analizadas
        setProgreso(`Revisadas ${hechas} ofertas · faltan ${d.quedan}`)
        await cargar()
        if (!d.quedan || !d.analizadas) break
      }
    } catch { setError('Se cortó la conexión. Lo ya revisado quedó guardado; vuelve a intentar.') }
    setProgreso(''); setAnalizando(false); await cargar()
  }
  const descartar = async (id) => {
    await fetch('/api/mercadolibre/oportunidades', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'descartar', id, valor: true }) })
    cargar()
  }

  const minimo = datos?.margen_min ?? 15
  const todas = datos?.oportunidades || []
  const buena = (o) => o.tipo === 'sin_vendedores' || (o.sobre_costo_pct != null && o.sobre_costo_pct >= minimo)
  const cuenta = (t) => todas.filter(o => (t === 'todas' || o.tipo === t) && (!soloBuenas || buena(o))).length
  const visibles = todas.filter(o => (tipo === 'todas' || o.tipo === tipo) && (!soloBuenas || buena(o))
    && (!buscar.trim() || `${o.nombre} ${o.ml_nombre || ''}`.toLowerCase().includes(buscar.trim().toLowerCase())))
    .sort((a, b) => {
      const da = a.sobre_costo_pct > 300 ? 1 : 0, db = b.sobre_costo_pct > 300 ? 1 : 0
      if (da !== db && (orden === 'ganancia' || orden === 'pct')) return da - db // las dudosas al final
      if (orden === 'pct') return (b.sobre_costo_pct ?? -1e9) - (a.sobre_costo_pct ?? -1e9)
      if (orden === 'demanda') return ((a.ranking ?? 999) - (b.ranking ?? 999)) || ((b.tendencia ? 1 : 0) - (a.tendencia ? 1 : 0))
      if (orden === 'poca') return (a.vendedores ?? 0) - (b.vendedores ?? 0)
      return (b.ganancia ?? -1e9) - (a.ganancia ?? -1e9)
    })
  const firma = `${tipo}|${soloBuenas}|${orden}|${buscar}`
  const lim = limite.firma === firma ? limite.n : 12

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg,#4a3680 0%,#6B4FA0 100%)', color: '#fff', borderRadius: 18, padding: '18px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.6 }}>Oportunidades en MercadoLibre</div>
              <div style={{ fontSize: 13, opacity: 0.88, marginTop: 3, maxWidth: 560 }}>Productos de tus ofertas de EE. UU. que ya se venden en MercadoLibre México, con cuántos vendedores hay y cuánto te quedaría. Solo lee: no publica nada.</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button onClick={analizar} disabled={analizando || !datos?.por_analizar} style={{ ...botonAzul(analizando), background: '#fff', color: '#4a3680', opacity: !datos?.por_analizar && !analizando ? 0.5 : 1 }}>
                {analizando ? 'Buscando…' : datos?.por_analizar ? `🔎 Buscar oportunidades (${datos.por_analizar} ofertas nuevas)` : '✓ Todo revisado'}
              </button>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>{progreso || (datos ? `${datos.analizadas} ofertas ya revisadas · tipo de cambio ${datos.tc}` : 'Cargando…')}</div>
            </div>
          </div>
        </div>

        {error && <div style={{ background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.3)', color: 'var(--rojo)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--fondo)', padding: '8px 0 10px', borderBottom: '1px solid var(--w08)', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['nicho', '#6B4FA0'], ['competida', '#8a4b3a'], ['intermedia', '#2F4D70'], ['todas', '#444'], ['sin_vendedores', '#0b6b4d']].map(([k, col]) => (
              <button key={k} onClick={() => setTipo(k)} style={chip(tipo === k, col)}>{k === 'todas' ? 'Todas' : TIPOS[k].t} · {cuenta(k)}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--w50)', margin: '6px 2px 0' }}>{tipo === 'todas' ? 'Todas las coincidencias encontradas.' : `${TIPOS[tipo].t}: ${TIPOS[tipo].d}.`}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔎 Buscar por nombre" style={{ flex: 1, minWidth: 180, background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '8px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }} />
            <select value={orden} onChange={e => setOrden(e.target.value)} style={{ background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '8px 10px', color: 'var(--tinta)', fontSize: 13 }}>
              <option value="ganancia">Orden: más ganancia ($)</option>
              <option value="pct">Orden: mejor % sobre costo</option>
              <option value="demanda">Orden: más demanda</option>
              <option value="poca">Orden: menos vendedores</option>
            </select>
            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--tinta)', display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloBuenas} onChange={e => setSoloBuenas(e.target.checked)} /> Solo con {minimo}% o más de ganancia
            </label>
          </div>
        </div>

        {!datos ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
          : visibles.length === 0 ? (
            <div style={{ color: 'var(--w50)', fontSize: 13.5, lineHeight: 1.5, padding: 10 }}>
              {todas.length === 0 ? 'Todavía no hay resultados. Toca “Buscar oportunidades”: revisa tus ofertas de EE. UU. contra el catálogo de MercadoLibre (tarda unos minutos).' : 'Nada con estos filtros. Prueba otra pestaña o quita “Solo con ganancia”.'}
            </div>
          ) : (<>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibles.slice(0, lim).map(o => <Tarjeta key={o.oferta_id} o={o} alAbrir={setFoto} alDescartar={descartar} alCambiar={cargar} />)}
            </div>
            {visibles.length > lim && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => setLimite({ firma, n: lim + 12 })} style={botonAzul(false)}>Ver 12 más · faltan {visibles.length - lim}</button>
              </div>
            )}
          </>)}
      </div>

      {foto && (
        <div onClick={() => setFoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.src} alt="" style={{ maxWidth: '94vw', maxHeight: '82vh', background: '#fff', borderRadius: 14, objectFit: 'contain' }} />
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 12, maxWidth: 700, textAlign: 'center' }}>{foto.titulo}</div>
        </div>
      )}
    </div>
  )
}
