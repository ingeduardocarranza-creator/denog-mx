'use client'
import { useState, useEffect, useCallback } from 'react'

// Paquetes que la bodega de Nogales registró. Los que llegaron dañados
// traen de 1 a 3 fotos de evidencia y una nota opcional.
// El admin puede borrar un registro equivocado (se borran también sus fotos).
//
// Pestaña "Pedidos en línea": lo que las tiendas avisan por correo (pedido
// confirmado, enviado con guía, entregado), cruzado por guía con lo que la
// bodega escaneó. Solo lo ve el admin; la pantalla de Diego no cambia.

const ESTADOS = {
  confirmado:   { t: 'Confirmado',   c: 'var(--w55)',  bg: 'var(--w05)' },
  listo_pickup: { t: 'Listo para pickup', c: '#a16207', bg: 'rgba(161,98,7,0.10)' },
  enviado:      { t: 'En camino',    c: '#466D9B',     bg: 'rgba(70,109,155,0.12)' },
  en_reparto:   { t: 'Llega hoy',    c: '#466D9B',     bg: 'rgba(70,109,155,0.18)' },
  entregado:    { t: 'Entregado (según la tienda)', c: '#a16207', bg: 'rgba(161,98,7,0.10)' },
  cancelado:    { t: 'Cancelado',    c: 'var(--rojo)', bg: 'rgba(185,28,28,0.08)' },
}
const fechaCorta = (iso) => iso ? new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Hermosillo' }) : ''

const fechaLocal = (dias = 0) => {
  const d = new Date(Date.now() - 7 * 3600 * 1000 - dias * 86400000)
  return d.toISOString().slice(0, 10)
}
const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })

const inputEstilo = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }
const chip = (activo) => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${activo ? '#466D9B' : 'var(--w10)'}`,
  background: activo ? 'rgba(70,109,155,0.12)' : 'var(--w04)',
  color: activo ? '#466D9B' : 'var(--w50)',
})

export default function PaquetesNogales() {
  const [desde, setDesde] = useState(fechaLocal())
  const [hasta, setHasta] = useState(fechaLocal())
  const [guia, setGuia] = useState('')
  const [paquetes, setPaquetes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [fotoGrande, setFotoGrande] = useState(null)
  const [soloDanados, setSoloDanados] = useState(false)
  const [pestana, setPestana] = useState('escaneados')        // escaneados | pedidos
  const [pedidos, setPedidos] = useState(null)                // pedidos en línea (correos de las tiendas)
  const [correoListo, setCorreoListo] = useState(true)
  const [leyendo, setLeyendo] = useState(false)
  const [avisoCorreo, setAvisoCorreo] = useState('')
  const [filtroPed, setFiltroPed] = useState('todos')
  const [buscarPed, setBuscarPed] = useState('')

  const cargarPedidos = useCallback(async () => {
    try {
      const d = await fetch('/api/bodega/pedidos-en-linea', { cache: 'no-store' }).then(r => r.json())
      if (d.ok) { setPedidos(d.pedidos); setCorreoListo(d.correoConfigurado) }
    } catch {}
  }, [])
  useEffect(() => { cargarPedidos() }, []) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  // Lee en vueltas de hasta 120 correos hasta que no queden pendientes.
  const leerCorreos = async () => {
    setLeyendo(true); setAvisoCorreo('')
    const total = { correos: 0, avisos: 0, ofertas: 0 }
    try {
      for (let vuelta = 0; vuelta < 25; vuelta++) {
        const d = await fetch('/api/bodega/pedidos-en-linea/leer', { method: 'POST' }).then(r => r.json())
        if (!d.ok) { setAvisoCorreo(d.mensaje || 'No se pudo leer el correo.'); break }
        if (d.correos === 0 && d.errores?.length) { setAvisoCorreo(`No se pudo leer el correo: ${d.errores[0]}`); break }
        total.correos += d.correos; total.avisos += d.avisos; total.ofertas += d.ofertas
        setAvisoCorreo(total.correos === 0 ? 'No hay correos nuevos desde que empezó la venta.'
          : `${total.correos} correos leídos: ${total.avisos} avisos de pedido, ${total.ofertas} ofertas para Tendencias.${d.pendientes ? ` Faltan ${d.pendientes}, sigo leyendo…` : ' Listo.'}`)
        await cargarPedidos()
        if (!d.pendientes) break
      }
    } catch { setAvisoCorreo('Sin conexión.') }
    setLeyendo(false)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const qs = guia.trim() ? `guia=${encodeURIComponent(guia.trim())}` : `desde=${desde}&hasta=${hasta}`
    try {
      const r = await fetch(`/api/bodega/paquetes?${qs}`)
      const d = await r.json()
      if (d.ok) setPaquetes(d.paquetes)
      else setError(d.mensaje || 'No se pudo cargar.')
    } catch {
      setError('Sin conexión.')
    }
    setCargando(false)
  }, [desde, hasta, guia])

  useEffect(() => { cargar() }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const rango = (dias) => { setGuia(''); setDesde(fechaLocal(dias)); setHasta(dias === 1 ? fechaLocal(1) : fechaLocal()) }
  const rangoActivo = (dias) => !guia && hasta === (dias === 1 ? fechaLocal(1) : fechaLocal()) && desde === fechaLocal(dias)

  const borrar = async (p) => {
    const nombre = p.numero_guia ? `de la guía ${p.numero_guia}` : `sin guía (${p.tienda || ''})`
    if (!confirm(`¿Borrar el registro ${nombre}? También se borran sus fotos.`)) return
    const r = await fetch(`/api/bodega/paquetes?id=${p.id}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.ok) setPaquetes(ps => ps.filter(x => x.id !== p.id))
    else alert(d.mensaje || 'No se pudo borrar.')
  }

  const pedidoPorGuia = new Map((pedidos || []).filter(p => p.guia).map(p => [p.guia, p]))
  const sinEscanear = (pedidos || []).filter(p => p.estado === 'entregado' && !p.recibido)
  const pedVisibles = (pedidos || []).filter(p => {
    if (buscarPed.trim()) {
      const q = buscarPed.trim().toLowerCase()
      if (!`${p.tienda} ${p.numero_pedido} ${p.guia} ${(p.productos || []).map(x => x.nombre).join(' ')}`.toLowerCase().includes(q)) return false
    }
    if (filtroPed === 'camino') return ['confirmado', 'enviado', 'en_reparto', 'listo_pickup'].includes(p.estado) && !p.recibido
    if (filtroPed === 'sin_escanear') return p.estado === 'entregado' && !p.recibido
    if (filtroPed === 'recibidos') return !!p.recibido
    if (filtroPed === 'sin_guia') return !p.guia && p.estado !== 'cancelado'
    return true
  })

  const danados = paquetes.filter(p => p.danado).length
  const visibles = soloDanados ? paquetes.filter(p => p.danado) : paquetes
  // Sin guía (delivery en bolsa / pickup) se agrupan como "Sin guía".
  const grupo = (p) => p.numero_guia ? (p.paqueteria || 'Otra') : 'Sin guía'
  const porPaqueteria = paquetes.reduce((acc, p) => { acc[grupo(p)] = (acc[grupo(p)] || 0) + 1; return acc }, {})

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Paquetes Nogales</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>Lo que la bodega escaneó al recibir; los dañados traen foto de evidencia</div>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--w04)', borderRadius: 12, width: 'fit-content', marginBottom: 16 }}>
          {[['escaneados', 'Escaneados en bodega'], ['pedidos', `Pedidos en línea${pedidos ? ` · ${pedidos.length}` : ''}`]].map(([v, t]) => (
            <button key={v} onClick={() => setPestana(v)} aria-pressed={pestana === v}
              style={{ minHeight: 38, padding: '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: pestana === v ? 800 : 600,
                background: pestana === v ? 'var(--sup)' : 'transparent', color: pestana === v ? 'var(--tinta)' : 'var(--w50)', boxShadow: pestana === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{t}</button>
          ))}
        </div>

        {pestana === 'pedidos' && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <button onClick={leerCorreos} disabled={leyendo || !correoListo}
                style={{ minHeight: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: '#466D9B', color: '#fff', fontWeight: 700, fontSize: 13, cursor: leyendo ? 'wait' : 'pointer', opacity: leyendo || !correoListo ? 0.6 : 1 }}>
                {leyendo ? 'Leyendo correos…' : 'Leer correos de las tiendas'}
              </button>
              <input style={{ ...inputEstilo, flex: 1, minWidth: 180 }} placeholder="Buscar pedido, guía o producto" value={buscarPed} onChange={e => setBuscarPed(e.target.value)} />
            </div>
            {!correoListo && (
              <div style={{ background: 'rgba(161,98,7,0.08)', border: '1px solid rgba(161,98,7,0.3)', color: 'var(--ambar)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
                Falta conectar el Gmail de las tiendas: agrega CORREO_TIENDAS y CORREO_TIENDAS_CLAVE en .env.local (y en Vercel).
              </div>
            )}
            {avisoCorreo && <div style={{ fontSize: 13, color: 'var(--w60)', marginBottom: 12 }}>{avisoCorreo}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[['todos', 'Todos', (pedidos || []).length], ['camino', 'En camino', (pedidos || []).filter(p => ['confirmado', 'enviado', 'en_reparto', 'listo_pickup'].includes(p.estado) && !p.recibido).length],
                ['sin_escanear', 'Entregado y no escaneado', sinEscanear.length], ['recibidos', 'Recibidos en bodega', (pedidos || []).filter(p => p.recibido).length],
                ['sin_guia', 'Sin guía', (pedidos || []).filter(p => !p.guia && p.estado !== 'cancelado').length]].map(([v, t, n]) => (
                <button key={v} style={chip(filtroPed === v)} onClick={() => setFiltroPed(v)}>{t} · {n}</button>
              ))}
            </div>

            {pedidos === null ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
              : pedVisibles.length === 0 ? <div style={{ color: 'var(--w40)', fontSize: 13 }}>{pedidos.length === 0 ? 'Todavía no hay pedidos leídos del correo.' : 'Nada en este filtro.'}</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pedVisibles.map(p => {
                    const est = p.recibido ? { t: '✓ Recibido en bodega', c: 'var(--verde)', bg: 'rgba(15,138,99,0.10)' } : (ESTADOS[p.estado] || ESTADOS.confirmado)
                    const prods = p.productos || []
                    return (
                      <div key={p.id} style={{ background: 'var(--sup)', border: `1px solid ${!p.recibido && p.estado === 'entregado' ? 'rgba(161,98,7,0.35)' : 'var(--w08)'}`, borderRadius: 12, padding: 12 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tinta)' }}>{p.tienda} · <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>#{p.numero_pedido}</span></div>
                          <span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 6, padding: '3px 8px', color: est.c, background: est.bg }}>{est.t}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 4 }}>
                          {p.guia ? <><span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--tinta)' }}>{p.guia}</span>{p.paqueteria ? ` · ${p.paqueteria}` : ''}</> : <span style={{ color: 'var(--ambar)', fontWeight: 700 }}>Sin guía todavía</span>}
                          {p.recibido ? ` · llegó ${fechaHora(p.recibido.recibido_en)}${p.recibido.danado ? ' · DAÑADO' : ''}`
                            : p.entregado_en ? ` · la tienda dice entregado el ${fechaCorta(p.entregado_en)}`
                            : p.fecha_estimada ? ` · llega aprox. ${fechaCorta(p.fecha_estimada)}` : ''}
                          {` · último aviso ${fechaCorta(p.ultimo_correo)}`}
                        </div>
                        {prods.length > 0 && (
                          <div style={{ fontSize: 12.5, color: 'var(--w60)', marginTop: 6, lineHeight: 1.45 }}>
                            {prods.slice(0, 3).map(x => `${x.cantidad > 1 ? `${x.cantidad}× ` : ''}${x.nombre}`).join(' · ')}{prods.length > 3 ? ` · +${prods.length - 3} más` : ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        )}

        {pestana === 'escaneados' && (<>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <button style={chip(rangoActivo(0))} onClick={() => rango(0)}>Hoy</button>
          <button style={chip(rangoActivo(1))} onClick={() => rango(1)}>Ayer</button>
          <button style={chip(rangoActivo(6))} onClick={() => rango(6)}>7 días</button>
          <button style={chip(rangoActivo(29))} onClick={() => rango(29)}>30 días</button>
          <input type="date" style={inputEstilo} value={desde} onChange={e => { setGuia(''); setDesde(e.target.value) }} />
          <span style={{ color: 'var(--w40)', fontSize: 12 }}>a</span>
          <input type="date" style={inputEstilo} value={hasta} onChange={e => { setGuia(''); setHasta(e.target.value) }} />
          <input
            style={{ ...inputEstilo, flex: 1, minWidth: 180 }} placeholder="Buscar guía (todas las fechas)"
            value={guia} onChange={e => setGuia(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()}
          />
          <button style={chip(false)} onClick={cargar}>Buscar</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: '10px 16px' }}>
            <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 700 }}>TOTAL</div>
            <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{paquetes.length}</div>
          </div>
          <button onClick={() => setSoloDanados(v => !v)} title="Mostrar solo los dañados"
            style={{ background: soloDanados ? 'rgba(185,28,28,0.08)' : 'var(--sup)', border: `1px solid ${soloDanados ? 'rgba(185,28,28,0.4)' : 'var(--w08)'}`, borderRadius: 12, padding: '10px 16px', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ color: 'var(--rojo)', fontSize: 11, fontWeight: 700 }}>DAÑADOS{soloDanados ? ' · FILTRANDO' : ''}</div>
            <div style={{ color: danados ? 'var(--rojo)' : 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{danados}</div>
          </button>
          {Object.entries(porPaqueteria).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: '10px 16px' }}>
              <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 700 }}>{k.toUpperCase()}</div>
              <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>

        {error && <div style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {cargando ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>{soloDanados ? 'No hay paquetes dañados en este rango.' : 'No hay paquetes registrados en este rango.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.map(p => (
              <div key={p.id} style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(p.fotos_url || []).map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt="Evidencia" onClick={() => setFotoGrande(u)}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', background: 'var(--w06)' }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {p.numero_guia ? (
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, color: 'var(--tinta)', wordBreak: 'break-all' }}>{p.numero_guia}</div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tinta)' }}>
                      {p.tienda} · {p.tipo === 'pickup' ? 'Pickup en tienda' : 'Delivery (sin guía)'}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 2 }}>
                    {p.danado && <span style={{ background: 'rgba(185,28,28,0.10)', color: 'var(--rojo)', fontWeight: 800, fontSize: 10.5, borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>DAÑADO</span>}
                    {p.numero_guia
                      ? <span style={{ color: '#466D9B', fontWeight: 700 }}>{p.paqueteria}</span>
                      : <span style={{ background: 'rgba(161,98,7,0.12)', color: 'var(--ambar)', fontWeight: 800, fontSize: 10.5, borderRadius: 5, padding: '1px 6px' }}>SIN GUÍA</span>}
                    {' · '}{fechaHora(p.recibido_en)}{p.recibido_por_nombre ? ` · ${p.recibido_por_nombre}` : ''}
                  </div>
                  {p.notas && <div style={{ fontSize: 12, color: 'var(--ambar)', marginTop: 4 }}>Nota: {p.notas}</div>}
                  {p.numero_guia && pedidoPorGuia.get(p.numero_guia) && (() => {
                    const ped = pedidoPorGuia.get(p.numero_guia)
                    return <div style={{ fontSize: 12, color: '#466D9B', marginTop: 4, fontWeight: 600 }}>{ped.tienda} · pedido #{ped.numero_pedido}{ped.productos?.length ? ` · ${ped.productos.length} artículo${ped.productos.length > 1 ? 's' : ''}` : ''}</div>
                  })()}
                </div>
                <button onClick={() => borrar(p)} style={{ background: 'none', border: '1px solid var(--w10)', color: 'var(--w45)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>

      {fotoGrande && (
        <div onClick={() => setFotoGrande(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="Evidencia" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>
      )}
    </div>
  )
}
