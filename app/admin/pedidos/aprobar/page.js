'use client'
// "Por aprobar": borradores de venta que llegaron por WhatsApp (ver
// claude/ventas-whatsapp-preaprobacion-diseno.md en el proyecto "Sitio web
// Denog" para el diseño completo). Nunca se registra una venta real desde
// acá sola — siempre hay una persona que revisa, corrige si hace falta, y
// aprueba o descarta.
import { useState, useEffect } from 'react'
import Link from 'next/link'

const fmt = n => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inp = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

const fmtEntrega = e => {
  const d = new Date(e.fecha_entrega + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${e.nota ? ` · ${e.nota}` : ''}`
}

export default function PorAprobar() {
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensajes, setMensajes] = useState({}) // { [id]: texto }
  const [busquedas, setBusquedas] = useState({}) // { [id]: texto de búsqueda de cliente }
  const [altaClienteAbierta, setAltaClienteAbierta] = useState({}) // { [id]: bool }
  const [altaClienteForm, setAltaClienteForm] = useState({}) // { [id]: {nombre, telefono} }

  // Tipo de cambio, impuesto y entrega son datos del DÍA/sesión de revisión,
  // no de cada venta individual — mismo patrón que "Captura en lote"
  // (lote/page.js): se configuran una sola vez arriba y aplican a todo lo
  // que se apruebe en esta pasada. Si un día se revisan ventas de San Diego
  // y otro de Arizona, se ajusta este panel entre una tanda y otra.
  const [config, setConfig] = useState({ tipo_cambio: '', impuesto_pct: '8.6', entrega_id: '' })

  const cargar = async () => {
    setCargando(true)
    const [r, c, e] = await Promise.all([
      fetch('/api/reportes/pedidos?pendiente_aprobacion=true').then(r => r.json()),
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/entregas').then(r => r.json()),
    ])
    const hoy = new Date().toISOString().slice(0, 10)
    if (r.ok) setPedidos(r.pedidos
      .map(p => ({ ...p, fecha_compra: p.fecha_compra || hoy }))
      .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en)))
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
      lugar_compra: p.lugar_compra || null,
      cantidad: parseFloat(p.cantidad) || 1,
      fecha_compra: p.fecha_compra || new Date().toISOString().slice(0, 10),
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

  if (cargando) return <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: 32 }}>Cargando…</div>

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#fff', padding: '32px 24px', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      <Link href="/admin/pedidos" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>
        ← Volver a Pedidos
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Por aprobar — ventas registradas por WhatsApp</h1>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 20, maxWidth: 640 }}>
        Nada de aquí es una venta real todavía. Revisa los datos que extrajo la IA, corrígelos
        si hace falta, y aprueba — o descarta si no era nada.
      </p>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18, marginBottom: 28, maxWidth: 760 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
          Datos del día — aplican a todo lo que apruebes en esta pasada
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <div>
            <label style={lbl}>Tipo de cambio (USD → MXN)</label>
            <input style={inp} type="number" step="0.01" placeholder="Ej: 17.50" value={config.tipo_cambio}
              onChange={e => setConfig(c => ({ ...c, tipo_cambio: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Impuesto</label>
            <select style={inp} value={config.impuesto_pct} onChange={e => setConfig(c => ({ ...c, impuesto_pct: e.target.value }))}>
              <option value="8.6">Arizona 8.6%</option>
              <option value="7.75">California 7.75%</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Entrega</label>
            <select style={inp} value={config.entrega_id} onChange={e => setConfig(c => ({ ...c, entrega_id: e.target.value }))}>
              <option value="">— Selecciona la fecha de entrega —</option>
              {entregas.filter(e => e.estado === 'futura').map(e => (
                <option key={e.id} value={e.id} style={{ background: '#0f172a' }}>{fmtEntrega(e)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {pedidos.length === 0 && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>No hay nada pendiente de aprobar. 🎉</div>
      )}

      <div style={{ display: 'grid', gap: 18, maxWidth: 760 }}>
        {pedidos.map(p => {
          const { costo_mxn, utilidad } = calcular(p)
          const busq = busquedas[p.id] ?? (clientes.find(c => c.id === p.cliente_id)?.nombre || '')
          const sugerencias = !p.cliente_id && busq.trim()
            ? clientes.filter(c => c.nombre?.toLowerCase().includes(busq.trim().toLowerCase())).slice(0, 6)
            : []
          const altaAbierta = !!altaClienteAbierta[p.id]
          const altaForm = altaClienteForm[p.id] || { nombre: '', telefono: '' }

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
            <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18, display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16 }}>
              <div>
                {p.imagen_url_firmada ? (
                  <img src={p.imagen_url_firmada} alt="Producto" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }} />
                ) : (
                  <div style={{ width: '100%', height: 140, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 8 }}>
                    sin foto
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                  {new Date(p.creado_en).toLocaleString('es-MX')}
                </div>
              </div>

              <div>
                <label style={lbl}>Descripción</label>
                <textarea value={p.descripcion || ''} onChange={e => actualizarCampo(p.id, 'descripcion', e.target.value)}
                  style={{ ...inp, marginBottom: 10, minHeight: 44, resize: 'vertical' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={lbl}>Cliente</label>
                    {p.cliente_id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input style={inp} value={busq} disabled />
                        <button onClick={() => { actualizarCampo(p.id, 'cliente_id', null); setBusquedas(b => ({ ...b, [p.id]: '' })) }}
                          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: '#fff', padding: '0 10px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <>
                        <input style={inp} placeholder="Buscar cliente…" value={busq}
                          onChange={e => setBusquedas(b => ({ ...b, [p.id]: e.target.value }))} />
                        {sugerencias.length > 0 && (
                          <div style={{ marginTop: 4, background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                            {sugerencias.map(c => (
                              <div key={c.id} onClick={() => { actualizarCampo(p.id, 'cliente_id', c.id); setBusquedas(b => ({ ...b, [p.id]: c.nombre })) }}
                                style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
                                onMouseDown={e => e.preventDefault()}>
                                {c.nombre} · {c.telefono}
                              </div>
                            ))}
                          </div>
                        )}
                        {!altaAbierta ? (
                          <button onClick={() => setAltaClienteAbierta(a => ({ ...a, [p.id]: true }))}
                            style={{ fontSize: 12, color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
                            + cliente nuevo
                          </button>
                        ) : (
                          <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                            <input style={inp} placeholder="Nombre" value={altaForm.nombre}
                              onChange={e => setAltaClienteForm(f => ({ ...f, [p.id]: { ...altaForm, nombre: e.target.value } }))} />
                            <input style={inp} placeholder="Teléfono (10 dígitos)" value={altaForm.telefono}
                              onChange={e => setAltaClienteForm(f => ({ ...f, [p.id]: { ...altaForm, telefono: e.target.value } }))} />
                            <button onClick={crearClienteInline}
                              style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                              Crear y asignar
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {p.notas && !p.cliente_id && (
                      <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 6 }}>⚠️ {p.notas}</div>
                    )}
                  </div>

                  <div>
                    <label style={lbl}>Piezas</label>
                    <input type="number" style={inp} value={p.cantidad ?? 1} onChange={e => actualizarCampo(p.id, 'cantidad', e.target.value)} />
                  </div>

                  <div>
                    <label style={lbl}>Fecha de compra</label>
                    <input type="date" style={inp} value={p.fecha_compra || ''} onChange={e => actualizarCampo(p.id, 'fecha_compra', e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={lbl}>Venta (MXN)</label>
                    <input type="number" style={inp} value={p.precio_venta ?? ''} onChange={e => actualizarCampo(p.id, 'precio_venta', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Costo (USD)</label>
                    <input type="number" style={inp} value={p.precio_usd ?? ''} onChange={e => actualizarCampo(p.id, 'precio_usd', e.target.value)} />
                  </div>
                </div>

                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>
                  Costo total: ${costo_mxn != null ? fmt(costo_mxn) : '—'} MXN
                  {utilidad != null && <> · Utilidad: ${fmt(utilidad)} MXN</>}
                  {!config.tipo_cambio && <span style={{ color: '#f59e0b' }}> · falta el tipo de cambio del día (arriba)</span>}
                </div>

                {mensajes[p.id] && (
                  <div style={{ fontSize: 12.5, color: mensajes[p.id].startsWith('Error') ? '#f87171' : '#34d399', marginBottom: 8 }}>
                    {mensajes[p.id]}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={guardandoId === p.id} onClick={() => aprobar(p)}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1 }}>
                    ✅ Aprobar
                  </button>
                  <button disabled={guardandoId === p.id} onClick={() => editar(p)}
                    style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1 }}>
                    ✏️ Editar
                  </button>
                  <button disabled={guardandoId === p.id} onClick={() => descartar(p)}
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardandoId === p.id ? 0.6 : 1 }}>
                    🗑️ Descartar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
