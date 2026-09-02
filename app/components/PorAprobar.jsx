'use client'
// "Por aprobar": borradores de venta que llegaron por WhatsApp (ver
// claude/ventas-whatsapp-preaprobacion-diseno.md en el proyecto "Sitio web
// Denog" para el diseño completo). Nunca se registra una venta real desde
// acá sola — siempre hay una persona que revisa, corrige si hace falta, y
// aprueba o descarta.
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { clay, status } from '@/lib/theme/colors'

const fmt = n => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })

const inp = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' }
const inpFocus = { borderColor: clay[500] }
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--w50)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

const fmtEntrega = e => {
  const d = new Date(e.fecha_entrega + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${e.nota ? ` · ${e.nota}` : ''}`
}

const fmtFechaCorta = iso => {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
}

// Mismas tiendas que "Captura en lote" (lote/page.js) — lugar_compra es un
// campo de texto libre, no hay tabla de tiendas en la base. "agregar nueva"
// solo la suma a esta lista en memoria para esta sesión de revisión.
const LUGARES_BASE = ['Ross', 'TJ Maxx', 'Marshalls', 'Target', 'Walmart', 'Costco', 'Old Navy', 'Amazon', 'Burlington']
const NUEVA_TIENDA = '__nueva__'

// Campo con borde clay al enfocar — mismo <input>/<select>/<textarea> de
// siempre, solo con un toque visual que ayuda a ubicar rápido qué campo
// se está editando en una pantalla con varias tarjetas seguidas.
function Campo({ as: Tag = 'input', style, ...props }) {
  const [foco, setFoco] = useState(false)
  return <Tag {...props} style={{ ...inp, ...(foco ? inpFocus : null), ...style }}
    onFocus={e => { setFoco(true); props.onFocus?.(e) }}
    onBlur={e => { setFoco(false); props.onBlur?.(e) }} />
}

export default function PorAprobar({ embebido = false }) {
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensajes, setMensajes] = useState({}) // { [id]: texto }
  const [busquedas, setBusquedas] = useState({}) // { [id]: texto de búsqueda de cliente }
  const [altaClienteAbierta, setAltaClienteAbierta] = useState({}) // { [id]: bool }
  const [altaClienteForm, setAltaClienteForm] = useState({}) // { [id]: {nombre, telefono} }
  const [fotoModal, setFotoModal] = useState(null) // { url, descripcion } — lightbox, mismo patrón que empacado
  const [lugares, setLugares] = useState(LUGARES_BASE)
  const [agregandoTienda, setAgregandoTienda] = useState(false)
  const [tiendaNueva, setTiendaNueva] = useState('')

  // Tipo de cambio, impuesto, tienda, fecha de compra y entrega son datos del
  // DÍA/sesión de revisión, no de cada venta individual — mismo patrón que
  // "Captura en lote" (lote/page.js): se configuran una sola vez arriba y
  // aplican a todo lo que se apruebe en esta pasada. Si un día se revisan
  // ventas de San Diego y otro de Arizona, se ajusta este panel entre una
  // tanda y otra — igual si Eduardo está aprobando hoy compras de ayer.
  const [config, setConfig] = useState({ tipo_cambio: '', impuesto_pct: '8.6', lugar_compra: 'Ross', entrega_id: '', fecha_compra: new Date().toISOString().slice(0, 10) })

  const agregarTienda = () => {
    const nombre = tiendaNueva.trim()
    if (!nombre) return
    if (!lugares.includes(nombre)) setLugares(prev => [nombre, ...prev])
    setConfig(c => ({ ...c, lugar_compra: nombre }))
    setTiendaNueva('')
    setAgregandoTienda(false)
  }

  const cargar = async () => {
    setCargando(true)
    const [r, c, e] = await Promise.all([
      fetch('/api/reportes/pedidos?pendiente_aprobacion=true').then(r => r.json()),
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/entregas').then(r => r.json()),
    ])
    if (r.ok) setPedidos(r.pedidos.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en)))
    if (c.ok) setClientes(c.clientes.filter(x => x.rol === 'cliente'))
    if (e.ok) setEntregas(e.entregas || [])
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  const actualizarCampo = (id, campo, valor) => {
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, [campo]: valor } : p))
  }

  const calcular = p => {
    const usd = parseFloat(p.precio_usd) || 0
    const tc = parseFloat(config.tipo_cambio) || 0
    const imp = parseFloat(config.impuesto_pct) || 0
    const cant = parseFloat(p.cantidad) || 1
    const venta = parseFloat(p.precio_venta) || 0
    const costo_mxn = usd > 0 && tc > 0 ? usd * (1 + imp / 100) * tc * cant : null
    const utilidad = costo_mxn != null && venta > 0 ? (venta * cant) - costo_mxn : null
    return { costo_mxn, utilidad }
  }

  // Qué tan "lista" está una tarjeta para aprobarse — puramente visual,
  // no bloquea nada (eso lo sigue haciendo guardar()). Ayuda a escanear
  // rápido cuáles necesitan atención antes de llegar a esa tarjeta.
  const faltantes = p => {
    const f = []
    if (!p.cliente_id) f.push('cliente')
    if (!p.precio_venta) f.push('venta MXN')
    if (!p.precio_usd) f.push('costo USD')
    return f
  }

  const guardar = async (p, { pendiente_aprobacion, estado }) => {
    // Aprobar es lo único que de verdad registra la venta — ahí sí exigimos
    // tipo de cambio y entrega, igual que "Captura en lote". Editar/Descartar
    // no lo necesitan: pueden pasar antes de decidir esos datos del día.
    if (!pendiente_aprobacion) {
      if (!config.tipo_cambio) { alert('Ingresa el tipo de cambio del día antes de aprobar.'); return }
      if (!config.entrega_id) { alert('Selecciona la entrega antes de aprobar.'); return }
    }
    setGuardandoId(p.id)
    const { costo_mxn, utilidad } = calcular(p)
    const body = {
      id: p.id,
      cliente_id: p.cliente_id || null,
      entrega_id: config.entrega_id || null,
      descripcion: p.descripcion,
      lugar_compra: config.lugar_compra || null,
      cantidad: parseFloat(p.cantidad) || 1,
      fecha_compra: config.fecha_compra || new Date().toISOString().slice(0, 10),
      precio_usd: p.precio_usd === '' ? null : parseFloat(p.precio_usd),
      tipo_cambio: config.tipo_cambio === '' ? null : parseFloat(config.tipo_cambio),
      impuesto_pct: config.impuesto_pct === '' ? null : parseFloat(config.impuesto_pct),
      costo_mxn,
      precio_venta: p.precio_venta === '' ? null : parseFloat(p.precio_venta),
      utilidad,
      notas: p.notas || null,
      estado: estado || p.estado || 'comprado',
      vendedor_id: p.vendedor_id || null,
      categoria: p.categoria || null,
      apartado_fragil: !!p.apartado_fragil,
      imagen_url: p.imagen_url || null, // ruta original, nunca la firmada
      tipo_empaque: p.tipo_empaque || null,
      pendiente_aprobacion,
    }
    try {
      const res = await fetch('/api/pedidos/actualizar-pedido', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(r => r.json())
      if (res.ok) {
        setMensajes(m => ({ ...m, [p.id]: pendiente_aprobacion ? 'Cambios guardados.' : 'Aprobado — ya es una venta registrada.' }))
        setPedidos(prev => pendiente_aprobacion ? prev : prev.filter(x => x.id !== p.id))
      } else {
        setMensajes(m => ({ ...m, [p.id]: 'Error: ' + res.mensaje }))
      }
    } catch (err) {
      setMensajes(m => ({ ...m, [p.id]: 'Error: ' + err.message }))
    }
    setGuardandoId(null)
  }

  const aprobar = p => guardar(p, { pendiente_aprobacion: false, estado: 'comprado' })
  const editar = p => guardar(p, { pendiente_aprobacion: true })
  const descartar = p => {
    if (!confirm('¿Descartar este registro? No se borra — queda marcado como descartado y desaparece de esta lista.')) return
    guardar(p, { pendiente_aprobacion: true, estado: 'descartado' })
      .then(() => setPedidos(prev => prev.filter(x => x.id !== p.id)))
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--w50)', padding: 32, fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
        Cargando…
      </div>
    )
  }

  const listas = pedidos.filter(p => faltantes(p).length === 0).length

  return (
    <div style={{ minHeight: embebido ? 0 : '100vh', background: embebido ? 'transparent' : 'var(--fondo)', color: 'var(--tinta)' }}>
      {/* Barra superior fija: volver, título y el panel "datos del día".
          Se queda visible al hacer scroll porque se usa en cada tarjeta —
          subirlo una vez arriba y olvidarlo es justo lo que ahorra tiempo. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--fondo)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--w08)', padding: '18px 24px 16px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          {!embebido && (
            <Link href="/admin/pedidos" style={{ color: 'var(--w45)', fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 10 }}>
              ← Volver a Pedidos
            </Link>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              {!embebido && <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Por aprobar</h1>}
              <p style={{ color: 'var(--w45)', fontSize: 13, margin: embebido ? 0 : '3px 0 0' }}>
                Ventas registradas por WhatsApp. Nada aquí es real todavía.
              </p>
            </div>
            {pedidos.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ background: status.info.bg, color: status.info.fg, fontSize: 12.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999 }}>
                  {pedidos.length} pendiente{pedidos.length === 1 ? '' : 's'}
                </span>
                {listas > 0 && (
                  <span style={{ background: status.success.bg, color: status.success.fg, fontSize: 12.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999 }}>
                    {listas} listo{listas === 1 ? '' : 's'} para aprobar
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--w04)', border: `1px solid ${clay[700]}55`, borderLeft: `3px solid ${clay[500]}`, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: clay[300], textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Datos del día — aplican a todo lo que apruebes en esta pasada
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12 }}>
              <div>
                <label style={lbl}>Tipo de cambio (USD → MXN)</label>
                <Campo type="number" step="0.01" placeholder="Ej: 17.50" value={config.tipo_cambio}
                  onChange={e => setConfig(c => ({ ...c, tipo_cambio: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Impuesto</label>
                <Campo as="select" value={config.impuesto_pct} onChange={e => setConfig(c => ({ ...c, impuesto_pct: e.target.value }))}>
                  <option value="8.6">Arizona 8.6%</option>
                  <option value="7.75">California 7.75%</option>
                </Campo>
              </div>
              <div>
                <label style={lbl}>Tienda</label>
                {agregandoTienda ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Campo autoFocus placeholder="Nombre de la tienda" value={tiendaNueva}
                      onChange={e => setTiendaNueva(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') agregarTienda(); if (e.key === 'Escape') { setAgregandoTienda(false); setTiendaNueva('') } }} />
                    <button onClick={agregarTienda}
                      style={{ background: clay[500], color: 'var(--tinta)', border: 'none', borderRadius: 8, padding: '0 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Agregar
                    </button>
                    <button onClick={() => { setAgregandoTienda(false); setTiendaNueva('') }}
                      style={{ background: 'var(--w08)', border: 'none', borderRadius: 8, color: 'var(--tinta)', padding: '0 10px', cursor: 'pointer' }}>✕</button>
                  </div>
                ) : (
                  <Campo as="select" value={config.lugar_compra}
                    onChange={e => e.target.value === NUEVA_TIENDA ? setAgregandoTienda(true) : setConfig(c => ({ ...c, lugar_compra: e.target.value }))}>
                    {lugares.map(l => <option key={l} value={l} style={{ background: 'var(--sup)' }}>{l}</option>)}
                    <option value={NUEVA_TIENDA} style={{ background: 'var(--sup)' }}>+ Agregar tienda nueva…</option>
                  </Campo>
                )}
              </div>
              <div>
                <label style={lbl}>Fecha de compra</label>
                <Campo type="date" value={config.fecha_compra}
                  onChange={e => setConfig(c => ({ ...c, fecha_compra: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Entrega</label>
                <Campo as="select" value={config.entrega_id} onChange={e => setConfig(c => ({ ...c, entrega_id: e.target.value }))}>
                  <option value="">— Selecciona la fecha de entrega —</option>
                  {entregas.filter(e => e.estado === 'futura').map(e => (
                    <option key={e.id} value={e.id} style={{ background: 'var(--sup)' }}>{fmtEntrega(e)}</option>
                  ))}
                </Campo>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 24px 48px' }}>
        {pedidos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--w40)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 15 }}>No hay nada pendiente de aprobar.</div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {pedidos.map(p => {
            const { costo_mxn, utilidad } = calcular(p)
            const busq = busquedas[p.id] ?? (clientes.find(c => c.id === p.cliente_id)?.nombre || '')
            const sugerencias = !p.cliente_id && busq.trim()
              ? clientes.filter(c => c.nombre?.toLowerCase().includes(busq.trim().toLowerCase())).slice(0, 6)
              : []
            const altaAbierta = !!altaClienteAbierta[p.id]
            const altaForm = altaClienteForm[p.id] || { nombre: '', telefono: '' }
            const pendientes = faltantes(p)
            const lista = pendientes.length === 0

            const crearClienteInline = async () => {
              if (!altaForm.nombre || !altaForm.telefono) return
              const res = await fetch('/api/clientes/crear', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nombre: altaForm.nombre, telefono: altaForm.telefono,
                  usuario: altaForm.telefono, password: altaForm.telefono,
                  limite_credito: 0, requiere_anticipo: false,
                })
              }).then(r => r.json())
              if (res.ok) {
                setClientes(prev => [...prev, res.cliente])
                actualizarCampo(p.id, 'cliente_id', res.cliente.id)
                setBusquedas(b => ({ ...b, [p.id]: res.cliente.nombre }))
                setAltaClienteAbierta(a => ({ ...a, [p.id]: false }))
              } else alert('Error al crear cliente: ' + res.mensaje)
            }

            return (
              <div key={p.id} style={{
                background: 'var(--w04)',
                border: `1px solid ${lista ? status.success.fg + '40' : 'var(--w10)'}`,
                borderRadius: 16, padding: 16, display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16,
                position: 'relative',
              }}>
                <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {lista ? (
                    <span style={{ background: status.success.bg, color: status.success.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>
                      ✓ Listo
                    </span>
                  ) : (
                    <span style={{ background: status.warning.bg, color: status.warning.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} title={`Falta: ${pendientes.join(', ')}`}>
                      Falta {pendientes.join(' · ')}
                    </span>
                  )}
                </div>

                <div>
                  {p.imagen_url_firmada ? (
                    <div onClick={() => setFotoModal({ url: p.imagen_url_firmada, descripcion: p.descripcion })}
                      style={{ position: 'relative', cursor: 'zoom-in', borderRadius: 10, overflow: 'hidden' }}>
                      <img src={p.imagen_url_firmada} alt="Producto"
                        style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block', border: '1px solid var(--w10)' }} />
                      <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '2px 5px', fontSize: 11 }}>🔍</div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: 150, borderRadius: 10, border: '1px dashed var(--w20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--w40)', textAlign: 'center', padding: 8 }}>
                      sin foto
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--w35)', marginTop: 6 }}>
                    {fmtFechaCorta(p.creado_en)}
                  </div>
                </div>

                <div style={{ paddingRight: 70 }}>
                  <Campo as="textarea" value={p.descripcion || ''} onChange={e => actualizarCampo(p.id, 'descripcion', e.target.value)}
                    style={{ marginBottom: 10, minHeight: 40, resize: 'vertical', fontWeight: 600 }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>Cliente</label>
                      {p.cliente_id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Campo value={busq} disabled />
                          <button onClick={() => { actualizarCampo(p.id, 'cliente_id', null); setBusquedas(b => ({ ...b, [p.id]: '' })) }}
                            style={{ background: 'var(--w08)', border: 'none', borderRadius: 8, color: 'var(--tinta)', padding: '0 10px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <>
                          <Campo placeholder="Buscar cliente…" value={busq}
                            onChange={e => setBusquedas(b => ({ ...b, [p.id]: e.target.value }))} />
                          {sugerencias.length > 0 && (
                            <div style={{ marginTop: 4, background: 'var(--sup-2)', border: '1px solid var(--w10)', borderRadius: 8, overflow: 'hidden' }}>
                              {sugerencias.map(c => (
                                <div key={c.id} onClick={() => { actualizarCampo(p.id, 'cliente_id', c.id); setBusquedas(b => ({ ...b, [p.id]: c.nombre })) }}
                                  style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer' }}
                                  onMouseDown={e => e.preventDefault()}>
                                  {c.nombre} · {c.telefono}
                                </div>
                              ))}
                            </div>
                          )}
                          {!altaAbierta ? (
                            <button onClick={() => setAltaClienteAbierta(a => ({ ...a, [p.id]: true }))}
                              style={{ fontSize: 12, color: clay[300], background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                              + cliente nuevo
                            </button>
                          ) : (
                            <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                              <Campo placeholder="Nombre" value={altaForm.nombre}
                                onChange={e => setAltaClienteForm(f => ({ ...f, [p.id]: { ...altaForm, nombre: e.target.value } }))} />
                              <Campo placeholder="Teléfono (10 dígitos)" value={altaForm.telefono}
                                onChange={e => setAltaClienteForm(f => ({ ...f, [p.id]: { ...altaForm, telefono: e.target.value } }))} />
                              <button onClick={crearClienteInline}
                                style={{ background: clay[500], color: 'var(--tinta)', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                Crear y asignar
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {p.notas && !p.cliente_id && (
                        <div style={{ fontSize: 11.5, color: status.warning.fg, marginTop: 6 }}>⚠️ {p.notas}</div>
                      )}
                    </div>

                    <div>
                      <label style={lbl}>Piezas</label>
                      <Campo type="number" value={p.cantidad ?? 1} onChange={e => actualizarCampo(p.id, 'cantidad', e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>Venta (MXN)</label>
                      <Campo type="number" value={p.precio_venta ?? ''} onChange={e => actualizarCampo(p.id, 'precio_venta', e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Costo (USD)</label>
                      <Campo type="number" value={p.precio_usd ?? ''} onChange={e => actualizarCampo(p.id, 'precio_usd', e.target.value)} />
                    </div>
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--w55)', marginBottom: 12 }}>
                    Costo total: ${costo_mxn != null ? fmt(costo_mxn) : '—'} MXN
                    {utilidad != null && <> · Utilidad: <span style={{ color: utilidad >= 0 ? status.success.fg : status.danger.fg, fontWeight: 700 }}>${fmt(utilidad)} MXN</span></>}
                    {!config.tipo_cambio && <span style={{ color: status.warning.fg }}> · falta el tipo de cambio del día (arriba)</span>}
                  </div>

                  {mensajes[p.id] && (
                    <div style={{ fontSize: 12.5, color: mensajes[p.id].startsWith('Error') ? status.danger.fg : status.success.fg, marginBottom: 8, fontWeight: 600 }}>
                      {mensajes[p.id]}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={guardandoId === p.id} onClick={() => aprobar(p)}
                      style={{ background: status.success.fg, color: '#052e1f', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1 }}>
                      ✅ Aprobar
                    </button>
                    <button disabled={guardandoId === p.id} onClick={() => editar(p)}
                      style={{ background: 'var(--w10)', color: 'var(--tinta)', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1 }}>
                      Guardar
                    </button>
                    <button disabled={guardandoId === p.id} onClick={() => descartar(p)}
                      style={{ background: status.danger.bg, color: status.danger.fg, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1, marginLeft: 'auto' }}>
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lightbox — mismo patrón que app/admin/empacado/page.js */}
      {fotoModal && (
        <div onClick={() => setFotoModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <div style={{ fontSize: 13, color: 'var(--w60)', marginBottom: 14, textAlign: 'center', maxWidth: 500 }}>{fotoModal.descripcion}</div>
          <img src={fotoModal.url} alt={fotoModal.descripcion}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }} />
          <button onClick={() => setFotoModal(null)}
            style={{ marginTop: 20, background: 'var(--w10)', color: 'var(--tinta)', border: '1px solid var(--w20)', borderRadius: 10, padding: '10px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
