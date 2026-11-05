'use client'
import { useState, useEffect, useCallback } from 'react'

// MercadoLibre · Fase 1 (solo admin): conectar la cuenta por API, traer las
// publicaciones y ligarlas al catálogo por SKU. Lo que no se liga solo se
// resuelve aquí a mano. Esta pantalla no modifica nada en MercadoLibre.

const ETIQUETA = {
  ligada:           { t: 'Ligada',            c: 'var(--verde)', bg: 'rgba(15,138,99,0.10)' },
  sin_sku:          { t: 'Sin SKU',           c: 'var(--ambar)', bg: 'rgba(161,98,7,0.10)' },
  sin_coincidencia: { t: 'SKU sin producto',  c: 'var(--rojo)',  bg: 'rgba(185,28,28,0.08)' },
  ambigua:          { t: 'SKU repetido',      c: 'var(--rojo)',  bg: 'rgba(185,28,28,0.08)' },
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
      <input style={{ ...inputEstilo, width: '100%', boxSizing: 'border-box' }} placeholder="Buscar en tu catálogo por nombre o código para ligarla"
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

export default function MercadoLibreAdmin() {
  const [estado, setEstado] = useState(null)
  const [pubs, setPubs] = useState(null)
  const [filtro, setFiltro] = useState('pendientes')
  const [buscar, setBuscar] = useState('')
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

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
        setAviso(`Listo: ${r.publicaciones} publicaciones leídas · ${r.ligada || 0} ligadas por SKU · ${(r.sin_sku || 0) + (r.sin_coincidencia || 0) + (r.ambigua || 0)} por revisar.`)
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
    await cargar()
  }

  const c = estado?.conteos || { total: 0, ligada: 0, sin_sku: 0, sin_coincidencia: 0, ambigua: 0 }
  const pendientes = c.sin_sku + c.sin_coincidencia + c.ambigua
  const visibles = (pubs || []).filter(p => {
    if (filtro === 'pendientes' && p.liga_estado === 'ligada') return false
    if (filtro === 'ligadas' && p.liga_estado !== 'ligada') return false
    const t = buscar.trim().toLowerCase()
    return !t || `${p.titulo} ${p.sku || ''} ${p.item_id}`.toLowerCase().includes(t)
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>MercadoLibre</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>Conexión de tu cuenta y publicaciones ligadas a tu catálogo por SKU</div>
        </div>

        {error && <div style={{ background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.3)', color: 'var(--rojo)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {aviso && <div style={{ background: 'rgba(15,138,99,0.08)', border: '1px solid rgba(15,138,99,0.3)', color: 'var(--verde)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{aviso}</div>}

        <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          {!estado ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
            : !estado.credenciales ? (
              <div style={{ fontSize: 13, color: 'var(--ambar)', lineHeight: 1.5 }}>
                Falta crear la aplicación en MercadoLibre y poner <b>ML_CLIENT_ID</b> y <b>ML_CLIENT_SECRET</b> en .env.local (y en Vercel).
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tinta)' }}>
                    {estado.conectado ? `✓ Conectada${estado.cuenta?.nickname ? ` · ${estado.cuenta.nickname}` : ''}` : 'Sin conectar'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 3 }}>
                    {estado.conectado
                      ? `Última sincronización: ${estado.ultima_sincronizacion ? fechaHora(estado.ultima_sincronizacion) : 'todavía no'}`
                      : 'Autoriza a Denog a leer tus publicaciones y ventas. No modifica nada en MercadoLibre.'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {estado.conectado && <button onClick={sincronizar} disabled={sincronizando} style={botonAzul(sincronizando)}>{sincronizando ? 'Sincronizando…' : 'Sincronizar publicaciones'}</button>}
                  <a href="/api/mercadolibre/conectar" style={{ ...botonAzul(false), background: estado.conectado ? 'var(--w05)' : '#466D9B', color: estado.conectado ? 'var(--w60)' : '#fff' }}>
                    {estado.conectado ? 'Reconectar' : 'Conectar MercadoLibre'}
                  </a>
                </div>
              </div>
            )}
        </div>

        {estado?.conectado && (<>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            {[['pendientes', `Por revisar · ${pendientes}`], ['ligadas', `Ligadas · ${c.ligada}`], ['todas', `Todas · ${c.total}`]].map(([v, t]) => (
              <button key={v} style={chip(filtro === v)} onClick={() => setFiltro(v)}>{t}</button>
            ))}
            <input style={{ ...inputEstilo, flex: 1, minWidth: 180 }} placeholder="Buscar por título, SKU o número de publicación" value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>

          {pubs === null ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
            : visibles.length === 0 ? (
              <div style={{ color: 'var(--w40)', fontSize: 13 }}>
                {c.total === 0 ? 'Todavía no hay publicaciones. Toca “Sincronizar publicaciones”.' : 'Nada en este filtro.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibles.map(p => {
                  const et = ETIQUETA[p.liga_estado] || ETIQUETA.sin_coincidencia
                  return (
                    <div key={p.id} style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: 12, display: 'flex', gap: 12 }}>
                      {p.miniatura && <img src={p.miniatura} alt="" width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--tinta)', lineHeight: 1.3 }}>{p.titulo}</div>
                          <span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 6, padding: '3px 8px', color: et.c, background: et.bg, whiteSpace: 'nowrap' }}>{et.t}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 4 }}>
                          {p.item_id} · {p.sku ? <>SKU <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--tinta)' }}>{p.sku}</span></> : 'sin SKU'}
                          {p.precio != null ? ` · ${peso(p.precio)}` : ''}
                          {p.tiempo_preparacion ? ` · entrega en ${p.tiempo_preparacion} días` : ''}
                          {p.estado_ml && p.estado_ml !== 'active' ? ` · ${p.estado_ml}` : ''}
                        </div>
                        {p.producto ? (
                          <div style={{ fontSize: 12.5, color: 'var(--w60)', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>→ <b style={{ color: 'var(--tinta)' }}>{p.producto.nombre}</b> · stock {p.producto.stock}{p.liga_manual ? ' · a mano' : ''}</span>
                            <button onClick={() => ligar(p.id, null)} style={{ background: 'none', border: 'none', color: 'var(--w40)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>Quitar liga</button>
                          </div>
                        ) : <Ligar pub={p} alLigar={ligar} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </>)}
      </div>
    </div>
  )
}
