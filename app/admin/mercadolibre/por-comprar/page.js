'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

// Por comprar (MercadoLibre) — solo admin.
// Cada venta de MercadoLibre sin stock real entra aquí sola. Flujo de cada
// producto: Por comprar → "Ya la compré" (va en camino) → "Ya llegó" (ya está
// en Hermosillo; desde ahí lo ven los colaboradores para empacar).
// Separado de los pedidos de WhatsApp.

const inputEstilo = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '8px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const chip = (activo) => ({
  padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  border: `1.5px solid ${activo ? '#466D9B' : 'var(--w10)'}`,
  background: activo ? '#466D9B' : 'var(--w04)',
  color: activo ? '#fff' : 'var(--w60)',
})
const botonAzul = (ocupado) => ({
  minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#466D9B', color: '#fff',
  fontWeight: 800, fontSize: 13.5, cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.6 : 1,
})
const botonSuave = { minHeight: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--w10)', background: 'var(--w04)', color: 'var(--w60)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }
// La miniatura de MercadoLibre es de 90 px (se ve borrosa al agrandarla): la versión -O es la grande.
const grande = (u) => u ? String(u).replace(/-I\.(jpg|jpeg|webp|png)$/i, '-O.$1') : u
const fechaHora = (iso) => iso
  ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })
  : ''
const hoyLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Hermosillo' })
// "Tienes hasta ..." según la fecha límite (la de MercadoLibre o venta + días prometidos).
function plazo(limite) {
  if (!limite) return null
  const faltan = Math.round((new Date(`${limite.dia}T00:00:00Z`) - new Date(`${hoyLocal()}T00:00:00Z`)) / 86400000)
  const fecha = new Date(`${limite.dia}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  if (faltan < 0) return { color: 'rojo', texto: `Ya venció el ${fecha} (hace ${-faltan} ${-faltan === 1 ? 'día' : 'días'})` }
  if (faltan === 0) return { color: 'rojo', texto: `Vence hoy · ${fecha}` }
  if (faltan === 1) return { color: 'amarillo', texto: `Tienes hasta mañana · ${fecha}` }
  if (faltan <= 3) return { color: 'amarillo', texto: `Tienes hasta el ${fecha} (${faltan} días)` }
  return { color: 'normal', texto: `Tienes hasta el ${fecha} (${faltan} días)` }
}
const COLOR_PLAZO = {
  rojo: { c: 'var(--rojo)', bg: 'rgba(185,28,28,0.10)' },
  amarillo: { c: '#8a6a00', bg: 'rgba(181,137,0,0.16)' },
  normal: { c: 'var(--w60)', bg: 'var(--w05)' },
}
const usd = (n) => n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function Ficha({ fila, alGuardar }) {
  const f = fila.ficha || {}
  const [abierta, setAbierta] = useState(false)
  const [tienda, setTienda] = useState(f.tienda || '')
  const [enlace, setEnlace] = useState(f.enlace_compra || '')
  const [costo, setCosto] = useState(f.costo_usd ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setGuardando(true); setError('')
    try {
      const d = await fetch('/api/mercadolibre/fichas', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_id: fila.item_id, variacion_id: fila.variacion_id, tienda, enlace_compra: enlace, costo_usd: costo }),
      }).then(r => r.json())
      if (!d.ok) setError(d.mensaje || 'No se pudo guardar')
      else { setAbierta(false); alGuardar() }
    } catch { setError('No se pudo guardar') }
    setGuardando(false)
  }

  if (!abierta) {
    return (
      <button style={{ ...botonSuave, minHeight: 32 }} onClick={() => setAbierta(true)}>
        {fila.ficha?.tienda || fila.ficha?.enlace_compra || fila.ficha?.costo_usd != null ? 'Editar ficha de compra' : 'Capturar ficha de compra'}
      </button>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6, maxWidth: 520 }}>
      <input style={inputEstilo} placeholder="Tienda (ej. Walmart Nogales)" value={tienda} onChange={e => setTienda(e.target.value)} />
      <input style={inputEstilo} placeholder="Enlace del producto (opcional)" value={enlace} onChange={e => setEnlace(e.target.value)} />
      <input style={inputEstilo} placeholder="Costo en USD" inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} />
      {error && <div style={{ color: 'var(--rojo)', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={botonAzul(guardando)} disabled={guardando} onClick={guardar}>Guardar ficha</button>
        <button style={botonSuave} onClick={() => setAbierta(false)}>Cancelar</button>
      </div>
    </div>
  )
}

export default function PorComprarML() {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('por_comprar')
  const [agrupar, setAgrupar] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [revisando, setRevisando] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    try {
      const d = await fetch('/api/mercadolibre/ventas', { cache: 'no-store' }).then(r => r.json())
      if (!d.ok) setError(d.mensaje || 'No se pudo cargar')
      else { setItems(d.items); setError('') }
    } catch { setError('No se pudo cargar') }
    setCargando(false)
  }, [])

  const revisar = useCallback(async (recientes) => {
    setRevisando(true)
    try {
      const d = await fetch('/api/mercadolibre/ventas/procesar', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recientes }),
      }).then(r => r.json())
      if (!d.ok) setAviso(d.mensaje || 'No se pudo revisar MercadoLibre')
      else if (recientes) setAviso(`Revisadas ${d.recientes?.revisadas ?? 0} ventas recientes · ${d.recientes?.nuevas ?? 0} nuevas${d.recientes?.errores ? ` · ${d.recientes.errores} con error (${d.recientes.primer_error})` : ''}`)
      else setAviso('')
    } catch { setAviso('No se pudo revisar MercadoLibre') }
    setRevisando(false)
    cargar()
  }, [cargar])

  // Al entrar: atiende los avisos pendientes y recarga cada minuto.
  useEffect(() => {
    const t0 = setTimeout(() => { revisar(false) }, 0)
    const t = setInterval(() => { revisar(false) }, 60000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [revisar])

  async function cambiar(accion, ids) {
    setOcupado(true)
    try {
      const d = await fetch('/api/mercadolibre/ventas/items', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, ids }),
      }).then(r => r.json())
      if (!d.ok) setAviso(d.mensaje || 'No se pudo cambiar')
    } catch { setAviso('No se pudo cambiar') }
    setOcupado(false)
    cargar()
  }

  const porComprar = useMemo(() => items.filter(i => i.estado === 'por_comprar'), [items])
  const comprados = useMemo(() => items.filter(i => i.estado === 'comprado'), [items])
  const sinEtiqueta = useMemo(() => items.filter(i => i.esperando_etiqueta), [items])
  const urgentes = porComprar.filter(i => i.urgente)
  const lista = vista === 'por_comprar' ? porComprar : vista === 'comprados' ? comprados : sinEtiqueta

  const grupos = useMemo(() => {
    if (!agrupar) return [{ nombre: null, filas: lista }]
    const m = new Map()
    for (const f of lista) {
      const k = f.ficha?.tienda || 'Sin tienda asignada'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(f)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, filas]) => ({ nombre, filas }))
  }, [lista, agrupar])

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: 1100, margin: '0 auto', color: 'var(--tinta)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Por comprar (MercadoLibre)</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--w50)', fontSize: 14 }}>
            Cada venta sin stock entra aquí sola. Separado de los pedidos de WhatsApp.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={botonSuave} onClick={() => revisar(true)} disabled={revisando}>
            {revisando ? 'Revisando…' : 'Revisar ventas recientes'}
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 14, color: 'var(--rojo)', fontWeight: 700 }}>{error}</div>}
      {aviso && <div style={{ marginTop: 14, background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5 }}>{aviso}</div>}

      {urgentes.length > 0 && (
        <div style={{ marginTop: 16, background: 'rgba(185,28,28,0.08)', border: '2px solid var(--rojo)', color: 'var(--rojo)', borderRadius: 12, padding: '12px 16px', fontWeight: 700, fontSize: 14.5, lineHeight: 1.4 }}>
          Urgente: {urgentes.length} {urgentes.length === 1 ? 'producto vendido prometía' : 'productos vendidos prometían'} entrega inmediata y no hay stock. Compra hoy o pausa esa publicación.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        <button style={chip(vista === 'por_comprar')} onClick={() => setVista('por_comprar')}>Por comprar ({porComprar.length})</button>
        <button style={chip(vista === 'comprados')} onClick={() => setVista('comprados')}>Comprados, en camino ({comprados.length})</button>
        <button style={chip(vista === 'etiqueta')} onClick={() => setVista('etiqueta')}>Ya aquí, esperando etiqueta ({sinEtiqueta.length})</button>
        <span style={{ flex: 1 }} />
        <button style={chip(agrupar)} onClick={() => setAgrupar(a => !a)}>{agrupar ? 'Agrupado por tienda' : 'Lista simple'}</button>
      </div>

      {cargando && <div style={{ marginTop: 20, color: 'var(--w40)' }}>Cargando…</div>}
      {!cargando && lista.length === 0 && (
        <div style={{ marginTop: 20, color: 'var(--w50)', fontSize: 14.5 }}>
          {vista === 'por_comprar' ? 'No hay nada por comprar. Las ventas nuevas aparecen aquí solas.' : vista === 'comprados' ? 'No hay compras en camino.' : 'No hay productos esperando etiqueta.'}
        </div>
      )}

      {grupos.map(g => (
        <div key={g.nombre || 'todas'} style={{ marginTop: 18, border: '1px solid var(--w10)', borderRadius: 14, overflow: 'hidden', background: 'var(--w04)' }}>
          {g.nombre && (
            <div style={{ padding: '10px 16px', background: 'var(--w05)', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{g.nombre}</div>
              <div style={{ fontSize: 13, color: 'var(--w50)', fontWeight: 700 }}>
                {g.filas.length} {g.filas.length === 1 ? 'producto' : 'productos'}
                {(() => { const t = g.filas.reduce((s, f) => s + (Number(f.ficha?.costo_usd ?? f.costo_catalogo_usd ?? 0) * f.cantidad), 0); return t ? ` · costo estimado ${usd(t)}` : '' })()}
              </div>
            </div>
          )}
          {g.filas.map(f => (
            <div key={f.id} style={{ padding: '14px 16px', borderTop: '1px solid var(--w10)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
              {f.miniatura
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={grande(f.miniatura)} alt="" width={56} height={56} style={{ borderRadius: 10, objectFit: 'cover', flex: 'none' }} />
                : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--w10)', flex: 'none' }} />}
              <div style={{ flex: '2 1 280px', minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {f.titulo}
                  {f.urgente && <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--rojo)', background: 'rgba(185,28,28,0.1)', borderRadius: 999, padding: '2px 10px' }}>Urgente</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--w50)', marginTop: 3 }}>
                  Cantidad <b style={{ color: 'var(--tinta)' }}>{f.cantidad}</b> · Venta #{f.pack_id || f.order_id} · {fechaHora(f.fecha_venta)}
                  {f.estado === 'comprado' && f.comprado_en ? ` · Comprado ${fechaHora(f.comprado_en)}` : ''}
                </div>
                {(() => {
                  const pz = plazo(f.limite)
                  if (!pz) return null
                  const c = COLOR_PLAZO[pz.color]
                  return (
                    <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: c.c, background: c.bg, borderRadius: 999, padding: '3px 12px' }}>{pz.texto}</span>
                      <span style={{ fontSize: 12, color: 'var(--w40)' }}>{f.limite.origen === 'mercadolibre' ? 'fecha de MercadoLibre' : `${f.dias_prometidos} días de tu publicación`}</span>
                    </div>
                  )
                })()}
                <div style={{ fontSize: 13, color: 'var(--w50)', marginTop: 3 }}>
                  Costo {f.ficha?.costo_usd != null ? usd(f.ficha.costo_usd) : (f.costo_catalogo_usd != null ? `${usd(f.costo_catalogo_usd)} (catálogo)` : 'sin capturar')}
                  {f.ficha?.enlace_compra && <> · <a href={f.ficha.enlace_compra} target="_blank" rel="noreferrer" style={{ color: '#466D9B', fontWeight: 700 }}>Abrir enlace de compra ↗</a></>}
                </div>
                {f.esperando_etiqueta && (
                  <div style={{ marginTop: 8, background: 'rgba(181,137,0,0.14)', border: '1.5px solid #B58900', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.5 }}>
                    MercadoLibre todavía no libera la etiqueta{f.limite ? ` (la entrega el ${new Date(`${f.limite.dia}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })})` : ''}.
                    Como ya tienes el producto, entra a MercadoLibre, busca esta venta y toca <b>«Ya tengo el producto»</b>. En cuanto MercadoLibre libere la etiqueta, el paquete pasa solo a «Empacar ahora» del colaborador.
                    <div style={{ marginTop: 6 }}>
                      <a href="https://www.mercadolibre.com.mx/ventas/omni/listado?filters=shipping_upcoming" target="_blank" rel="noreferrer" style={{ color: '#466D9B', fontWeight: 800 }}>Abrir mis ventas en MercadoLibre ↗</a>
                      <span style={{ color: 'var(--w50)' }}> · envío #{f.shipment_id}</span>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 8 }}><Ficha key={`${f.id}-${f.ficha?.actualizada || ''}-${f.ficha?.tienda || ''}-${f.ficha?.costo_usd || ''}`} fila={f} alGuardar={cargar} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.estado === 'por_comprar' && (
                  <button style={botonAzul(ocupado)} disabled={ocupado} onClick={() => cambiar('comprado', [f.id])}>Ya la compré</button>
                )}
                {f.estado === 'comprado' && (
                  <>
                    <button style={botonAzul(ocupado)} disabled={ocupado} onClick={() => cambiar('llego', [f.id])}>Ya llegó a Hermosillo</button>
                    <button style={botonSuave} disabled={ocupado} onClick={() => cambiar('deshacer_comprado', [f.id])}>Deshacer</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
