'use client'
import { useState, useEffect, useCallback } from 'react'

// MercadoLibre (solo admin): conectar la cuenta por API, traer las
// publicaciones, ligarlas al catálogo por SKU y depurar las que prometen
// entrega inmediata sin tener producto.
//
// Depurar: en las listas "Dar de baja o ligar" y "Al instante sin stock" se
// marca una decisión por publicación. NADA se cambia en MercadoLibre hasta que
// se confirma en el paso final ("Aplicar en MercadoLibre").

const DIAS_BAJO_PEDIDO = 13

// La mayoría de las publicaciones son "bajo pedido": no están en el catálogo
// porque se compran hasta que se venden. Eso es normal, no algo por arreglar.
const ETIQUETA = {
  ligada:      { t: 'En tu catálogo', c: 'var(--verde)', bg: 'rgba(15,138,99,0.10)' },
  bajo_pedido: { t: 'Bajo pedido',    c: '#466D9B',      bg: 'rgba(70,109,155,0.12)' },
  ambigua:     { t: 'SKU repetido',   c: 'var(--rojo)',  bg: 'rgba(185,28,28,0.08)' },
}
const MENSAJES_ERROR = {
  faltan_credenciales: 'Faltan ML_CLIENT_ID y ML_CLIENT_SECRET en .env.local (y en Vercel).',
  autorizacion: 'No se completó la autorización en MercadoLibre. Intenta de nuevo.',
  estado: 'La conexión caducó o no coincide con tu sesión. Intenta de nuevo.',
  token: 'MercadoLibre no aceptó el código de conexión.',
}
const fechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })
  : ''
const peso = (n) => n == null ? '' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

const inputEstilo = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }
const chip = (activo) => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${activo ? '#466D9B' : 'var(--w10)'}`,
  background: activo ? 'rgba(70,109,155,0.12)' : 'var(--w04)',
  color: activo ? '#466D9B' : 'var(--w50)',
})
const botonAzul = (ocupado) => ({
  minHeight: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: '#466D9B', color: '#fff',
  fontWeight: 700, fontSize: 13, cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.6 : 1, textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center',
})
const botonDecision = (activo, color) => ({
  minHeight: 34, padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
  border: `1.5px solid ${activo ? color : 'var(--w10)'}`,
  background: activo ? color : 'var(--w04)',
  color: activo ? '#fff' : 'var(--w60)',
})
const enlaceBoton = { background: 'none', border: 'none', color: '#466D9B', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }

// ── Fotos grandes: MercadoLibre manda una miniatura de 90 px (-I.jpg); la versión
// original (-O.jpg) es mucho más nítida. Si no existe, se usa la miniatura.
const fotoGrande = (u) => {
  if (!u) return null
  return String(u).replace(/^http:\/\//, 'https://').replace(/-[A-Z]\.jpg(\?.*)?$/i, '-O.jpg')
}
// Códigos de MercadoLibre → español.
const CODIGOS_ML = {
  out_of_stock: 'Sin stock', under_review: 'En revisión de MercadoLibre', forbidden: 'Bloqueada por MercadoLibre',
  waiting_for_patch: 'Esperando corrección', picture_download_pending: 'Descargando fotos', paused_by_seller: 'Pausada por ti',
  suspended: 'Suspendida', moderation_penalty: 'Penalizada', pending_documentation: 'Falta documentación',
  deleted: 'Eliminada', expired: 'Vencida', not_yet_active: 'Aún no activa', freezed: 'Congelada', warning: 'Con aviso',
  item_blocked: 'Bloqueada', health_pending: 'Pendiente de salud', invalid_domain: 'Dominio inválido', closed: 'Cerrada',
}
const PROBLEMAS = new Set(['under_review', 'forbidden', 'waiting_for_patch', 'suspended', 'moderation_penalty', 'pending_documentation', 'item_blocked', 'deleted', 'freezed', 'closed', 'expired'])
const traducirCodigo = (c) => CODIGOS_ML[c] || String(c).replace(/_/g, ' ')
function estadoVisible(p) {
  const codigos = String(p.sub_estado || '').split(',').map(s => s.trim()).filter(Boolean)
  const problema = codigos.find(c => PROBLEMAS.has(c))
  if (problema) return { t: traducirCodigo(problema), c: '#8a1c14', bg: 'rgba(179,38,30,0.12)', problema: true, extra: codigos.filter(c => c !== problema && c !== 'paused_by_seller') }
  if (p.estado_ml === 'active') return { t: 'Activa', c: '#0b6b4d', bg: 'rgba(15,138,99,0.14)', problema: false, extra: codigos.filter(c => c !== 'paused_by_seller') }
  if (p.estado_ml === 'paused') return { t: 'Pausada', c: '#6b5a2a', bg: 'rgba(201,151,0,0.16)', problema: false, extra: codigos.filter(c => c !== 'paused_by_seller') }
  return { t: p.estado_ml || 'Sin estado', c: '#6b645a', bg: 'rgba(42,33,24,0.08)', problema: false, extra: codigos }
}
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// ¿El título de MercadoLibre y el producto ligado parecen cosas distintas?
function ligaSospechosa(p) {
  if (!p.producto?.nombre) return null
  const a = normal(p.titulo), b = normal(p.producto.nombre)
  const pal = b.split(/[^a-z0-9]+/).filter(w => w.length > 3)
  const hit = pal.filter(w => a.includes(w)).length
  if (pal.length >= 2 && hit / pal.length < 0.4) return 'Los nombres casi no se parecen'
  const nA = new Set(a.match(/\d+(?:[.,]\d+)?/g) || []), nB = new Set(b.match(/\d+(?:[.,]\d+)?/g) || [])
  const soloA = [...nA].filter(x => !nB.has(x)), soloB = [...nB].filter(x => !nA.has(x))
  if (soloA.length && soloB.length) return `Revisa cantidades: la publicación dice ${soloA.join(', ')} y el producto ${soloB.join(', ')}`
  return null
}

// Foto del producto: grande, nítida; al tocarla se amplía.
function Foto({ p, tam = 112, alAbrir }) {
  const [err, setErr] = useState(0)
  const fuente = err === 0 ? fotoGrande(p.miniatura) : err === 1 ? (p.miniatura ? String(p.miniatura).replace(/^http:\/\//, 'https://') : null) : null
  const caja = { width: tam, height: tam, borderRadius: 12, border: '1px solid var(--w10)', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 0, cursor: fuente ? 'zoom-in' : 'default' }
  return (
    <button type="button" onClick={() => fuente && alAbrir?.({ src: fuente, titulo: p.titulo })} style={caja} aria-label="Ampliar foto">
      {fuente
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={fuente} alt="" onError={() => setErr(e => e + 1)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ fontSize: 12, color: 'var(--w40)', textAlign: 'center', lineHeight: 1.3 }}>📦<br />Sin foto</span>}
    </button>
  )
}

// Una publicación: foto grande, estado en español, stock y ganancia a la vista.
function Tarjeta({ p, enDepuracion, filtro, dec, decidir, ligar, alCambiar, sinEnvio, dias, alAbrirFoto }) {
  const [abierto, setAbierto] = useState(false)
  const est = estadoVisible(p)
  const d = p.dinero
  const bajoPedido = p.liga_estado === 'bajo_pedido'
  const sospecha = ligaSospechosa(p)
  const sinReal = bajoPedido && !d?.real
  const cat = p.producto ? p.producto.stock : null
  const igual = cat != null && p.stock_ml != null && Math.max(0, cat - 0) === p.stock_ml
  const verdeGan = d?.ganancia == null ? 'var(--w50)' : d.ganancia < 0 ? '#b3261e' : d.sobre_costo_pct < 15 ? '#b26a00' : '#0b6b4d'
  const avisos = []
  if (sospecha) avisos.push(['⚠ ¿Liga correcta? ' + sospecha, '#8a5a00', 'rgba(201,151,0,0.16)'])
  if (d && d.comision == null && !sinReal && !est.problema) avisos.push(['Falta la comisión', '#8a5a00', 'rgba(201,151,0,0.16)'])
  if (p.sku && /^\d{1,5}$/.test(String(p.sku))) avisos.push([`SKU raro (${p.sku})`, '#8a5a00', 'rgba(201,151,0,0.16)'])
  const chipE = (t, c, bg) => <span key={t} style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', color: c, background: bg, whiteSpace: 'nowrap' }}>{t}</span>
  return (
    <div style={{ background: 'var(--sup)', border: `1.5px solid ${dec ? '#466D9B' : 'var(--w08)'}`, borderRadius: 16, padding: 14, opacity: p.estado_ml === 'paused' ? 0.92 : 1 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Foto p={p} alAbrir={alAbrirFoto} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {chipE(est.t, est.c, est.bg)}
            {est.extra.map(x => chipE(traducirCodigo(x), '#6b645a', 'rgba(42,33,24,0.08)'))}
            {chipE(bajoPedido ? 'Bajo pedido' : p.liga_estado === 'ambigua' ? 'SKU repetido' : 'En tu catálogo', bajoPedido ? '#4a3680' : p.liga_estado === 'ambigua' ? '#8a1c14' : '#2F4D70', bajoPedido ? 'rgba(107,79,160,0.14)' : p.liga_estado === 'ambigua' ? 'rgba(185,28,28,0.10)' : 'rgba(70,109,155,0.14)')}
            {p.sync_stock && chipE('Automático ✓', '#0b6b4d', 'rgba(15,138,99,0.14)')}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tinta)', lineHeight: 1.3 }}>{p.titulo}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: 'var(--w60)' }}>
            {p.producto && <span>Catálogo <b style={{ color: 'var(--tinta)' }}>{cat} pza</b></span>}
            {p.stock_ml != null && <span>MercadoLibre <b style={{ color: 'var(--tinta)' }}>{p.stock_ml} pza</b>{p.producto && (igual ? <span style={{ color: '#0b6b4d' }}> ✓</span> : <span style={{ color: '#b26a00' }}> ⚠ distinto</span>)}</span>}
            <span>{p.tiempo_preparacion ? `Entrega en ${p.tiempo_preparacion} días` : (p.estado_ml === 'active' ? 'Entrega inmediata' : '')}</span>
          </div>
          {avisos.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{avisos.map(([t, c, bg]) => chipE(t, c, bg))}</div>}
        </div>
        <div style={{ flex: '0 0 190px', maxWidth: '100%', textAlign: 'right', alignSelf: 'center', marginLeft: 'auto' }}>
          {est.problema
            ? <div style={{ fontSize: 12.5, color: 'var(--w50)', lineHeight: 1.4, textAlign: 'left' }}>No se vende mientras esté así. Resuélvelo en MercadoLibre.</div>
            : sinReal
              ? <><div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700 }}>Cobras</div><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--tinta)' }}>{peso(p.precio)}</div><div style={{ fontSize: 11.5, color: 'var(--w40)', marginTop: 2 }}>La ganancia se ve al vender</div></>
              : d ? <>
                <div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700 }}>Cobras {peso(d.precio)} · Te pagan {peso(d.neto)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700, marginTop: 4 }}>GANANCIA</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: verdeGan, lineHeight: 1.1 }}>{d.ganancia != null ? peso(d.ganancia) : '—'}</div>
                {d.ganancia != null && <div style={{ fontSize: 12.5, fontWeight: 800, color: verdeGan }}>{d.sobre_costo_pct}% sobre costo</div>}
                <div style={{ marginTop: 4 }}>{chipE(d.real ? 'Real' : 'Estimado', d.real ? '#0b6b4d' : '#6b645a', d.real ? 'rgba(15,138,99,0.14)' : 'rgba(42,33,24,0.08)')}</div>
              </> : <div style={{ fontSize: 12.5, color: 'var(--w50)' }}>Sin precio</div>}
        </div>
      </div>

      {p.producto && <StockML pub={p} alCambiar={alCambiar} modo="rapido" />}

      {enDepuracion && sinEnvio(p) && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ambar)', lineHeight: 1.45 }}>
          Sin Mercado Envíos: no aparece en tu panel de MercadoLibre. Primero revisamos qué son estas publicaciones; por eso aquí no se puede decidir todavía.
        </div>
      )}
      {enDepuracion && !p.producto && <Ligar pub={p} alLigar={ligar} />}
      {filtro === 'baja' && !sinEnvio(p) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => decidir(p.id, 'pausar')} style={botonDecision(dec === 'pausar', '#b91c1c')}>
            {dec === 'pausar' ? '✓ Ya no existe: se pausará' : 'Ya no existe → pausar'}
          </button>
        </div>
      )}
      {filtro === 'sinstock' && !sinEnvio(p) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => decidir(p.id, 'pausar')} style={botonDecision(dec === 'pausar', '#b91c1c')}>{dec === 'pausar' ? '✓ Se pausará' : 'Pausar'}</button>
          <button onClick={() => decidir(p.id, 'dias')} style={botonDecision(dec === 'dias', '#466D9B')}>{dec === 'dias' ? `✓ Bajo pedido · ${dias} días` : `Bajo pedido · ${dias} días`}</button>
        </div>
      )}

      <div style={{ marginTop: 10, borderTop: '1px solid var(--w08)', paddingTop: 8 }}>
        <button type="button" onClick={() => setAbierto(a => !a)} style={{ ...enlaceBoton, textDecoration: 'none', fontSize: 13 }}>{abierto ? '▴ Ocultar opciones y desglose' : '▾ Opciones y desglose de dinero'}</button>
        {abierto && (
          <div style={{ marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              {p.producto ? (
                <div style={{ fontSize: 12.5, color: 'var(--w60)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>Producto ligado: <b style={{ color: 'var(--tinta)' }}>{p.producto.nombre}</b> · stock {p.producto.stock}{p.liga_manual ? ' · a mano' : ''}</span>
                  <button onClick={() => ligar(p.id, null)} style={{ background: 'none', border: 'none', color: 'var(--w40)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Quitar liga</button>
                </div>
              ) : (<>
                {bajoPedido && <div style={{ fontSize: 12.5, color: 'var(--w50)' }}>Se compra cuando se vende.</div>}
                {!enDepuracion && <Ligar pub={p} alLigar={ligar} />}
              </>)}
              {p.producto && <StockML pub={p} alCambiar={alCambiar} modo="completo" />}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--w40)' }}>
                <span>{p.sku ? `SKU ${p.sku}` : 'sin SKU'}</span><span>{p.item_id}</span>
                {p.enlace && <a href={p.enlace} target="_blank" rel="noreferrer" style={{ color: '#466D9B', fontWeight: 700 }}>Ver en MercadoLibre ↗</a>}
              </div>
            </div>
            <div style={{ flex: '0 0 250px', maxWidth: '100%' }}>
              {sinReal
                ? <div style={{ fontSize: 12.5, color: 'var(--w60)', lineHeight: 1.5 }}>Precio <b style={{ color: 'var(--tinta)' }}>{peso(p.precio)}</b><div style={{ color: 'var(--w40)', marginTop: 4 }}>Sin costo en el catálogo: la ganancia se verá cuando vendas esta publicación.</div></div>
                : <Dinero pub={p} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Ligar({ pub, alLigar }) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (texto.trim().length < 2) return
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const d = await fetch(`/api/mercadolibre/publicaciones?buscar_producto=${encodeURIComponent(texto)}`, { cache: 'no-store' }).then(r => r.json())
        setOpciones(d.ok ? d.productos : [])
      } catch { setOpciones([]) }
      setBuscando(false)
    }, 300)
    return () => clearTimeout(t)
  }, [texto])

  return (
    <div style={{ marginTop: 8 }}>
      <input style={{ ...inputEstilo, width: '100%', boxSizing: 'border-box' }} placeholder="¿Sí existe en tu catálogo? Búscalo por nombre o código para ligarla"
        value={texto} onChange={e => { setTexto(e.target.value); if (e.target.value.trim().length < 2) setOpciones([]) }} />
      {buscando && <div style={{ fontSize: 12, color: 'var(--w40)', marginTop: 4 }}>Buscando…</div>}
      {opciones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {opciones.map(o => (
            <button key={o.id} onClick={() => { alLigar(pub.id, o.id); setTexto(''); setOpciones([]) }}
              style={{ textAlign: 'left', background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: 'var(--tinta)', fontSize: 12.5 }}>
              <b>{o.nombre}</b>{o.variante ? ` · ${o.variante}` : ''}
              <span style={{ color: 'var(--w50)' }}> · {o.codigo_barras} · stock {o.stock}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Bloque de dinero: precio → lo que te pagan → ganancia.
function Dinero({ pub }) {
  const d = pub.dinero
  const m = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }))
  if (!d) return <div style={{ fontSize: 12.5, color: 'var(--w50)' }}>Sin precio</div>
  const color = d.ganancia == null ? 'var(--w50)' : d.ganancia < 0 ? '#b3261e' : d.sobre_costo_pct < 15 ? '#b26a00' : '#0b6b4d'
  const fila = (et, v, neg) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
      <span style={{ color: 'var(--w60)' }}>{et}</span><span style={{ fontWeight: 700, color: neg ? '#8a4b3a' : 'var(--tinta)' }}>{v}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {fila('Precio', m(d.precio))}
      {fila('Te costó', d.costo != null ? `− ${m(d.costo)}` : 'sin costo', true)}
      {fila(`Comisión${d.comision_pct != null ? ` (${d.comision_pct}%)` : ''}`, d.comision != null ? `− ${m(d.comision)}` : 'sin dato', true)}
      {fila(d.envio_real ? 'Envío (última venta)' : 'Envío', d.envio != null ? `− ${m(d.envio)}` : 'no incluido', true)}
      {fila('Impuestos', `− ${m(d.impuestos)}`, true)}
      {fila('Te pagan', m(d.neto))}
      <div style={{ marginTop: 4, padding: '6px 8px', borderRadius: 8, background: 'rgba(42,33,24,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Ganancia</span>
        <span style={{ fontSize: 16, fontWeight: 900, color }}>{d.ganancia != null ? m(d.ganancia) : '—'}</span>
      </div>
      {d.ganancia != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
          <span style={{ color: 'var(--w60)' }}>Sobre lo que te costó</span><b style={{ color }}>{d.sobre_costo_pct}%</b>
        </div>
      )}
      {d.ganancia != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
          <span style={{ color: 'var(--w60)' }}>Sobre el precio de venta</span><b style={{ color }}>{d.margen_pct}%</b>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--w40)' }}>{d.real ? 'Comisión y envío reales de tu última venta.' : d.comision != null ? 'Estimado: aún no vendes esta publicación (sin envío).' : 'Sin ventas ni estimado todavía.'}</div>
    </div>
  )
}

// Stock del catálogo → MercadoLibre: botón manual + interruptor automático.
function StockML({ pub, alCambiar, modo = 'completo' }) {
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [piezas, setPiezas] = useState(String(pub.bajo_pedido_piezas ?? 10))
  const [dias, setDias] = useState(String(pub.bajo_pedido_dias ?? 9))
  if (!pub.producto_id || pub.variacion_id || !['active', 'paused'].includes(pub.estado_ml)) return null
  const llamar = async (cuerpo) => {
    setOcupado(true); setMsg(null)
    try {
      const d = await fetch('/api/mercadolibre/stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pub.id, ...cuerpo }) }).then(r => r.json())
      setMsg({ ok: d.ok, x: d.mensaje || (d.ok ? 'Listo' : 'No se pudo') })
      if (d.ok) alCambiar()
    } catch { setMsg({ ok: false, x: 'No se pudo conectar con el servidor' }) }
    setOcupado(false)
  }
  const ahora = () => {
    const hay = (pub.producto?.stock ?? 0) > 0
    if (!window.confirm(hay ? `Esto CAMBIA la publicación en MercadoLibre (hoy tiene ${pub.stock_ml ?? '?'}): pondrá el stock del catálogo (${pub.producto?.stock} menos lo ya apartado) y entrega inmediata. ¿Continuar?` : `El catálogo está en 0. Esto pondrá la publicación BAJO PEDIDO: ${piezas || 10} piezas con entrega en ${dias || 9} días. ¿Continuar?`)) return
    llamar({ accion: 'ahora' })
  }
  const auto = () => {
    if (!pub.sync_stock && !window.confirm(`Desde ahora esta publicación se ajusta SOLA cada 10 minutos: con stock en el catálogo → ese stock y entrega inmediata; si el catálogo llega a 0 NO cambio nada y te pregunto qué hacer (bajo pedido ${piezas || 10} piezas / ${dias || 9} días, pausar o dejarla). ¿Activar?`)) return
    llamar({ accion: 'auto', valor: !pub.sync_stock })
  }
  const botones = (
    <>
      <button disabled={ocupado} onClick={ahora} style={{ minHeight: 36, padding: '0 14px', borderRadius: 10, border: '1.5px solid #466D9B', background: '#fff', color: '#2F4D70', fontWeight: 800, cursor: 'pointer' }}>{ocupado ? 'Enviando…' : '↑ Enviar stock a MercadoLibre'}</button>
      <button disabled={ocupado} onClick={auto} style={{ minHeight: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: pub.sync_stock ? '#0f8a63' : 'rgba(42,33,24,0.12)', color: pub.sync_stock ? '#fff' : 'var(--tinta)', fontWeight: 800, cursor: 'pointer' }}>{pub.sync_stock ? '✓ Automático encendido' : 'Automático apagado'}</button>
    </>
  )
  const ajustes = (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--w60)' }}>Bajo pedido:
      <input value={piezas} onChange={e => setPiezas(e.target.value.replace(/\D/g, ''))} onBlur={() => llamar({ accion: 'config', piezas, dias })} inputMode="numeric" style={{ width: 46, minHeight: 32, borderRadius: 8, border: '1.5px solid rgba(42,33,24,0.2)', textAlign: 'center', fontWeight: 700 }} /> piezas ·
      <input value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, ''))} onBlur={() => llamar({ accion: 'config', piezas, dias })} inputMode="numeric" style={{ width: 46, minHeight: 32, borderRadius: 8, border: '1.5px solid rgba(42,33,24,0.2)', textAlign: 'center', fontWeight: 700 }} /> días
    </span>
  )
  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
      {modo === 'rapido' ? botones : ajustes}
      {msg && <span style={{ fontWeight: 700, color: msg.ok ? '#0b6b4d' : '#b3261e' }}>{msg.x}</span>}
      {!msg && modo === 'completo' && pub.sync_stock_msg && <span style={{ color: 'var(--w50)' }}>Último: {pub.sync_stock_msg}</span>}
    </div>
  )
}

// Reputación y ventas en riesgo de despacho tarde.
function Reputacion() {
  const [d, setD] = useState(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/mercadolibre/reputacion', { cache: 'no-store' }).then(r => r.json()).then(x => { if (vivo && x.ok) setD(x) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!d) return null
  const r = d.reputacion
  const COL = { green: ['#0f8a63', 'Verde'], light_green: ['#5aa832', 'Verde claro'], yellow: ['#c99700', 'Amarilla'], orange: ['#d9731a', 'Naranja'], red: ['#b3261e', 'Roja'] }
  const [col, nombre] = COL[r?.color] || ['#6b645a', r?.color || 'Sin dato']
  const metrica = (et, x) => (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 11.5, color: 'var(--w50)', fontWeight: 700 }}>{et}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--tinta)' }}>{x?.tasa != null ? `${x.tasa}%` : '—'}</div>
      {x?.cantidad != null && <div style={{ fontSize: 11.5, color: 'var(--w50)' }}>{x.cantidad} venta(s)</div>}
    </div>
  )
  const vencidas = d.riesgo.filter(x => x.vencida)
  return (
    <div style={{ background: 'var(--sup)', border: `2px solid ${col}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ background: col, color: '#fff', borderRadius: 999, padding: '6px 14px', fontWeight: 900, fontSize: 14 }}>Reputación {nombre}</div>
        {r?.ventas_completadas != null && <div style={{ fontSize: 12.5, color: 'var(--w60)' }}>{r.ventas_completadas} ventas completadas{r.periodo ? ` (${r.periodo})` : ''}</div>}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginLeft: 'auto' }}>
          {metrica('Despacho tarde', r?.demoras)}{metrica('Cancelaciones', r?.cancelaciones)}{metrica('Reclamos', r?.reclamos)}
        </div>
      </div>
      {d.riesgo.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 14, color: vencidas.length ? '#b3261e' : '#b26a00' }}>
            {vencidas.length ? `⚠️ ${vencidas.length} venta(s) YA vencida(s) sin empacar` : '⏰ Ventas por vencer (próximas 36 horas)'}
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {d.riesgo.map(x => (
              <div key={x.paquete} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', fontSize: 13, background: x.vencida ? 'rgba(179,38,30,0.08)' : 'rgba(201,151,0,0.10)', borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ fontWeight: 700 }}>{x.titulo}</span>
                <span style={{ fontWeight: 800, color: x.vencida ? '#b3261e' : '#b26a00', whiteSpace: 'nowrap' }}>{x.vencida ? `venció hace ${Math.abs(x.horas)} h` : `vence en ${x.horas} h`}</span>
              </div>
            ))}
          </div>
          <a href="/admin/mercadolibre/empaque" style={{ display: 'inline-block', marginTop: 10, fontWeight: 800, color: '#466D9B' }}>Ir a empacar →</a>
        </div>
      ) : <div style={{ marginTop: 10, fontSize: 13, color: '#0b6b4d', fontWeight: 700 }}>✓ No hay ventas por vencer en las próximas 36 horas.</div>}
    </div>
  )
}

// Publicaciones cuyo catálogo llegó a 0 y esperan tu decisión.
function PorDecidir({ pubs, alCambiar }) {
  const [ocupado, setOcupado] = useState(null)
  const [msg, setMsg] = useState('')
  const lista = (pubs || []).filter(p => p.sync_pendiente === 'sin_stock')
  if (!lista.length) return null
  const decidir = async (p, valor) => {
    setOcupado(p.id); setMsg('')
    try {
      const d = await fetch('/api/mercadolibre/stock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id, accion: 'decidir', valor }) }).then(r => r.json())
      setMsg(`${p.titulo}: ${d.mensaje || (d.ok ? 'Listo' : 'No se pudo')}`)
      await alCambiar()
    } catch { setMsg('No se pudo conectar con el servidor') }
    setOcupado(null)
  }
  return (
    <div style={{ background: '#fff7d6', border: '2px solid #e0b400', borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 16, color: '#2a2118' }}>⚠️ Se acabó el stock en el catálogo ({lista.length})</div>
      <div style={{ fontSize: 13.5, margin: '4px 0 12px', color: '#3b2f20' }}>MercadoLibre sigue mostrando piezas. Decide qué hacer con cada una; mientras no decidas, no se cambia nada.</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {lista.map(p => (
          <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid rgba(42,33,24,0.12)' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.titulo}</div>
            <div style={{ fontSize: 12.5, color: 'var(--w50)', margin: '2px 0 8px' }}>{p.item_id} · hoy en MercadoLibre: {p.stock_ml ?? '?'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button disabled={ocupado === p.id} onClick={() => decidir(p, 'bajo_pedido')} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#466D9B', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Bajo pedido ({p.bajo_pedido_piezas || 10} piezas · {p.bajo_pedido_dias || 9} días)</button>
              <button disabled={ocupado === p.id} onClick={() => decidir(p, 'pausar')} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#b91c1c', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Pausar</button>
              <button disabled={ocupado === p.id} onClick={() => decidir(p, 'dejar')} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1.5px solid rgba(42,33,24,0.25)', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>Dejar como está</button>
            </div>
          </div>
        ))}
      </div>
      {msg && <div style={{ marginTop: 10, fontWeight: 700, fontSize: 13.5 }}>{msg}</div>}
    </div>
  )
}

export default function MercadoLibreAdmin() {
  const [estado, setEstado] = useState(null)
  const [pubs, setPubs] = useState(null)
  const [filtro, setFiltro] = useState('ligadas')
  const [buscar, setBuscar] = useState('')
  const [orden, setOrden] = useState('titulo')
  const [sub, setSub] = useState('todas')
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  // Decisiones marcadas (todavía NO aplicadas): id de fila → 'pausar' | 'dias'
  const [decisiones, setDecisiones] = useState({})
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [resultado, setResultado] = useState(null)
  const [foto, setFoto] = useState(null)
  const [limite, setLimite] = useState({ firma: '', n: 12 })

  const cargar = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([
        fetch('/api/mercadolibre/estado', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/mercadolibre/publicaciones', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (e.ok) setEstado(e); else setError(e.mensaje || 'No se pudo leer el estado')
      if (p.ok) setPubs(p.publicaciones)
    } catch { setError('No se pudo conectar con el servidor') }
  }, [])

  useEffect(() => {
    cargar() // eslint-disable-line react-hooks/set-state-in-effect
    const q = new URLSearchParams(window.location.search)
    if (q.get('conectado')) setAviso('Cuenta de MercadoLibre conectada. Ya puedes sincronizar tus publicaciones.')
    if (q.get('error')) setError(`${MENSAJES_ERROR[q.get('error')] || 'No se pudo conectar.'}${q.get('detalle') ? ` (${q.get('detalle')})` : ''}`)
  }, [cargar])

  const sincronizar = async () => {
    setSincronizando(true); setAviso(''); setError('')
    try {
      const d = await fetch('/api/mercadolibre/sincronizar', { method: 'POST' }).then(r => r.json())
      if (!d.ok) setError(d.mensaje || 'No se pudo sincronizar')
      else {
        const r = d.resumen
        setAviso(`Listo: ${r.publicaciones} publicaciones leídas${r.cerradas ? ` (${r.cerradas} cerradas omitidas)` : ''}${r.mercado_pago?.total ? ` (${r.mercado_pago.total} productos de Mercado Pago omitidos: no son de MercadoLibre)` : ''} · ${r.ligada || 0} en tu catálogo (ligadas por SKU) · ${r.bajo_pedido || 0} bajo pedido · ${r.ambigua || 0} por revisar.`)
        await cargar()
      }
    } catch { setError('No se pudo conectar con el servidor') }
    setSincronizando(false)
  }

  const ligar = async (id, producto_id) => {
    setError('')
    const d = await fetch('/api/mercadolibre/publicaciones', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, producto_id }),
    }).then(r => r.json()).catch(() => ({ ok: false, mensaje: 'No se pudo conectar con el servidor' }))
    if (!d.ok) { setError(d.mensaje || 'No se pudo ligar'); return }
    setDecisiones(prev => { const n = { ...prev }; delete n[id]; return n })
    await cargar()
  }

  const decidir = (id, valor) => setDecisiones(prev => {
    const n = { ...prev }
    if (n[id] === valor) delete n[id]; else n[id] = valor
    return n
  })

  const c = estado?.conteos || { total: 0, ligada: 0, bajo_pedido: 0, ambigua: 0 }

  // Listas para depurar: publicaciones activas que prometen entrega inmediata
  // (sin días de entrega) pero no tienen producto detrás.
  const activa = (p) => p.estado_ml === 'active'
  const sinCatalogoSinDias = (p) => activa(p) && p.liga_estado === 'bajo_pedido' && !p.tiempo_preparacion
  const instanteSinStock = (p) => activa(p) && p.liga_estado === 'ligada' && !p.tiempo_preparacion && p.producto?.stock === 0
  const sinEnvio = (p) => p.tipo_envio === 'not_specified'
  const nSinEnvio = (pubs || []).filter(p => activa(p) && sinEnvio(p)).length
  const nBaja = (pubs || []).filter(sinCatalogoSinDias).length
  const nSinStock = (pubs || []).filter(instanteSinStock).length
  const nDep = (c.ambigua || 0) + nBaja + nSinStock + nSinEnvio

  const visibles = (pubs || []).filter(p => {
    if (filtro === 'sinenvio' && !(activa(p) && sinEnvio(p))) return false
    if (filtro === 'baja' && !sinCatalogoSinDias(p)) return false
    if (filtro === 'sinstock' && !instanteSinStock(p)) return false
    if (filtro === 'bajo_pedido' && p.liga_estado !== 'bajo_pedido') return false
    if (filtro === 'ligadas' && p.liga_estado !== 'ligada') return false
    if (filtro === 'ligadas' && sub === 'activas' && p.estado_ml !== 'active') return false
    if (filtro === 'ligadas' && sub === 'pausadas' && p.estado_ml !== 'paused') return false
    if (filtro === 'ligadas' && sub === 'bajo' && !((p.producto?.stock ?? 0) <= 2)) return false
    if (filtro === 'revisar' && p.liga_estado !== 'ambigua') return false
    const t = buscar.trim().toLowerCase()
    return !t || `${p.titulo} ${p.sku || ''} ${p.item_id}`.toLowerCase().includes(t)
  }).sort((x, y) => {
    const g = (p) => p.dinero?.ganancia
    if (orden === 'mas') return (g(y) ?? -Infinity) - (g(x) ?? -Infinity)
    if (orden === 'menos') return (g(x) ?? Infinity) - (g(y) ?? Infinity)
    if (orden === 'stock') return (x.producto?.stock ?? Infinity) - (y.producto?.stock ?? Infinity)
    return 0
  })

  const enDepuracion = filtro === 'baja' || filtro === 'sinstock'
  const firma = `${filtro}|${sub}|${buscar}|${orden}`
  const limiteEf = limite.firma === firma ? limite.n : 12
  const marcarVisibles = (valor) => setDecisiones(prev => {
    const n = { ...prev }
    for (const p of visibles) n[p.id] = valor
    return n
  })

  // Resumen de lo marcado, por publicación (una publicación = un item_id).
  const porId = Object.fromEntries((pubs || []).map(p => [p.id, p]))
  const marcadas = Object.entries(decisiones).map(([id, v]) => ({ pub: porId[id], valor: v })).filter(x => x.pub)
  const aPausar = marcadas.filter(x => x.valor === 'pausar')
  const aDias = marcadas.filter(x => x.valor === 'dias')

  const aplicar = async () => {
    setAplicando(true); setResultado(null); setError('')
    // Sin repetir publicaciones (una con variantes ocupa varias filas).
    const vistos = new Set()
    const acciones = []
    for (const { pub, valor } of marcadas) {
      const clave = `${pub.item_id}:${valor}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      acciones.push(valor === 'pausar'
        ? { item_id: pub.item_id, accion: 'pausar', titulo: pub.titulo }
        : { item_id: pub.item_id, accion: 'dias_entrega', dias: DIAS_BAJO_PEDIDO, titulo: pub.titulo })
    }
    const todos = []
    try {
      for (let i = 0; i < acciones.length; i += 10) {
        setProgreso(`Aplicando ${Math.min(i + 10, acciones.length)} de ${acciones.length}…`)
        const lote = acciones.slice(i, i + 10).map(a => ({ item_id: a.item_id, accion: a.accion, ...(a.dias ? { dias: a.dias } : {}) }))
        const d = await fetch('/api/mercadolibre/acciones', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acciones: lote }),
        }).then(r => r.json())
        if (!d.ok) { setError(d.mensaje || 'No se pudo aplicar'); break }
        todos.push(...d.resultados)
      }
    } catch { setError('Se cortó la conexión. Revisa abajo qué alcanzó a aplicarse y vuelve a intentar con el resto.') }

    const titulos = Object.fromEntries(acciones.map(a => [a.item_id, a.titulo]))
    const fallos = todos.filter(r => !r.ok).map(r => ({ ...r, titulo: titulos[r.item_id] || r.item_id }))
    const exitosos = new Set(todos.filter(r => r.ok).map(r => r.item_id))
    setResultado({ ok: todos.length - fallos.length, fallos })
    // Lo aplicado sale de las decisiones; lo que falló se queda para reintentar.
    setDecisiones(prev => {
      const n = { ...prev }
      for (const id of Object.keys(n)) if (exitosos.has(porId[id]?.item_id)) delete n[id]
      return n
    })
    setConfirmando(false); setProgreso(''); setAplicando(false)
    await cargar()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: `22px 24px ${marcadas.length ? 110 : 60}px` }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg,#2F4D70 0%,#466D9B 100%)', color: '#fff', borderRadius: 18, padding: '18px 20px', marginBottom: 14, boxShadow: '0 6px 18px rgba(47,77,112,0.25)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.6 }}>MercadoLibre</div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 3 }}>Tus publicaciones, su stock y cuánto te dejan</div>
            </div>
            {!estado ? <div style={{ fontSize: 13, opacity: 0.8 }}>Cargando…</div>
              : !estado.credenciales ? <div style={{ fontSize: 13, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px' }}>Falta poner ML_CLIENT_ID y ML_CLIENT_SECRET en .env.local (y en Vercel).</div>
              : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '8px 14px' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 99, background: estado.conectado ? '#5be3a8' : '#ffb4a8', marginRight: 7 }} />
                      {estado.conectado ? `Conectada${estado.cuenta?.nickname ? ` · ${estado.cuenta.nickname}` : ''}` : 'Sin conectar'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{estado.conectado ? `Sincronizado: ${estado.ultima_sincronizacion ? fechaHora(estado.ultima_sincronizacion) : 'todavía no'}` : 'Autoriza a Denog a leer tus publicaciones y ventas.'}</div>
                  </div>
                  {estado.conectado && <button onClick={sincronizar} disabled={sincronizando} style={{ minHeight: 42, padding: '0 18px', borderRadius: 11, border: 'none', background: '#fff', color: '#2F4D70', fontWeight: 900, fontSize: 14, cursor: sincronizando ? 'wait' : 'pointer', opacity: sincronizando ? 0.7 : 1 }}>{sincronizando ? 'Sincronizando…' : '↻ Sincronizar'}</button>}
                  <a href="/api/mercadolibre/conectar" style={{ minHeight: 42, padding: '0 14px', borderRadius: 11, display: 'inline-flex', alignItems: 'center', fontWeight: 800, fontSize: 13, textDecoration: 'none', color: estado.conectado ? '#fff' : '#2F4D70', background: estado.conectado ? 'rgba(255,255,255,0.16)' : '#fff' }}>{estado.conectado ? 'Reconectar' : 'Conectar MercadoLibre'}</a>
                </div>
              )}
          </div>
        </div>

        {error && <div style={{ background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.3)', color: 'var(--rojo)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {aviso && <div style={{ background: 'rgba(15,138,99,0.08)', border: '1px solid rgba(15,138,99,0.3)', color: 'var(--verde)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{aviso}</div>}

        {resultado && (
          <div style={{ background: 'var(--sup)', border: `1px solid ${resultado.fallos.length ? 'rgba(185,28,28,0.3)' : 'rgba(15,138,99,0.3)'}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tinta)' }}>
              {resultado.ok} cambio{resultado.ok === 1 ? '' : 's'} aplicado{resultado.ok === 1 ? '' : 's'} en MercadoLibre{resultado.fallos.length ? ` · ${resultado.fallos.length} con error` : ''}
            </div>
            {resultado.fallos.map(f => (
              <div key={f.item_id + f.accion} style={{ fontSize: 12.5, color: 'var(--rojo)', marginTop: 6, lineHeight: 1.4 }}>
                <b>{f.titulo}</b> ({f.item_id}): {f.mensaje}
              </div>
            ))}
            {resultado.fallos.length > 0 && <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 8 }}>Las que fallaron siguen marcadas para que las reintentes.</div>}
            <button onClick={() => setResultado(null)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--w40)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Cerrar</button>
          </div>
        )}

        {estado?.conectado && (<>
          {(() => {
            const act = (pubs || []).filter(activa)
            const conG = act.filter(p => p.dinero?.ganancia != null && !p.dinero.sinReal)
            const prom = conG.length ? Math.round(conG.reduce((s, p) => s + (p.dinero.sobre_costo_pct || 0), 0) / conG.length) : null
            const pierden = conG.filter(p => p.dinero.ganancia < 0).length
            const pendDec = (pubs || []).filter(p => p.sync_pendiente === 'sin_stock').length
            const atencion = nDep + pendDec
            const tile = (icono, n, et, sub, col, ir) => (
              <button key={et} onClick={ir} style={{ flex: '1 1 150px', textAlign: 'left', cursor: 'pointer', background: 'var(--sup)', border: '1px solid var(--w08)', borderTop: `4px solid ${col}`, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--w50)' }}>{icono} {et}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: col, lineHeight: 1.15 }}>{n}</div>
                <div style={{ fontSize: 11.5, color: 'var(--w50)' }}>{sub}</div>
              </button>
            )
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {tile('🟢', act.length, 'Activas', 'publicaciones en venta', '#0b6b4d', () => { setFiltro('ligadas'); setSub('activas') })}
                {tile('📈', prom != null ? `${prom}%` : '—', 'Ganancia promedio', 'sobre lo que te costó', '#2F4D70', () => { setFiltro('ligadas'); setSub('todas'); setOrden('mas') })}
                {tile('📉', pierden, 'Pierden dinero', 'ganancia negativa', pierden ? '#b3261e' : '#6b645a', () => { setFiltro('ligadas'); setSub('todas'); setOrden('menos') })}
                {tile('🔧', atencion, 'Necesitan atención', 'por revisar o decidir', atencion ? '#d9731a' : '#6b645a', () => setFiltro('revisar'))}
              </div>
            )
          })()}
          <Reputacion />
          <PorDecidir pubs={pubs} alCambiar={cargar} />
          {(() => {
            const seccion = filtro === 'ligadas' ? 'stock' : filtro === 'bajo_pedido' ? 'pedido' : 'depurar'
            const tab = (activo, col) => ({ flex: '1 1 150px', textAlign: 'center', cursor: 'pointer', padding: '10px 12px', borderRadius: 12, border: `2px solid ${activo ? col : 'var(--w10)'}`, background: activo ? col : 'var(--sup)', color: activo ? '#fff' : 'var(--tinta)', fontWeight: 900, fontSize: 14 })
            const tabs = [
              ['stock', 'ligadas', '📦 Con stock', c.ligada, 'Ligadas a tu catálogo. El stock se maneja desde el sitio.', '#2F4D70'],
              ['pedido', 'bajo_pedido', '🕒 Bajo pedido', c.bajo_pedido || 0, 'Sin stock físico: se compra cuando se vende y se entrega en días.', '#6B4FA0'],
              ['depurar', 'revisar', '🔧 Por revisar', nDep, 'Dudosas, sin envío o sin stock que prometen entrega inmediata.', '#8a4b3a'],
            ]
            return (
              <div style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--fondo)', padding: '8px 0 10px', borderBottom: '1px solid var(--w08)', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tabs.map(([k, f, t, n, , col]) => <button key={k} onClick={() => setFiltro(f)} style={tab(seccion === k, col)}>{t} <span style={{ opacity: 0.85 }}>· {n}</span></button>)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--w50)', margin: '6px 2px 0' }}>{tabs.find(x => x[0] === seccion)?.[4]}</div>
                {seccion === 'stock' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {[['todas', 'Todas'], ['activas', 'Activas'], ['pausadas', 'Pausadas'], ['bajo', 'Stock bajo (2 o menos)']].map(([v, t]) => <button key={v} style={chip(sub === v)} onClick={() => setSub(v)}>{t}</button>)}
                  </div>
                )}
                {seccion === 'depurar' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    {[['revisar', `Por revisar · ${c.ambigua || 0}`], ['baja', `Dar de baja o ligar · ${nBaja}`], ['sinstock', `Al instante sin stock · ${nSinStock}`], ...(nSinEnvio > 0 ? [['sinenvio', `Sin Mercado Envíos · ${nSinEnvio}`]] : [])].map(([v, t]) => <button key={v} style={chip(filtro === v)} onClick={() => setFiltro(v)}>{t}</button>)}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input style={{ ...inputEstilo, flex: 1, minWidth: 180 }} placeholder="🔎 Buscar por título, SKU o número de publicación" value={buscar} onChange={e => setBuscar(e.target.value)} />
                  <select value={orden} onChange={e => setOrden(e.target.value)} style={{ ...inputEstilo, minWidth: 170 }}>
                    <option value="titulo">Orden: por nombre</option>
                    <option value="mas">Orden: más ganancia</option>
                    <option value="menos">Orden: menos ganancia</option>
                    <option value="stock">Orden: stock más bajo</option>
                  </select>
                </div>
              </div>
            )
          })()}

          {filtro === 'sinenvio' && (
            <div style={{ fontSize: 12.5, color: 'var(--w60)', marginBottom: 10, lineHeight: 1.5 }}>
              Publicaciones que la API de MercadoLibre marca como activas pero <b>no usan Mercado Envíos</b>. Son las que no ves en tu panel de vendedor
              (el panel muestra solo las que sí lo usan) y su página pública no abre. Mira el sub-estado en cada fila: ahí MercadoLibre dice qué les pasa.
            </div>
          )}
          {filtro === 'baja' && (
            <div style={{ fontSize: 12.5, color: 'var(--w60)', marginBottom: 10, lineHeight: 1.5 }}>
              Activas, sin días de entrega y fuera de tu catálogo: prometen entrega inmediata y no hay producto detrás.
              En cada una decide: <b>si sí existe</b>, búscala abajo y se liga; <b>si ya no existe</b>, márcala para pausar.
              <div style={{ marginTop: 6 }}>
                <button onClick={() => marcarVisibles('pausar')} style={enlaceBoton}>Marcar todas las que se ven para pausar</button>
              </div>
            </div>
          )}
          {filtro === 'sinstock' && (
            <div style={{ fontSize: 12.5, color: 'var(--w60)', marginBottom: 10, lineHeight: 1.5 }}>
              Ligadas a tu catálogo, sin días de entrega, y tu catálogo marca 0 piezas: si se venden, no hay producto para despachar.
              En cada una decide: <b>pausar</b>, o dejarla <b>bajo pedido con {DIAS_BAJO_PEDIDO} días</b> de entrega.
              <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <button onClick={() => marcarVisibles('pausar')} style={enlaceBoton}>Todas a pausar</button>
                <button onClick={() => marcarVisibles('dias')} style={enlaceBoton}>Todas a {DIAS_BAJO_PEDIDO} días</button>
              </div>
            </div>
          )}

          {pubs === null ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
            : visibles.length === 0 ? (
              <div style={{ color: 'var(--w40)', fontSize: 13 }}>
                {c.total === 0 ? 'Todavía no hay publicaciones. Toca “Sincronizar publicaciones”.' : enDepuracion ? 'Nada pendiente en esta lista. 🎉' : 'Nada en este filtro.'}
              </div>
            ) : (
              <>
                {filtro === 'ligadas' && visibles.some(p => p.dinero && !p.dinero.real && p.dinero.ganancia != null) && (
                  <div style={{ fontSize: 12, color: 'var(--w50)', margin: '0 2px 8px' }}>ℹ️ Las ganancias marcadas <b>Estimado</b> no incluyen el envío (aún no se venden); se corrigen solas con la primera venta.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visibles.slice(0, limiteEf).map(p => (
                    <Tarjeta key={p.id} p={p} enDepuracion={enDepuracion} filtro={filtro} dec={decisiones[p.id]} decidir={decidir} ligar={ligar}
                      alCambiar={cargar} sinEnvio={sinEnvio} dias={DIAS_BAJO_PEDIDO} alAbrirFoto={setFoto} />
                  ))}
                </div>
                {visibles.length > limiteEf && (
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button onClick={() => setLimite({ firma, n: limiteEf + 12 })} style={{ ...botonAzul(false), minHeight: 44, padding: '0 22px' }}>Ver 12 más · faltan {visibles.length - limiteEf}</button>
                  </div>
                )}
              </>
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

      {marcadas.length > 0 && !confirmando && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--sup)', borderTop: '1px solid var(--w10)', padding: '12px 24px', zIndex: 40, boxShadow: '0 -4px 14px rgba(0,0,0,0.08)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13.5, color: 'var(--tinta)', fontWeight: 700 }}>
              {marcadas.length} decisión{marcadas.length === 1 ? '' : 'es'} marcada{marcadas.length === 1 ? '' : 's'}
              <span style={{ color: 'var(--w50)', fontWeight: 600 }}> · {aPausar.length} para pausar · {aDias.length} bajo pedido a {DIAS_BAJO_PEDIDO} días · aún no se aplica nada</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDecisiones({})} style={{ ...botonAzul(false), background: 'var(--w05)', color: 'var(--w60)' }}>Limpiar</button>
              <button onClick={() => setConfirmando(true)} style={botonAzul(false)}>Revisar y aplicar en MercadoLibre</button>
            </div>
          </div>
        </div>
      )}

      {confirmando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}>
          <div style={{ background: 'var(--sup)', borderRadius: 14, padding: 20, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--tinta)' }}>Esto cambia tu cuenta de MercadoLibre</div>
            <div style={{ fontSize: 13.5, color: 'var(--w60)', marginTop: 10, lineHeight: 1.55 }}>
              {aPausar.length > 0 && <div>• <b>{aPausar.length}</b> publicación{aPausar.length === 1 ? '' : 'es'} se <b>pausará{aPausar.length === 1 ? '' : 'n'}</b>. Se pueden reactivar cuando quieras desde MercadoLibre.</div>}
              {aDias.length > 0 && <div>• <b>{aDias.length}</b> publicación{aDias.length === 1 ? '' : 'es'} pasará{aDias.length === 1 ? '' : 'n'} a <b>entrega en {DIAS_BAJO_PEDIDO} días</b> (bajo pedido). Tendrán menos exposición que las que tienen stock.</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 10, lineHeight: 1.5 }}>
              Cada cambio queda registrado con cómo estaba antes. Si alguna falla, las demás siguen y te muestro cuál.
              {marcadas.length > 1 && ' Si es la primera vez, puedes probar con una sola y revisar en MercadoLibre antes de aplicar el resto.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmando(false)} disabled={aplicando} style={{ ...botonAzul(false), background: 'var(--w05)', color: 'var(--w60)' }}>Cancelar</button>
              <button onClick={aplicar} disabled={aplicando} style={botonAzul(aplicando)}>{aplicando ? (progreso || 'Aplicando…') : 'Sí, aplicar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
