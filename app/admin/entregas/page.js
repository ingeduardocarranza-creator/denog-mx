'use client'
import { useState, useEffect } from 'react'

export default function Entregas() {
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ fecha_entrega: '', nota: '' })
  const [msg, setMsg] = useState('')
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({ fecha_entrega: '', nota: '' })
  const [editMsg, setEditMsg] = useState('')
  const [guardandoEdit, setGuardandoEdit] = useState(false)

  // Pedidos por entrega
  const [pedidosPanel, setPedidosPanel] = useState({})
  const [panelAbierto, setPanelAbierto] = useState({})
  const [clientesOpts, setClientesOpts] = useState([])
  const [vendedoresOpts, setVendedoresOpts] = useState([])
  const [editandoPedido, setEditandoPedido] = useState(null)
  const [editFormPedido, setEditFormPedido] = useState({})
  const [guardandoPedido, setGuardandoPedido] = useState(false)
  const [pedidoMsg, setPedidoMsg] = useState('')

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => {
      if (d.ok) {
        setClientesOpts(d.clientes)
        setVendedoresOpts(d.clientes.filter(c => c.rol === 'admin' || c.rol === 'vendedor'))
      }
    })
  }, [])

  const cargar = async () => {
    setCargando(true)
    const res = await fetch('/api/entregas')
    const data = await res.json()
    if (data.ok) setEntregas(data.entregas.sort((a, b) => new Date(b.fecha_entrega) - new Date(a.fecha_entrega)))
    setCargando(false)
  }

  const crear = async () => {
    if (!form.fecha_entrega) { setMsg('La fecha es obligatoria'); return }
    const res = await fetch('/api/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_entrega: form.fecha_entrega, nota: form.nota })
    })
    const data = await res.json()
    if (data.ok) {
      setMsg('✓ Entrega creada')
      setForm({ fecha_entrega: '', nota: '' })
      setMostrarForm(false)
      cargar()
    } else {
      setMsg(data.mensaje || 'Error')
    }
  }

  const abrirEdicion = (e) => {
    setEditando(e.id)
    setEditForm({ fecha_entrega: e.fecha_entrega, nota: e.nota || '' })
    setEditMsg('')
  }

  const cancelarEdicion = () => {
    setEditando(null)
    setEditMsg('')
  }

  const actualizar = async (id) => {
    if (!editForm.fecha_entrega) { setEditMsg('La fecha es obligatoria'); return }
    setGuardandoEdit(true)
    const res = await fetch('/api/entregas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fecha_entrega: editForm.fecha_entrega, nota: editForm.nota })
    })
    const data = await res.json()
    setGuardandoEdit(false)
    if (data.ok) {
      setEditando(null)
      cargar()
    } else {
      setEditMsg(data.mensaje || 'Error al guardar')
    }
  }

  const cambiarEstado = async (id, estado) => {
    await fetch('/api/admin/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargar()
  }

  // ─── Pedidos ───────────────────────────────────────────────
  const togglePedidos = async (entregaId) => {
    const abriendo = !panelAbierto[entregaId]
    setPanelAbierto(prev => ({ ...prev, [entregaId]: abriendo }))
    if (abriendo && !pedidosPanel[entregaId]) {
      const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}`)
      const data = await res.json()
      if (data.ok) setPedidosPanel(prev => ({ ...prev, [entregaId]: data.pedidos || [] }))
    }
  }

  const recargarPedidos = async (entregaId) => {
    const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}`)
    const data = await res.json()
    if (data.ok) setPedidosPanel(prev => ({ ...prev, [entregaId]: data.pedidos || [] }))
  }

  const abrirEditarPedido = (p) => {
    setEditandoPedido(p.id)
    setEditFormPedido({
      cliente_id: p.cliente_id || '',
      entrega_id: p.entrega_id || '',
      descripcion: p.descripcion || '',
      lugar_compra: p.lugar_compra || '',
      cantidad: p.cantidad ?? 1,
      fecha_compra: p.fecha_compra || '',
      precio_usd: p.precio_usd ?? '',
      tipo_cambio: p.tipo_cambio ?? '',
      impuesto_pct: p.impuesto_pct ?? '',
      costo_mxn: p.costo_mxn ?? '',
      precio_venta: p.precio_venta ?? '',
      utilidad: p.utilidad ?? '',
      notas: p.notas || '',
      estado: p.estado || '',
      vendedor_id: p.vendedor_id || '',
    })
    setPedidoMsg('')
  }

  const guardarPedidoEdit = async () => {
    setGuardandoPedido(true)
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editandoPedido, ...editFormPedido })
    })
    const data = await res.json()
    setGuardandoPedido(false)
    if (data.ok) {
      const entregaId = editFormPedido.entrega_id
      setEditandoPedido(null)
      await recargarPedidos(entregaId)
    } else {
      setPedidoMsg(data.mensaje || 'Error al guardar')
    }
  }

  const eliminarPedido = async (pedidoId, entregaId) => {
    if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pedidoId })
    })
    const data = await res.json()
    if (data.ok) await recargarPedidos(entregaId)
  }

  const agruparPorFecha = (pedidos) => {
    const grupos = {}
    pedidos.forEach(p => {
      const fecha = p.creado_en ? p.creado_en.split('T')[0] : 'Sin fecha'
      if (!grupos[fecha]) grupos[fecha] = []
      grupos[fecha].push(p)
    })
    return Object.entries(grupos).sort((a, b) => b[0].localeCompare(a[0]))
  }

  // ────────────────────────────────────────────────────────────

  const estados = [
    { valor: 'futura', label: '🔵 Futura', color: '#818cf8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.2)' },
    { valor: 'en_tienda', label: '✅ En tienda', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)' },
  ]

  const getEstado = (valor) => estados.find(e => e.valor === valor) || estados[0]

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>📅 Entregas</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>
              {entregas.length} entregas registradas
            </div>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)}
            style={{ background: '#6366f1', border: 'none', borderRadius: 12, padding: '10px 18px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nueva entrega
          </button>
        </div>

        {/* Formulario nueva entrega */}
        {mostrarForm && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 20, marginBottom: 20 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nueva fecha de entrega</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Fecha de entrega</label>
                <input type="date" value={form.fecha_entrega} onChange={e => setForm({ ...form, fecha_entrega: e.target.value })}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Nota opcional</label>
                <input type="text" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })}
                  placeholder="Ej: Viaje Arizona mayo"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            {msg && <div style={{ color: msg.includes('✓') ? '#4ade80' : '#f87171', fontSize: 12, marginBottom: 10 }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={crear}
                style={{ background: '#6366f1', border: 'none', borderRadius: 10, padding: '10px 20px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Guardar entrega
              </button>
              <button onClick={() => { setMostrarForm(false); setMsg('') }}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 20px', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de entregas */}
        {cargando ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40 }}>Cargando...</div>
        ) : entregas.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            No hay entregas registradas. Crea la primera.
          </div>
        ) : (
          entregas.map(e => {
            const est = getEstado(e.estado)
            const pedidos = pedidosPanel[e.id] || []
            const grupos = agruparPorFecha(pedidos)
            return (
              <div key={e.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${est.border}`, borderRadius: 18, padding: 18, marginBottom: 12 }}>

                {/* Cabecera entrega */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>📅 {e.fecha_entrega}</div>
                    {e.nota && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{e.nota}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => abrirEdicion(e)}
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '5px 12px', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      ✏️ Editar
                    </button>
                    <span style={{ background: est.bg, border: `1px solid ${est.border}`, borderRadius: 20, padding: '4px 12px', color: est.color, fontSize: 11, fontWeight: 600 }}>
                      {est.label}
                    </span>
                  </div>
                </div>

                {/* Panel edición entrega */}
                {editando === e.id && (
                  <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Editar entrega</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Fecha de entrega</label>
                        <input type="date" value={editForm.fecha_entrega} onChange={ev => setEditForm({ ...editForm, fecha_entrega: ev.target.value })}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Nota</label>
                        <input type="text" value={editForm.nota} onChange={ev => setEditForm({ ...editForm, nota: ev.target.value })}
                          placeholder="Ej: Viaje Arizona mayo"
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    {editMsg && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{editMsg}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => actualizar(e.id)} disabled={guardandoEdit}
                        style={{ background: '#6366f1', border: 'none', borderRadius: 8, padding: '8px 18px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: guardandoEdit ? 0.6 : 1 }}>
                        {guardandoEdit ? 'Guardando...' : '✓ Guardar'}
                      </button>
                      <button onClick={cancelarEdicion}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 18px', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Cambiar estado */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cambiar estado</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {estados.map(est => (
                      <button key={est.valor} onClick={() => cambiarEstado(e.id, est.valor)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${e.estado === est.valor ? est.border : 'rgba(255,255,255,0.08)'}`, background: e.estado === est.valor ? est.bg : 'rgba(255,255,255,0.03)', color: e.estado === est.valor ? est.color : 'rgba(255,255,255,0.35)', fontSize: 11, cursor: 'pointer', fontWeight: e.estado === est.valor ? 600 : 400 }}>
                        {est.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accesos rápidos */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => window.location.href = `/admin/pedidos`}
                    style={{ flex: 1, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '8px', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    📝 Capturar pedidos
                  </button>
                  <button onClick={() => window.location.href = `/admin/reportes`}
                    style={{ flex: 1, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '8px', color: '#10b981', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    📊 Ver reporte
                  </button>
                  <button onClick={() => togglePedidos(e.id)}
                    style={{ flex: 1, background: panelAbierto[e.id] ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${panelAbierto[e.id] ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '8px', color: panelAbierto[e.id] ? '#f59e0b' : 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {panelAbierto[e.id] ? '🔼 Ocultar pedidos' : '📋 Ver pedidos'}
                  </button>
                </div>

                {/* Panel de pedidos */}
                {panelAbierto[e.id] && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 }}>
                    {!pedidosPanel[e.id] ? (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 16 }}>Cargando pedidos...</div>
                    ) : pedidos.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 16 }}>Sin pedidos en esta entrega</div>
                    ) : (
                      grupos.map(([fecha, peds]) => (
                        <div key={fecha} style={{ marginBottom: 16 }}>
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                            Capturados el {fecha}
                          </div>
                          {peds.map(p => (
                            <div key={p.id} style={{ marginBottom: 8 }}>
                              {/* Fila resumen pedido */}
                              {editandoPedido !== p.id && (
                                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{p.descripcion}</div>
                                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>
                                        {p.clientes?.nombre || '—'} · {p.cantidad || 1} pza
                                        {p.lugar_compra && ` · ${p.lugar_compra}`}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                      <button onClick={() => abrirEditarPedido(p)}
                                        style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '4px 10px', color: '#818cf8', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        ✏️ Editar
                                      </button>
                                      <button onClick={() => eliminarPedido(p.id, e.id)}
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', color: '#f87171', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {p.precio_usd != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>USD <span style={{ color: '#f59e0b' }}>${p.precio_usd}</span></span>}
                                    {p.tipo_cambio != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>TC <span style={{ color: 'white' }}>{p.tipo_cambio}</span></span>}
                                    {p.impuesto_pct != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Tax <span style={{ color: 'white' }}>{p.impuesto_pct}%</span></span>}
                                    {p.costo_mxn != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Costo <span style={{ color: 'white' }}>{fmt(p.costo_mxn)}</span></span>}
                                    {p.precio_venta != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Venta <span style={{ color: '#4ade80', fontWeight: 700 }}>{fmt(p.precio_venta)}</span></span>}
                                    {p.utilidad != null && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Util. <span style={{ color: p.utilidad >= 0 ? '#4ade80' : '#f87171' }}>{fmt(p.utilidad)}</span></span>}
                                    {p.estado && <span style={{ background: p.estado === 'Entregado' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 6px', color: p.estado === 'Entregado' ? '#10b981' : 'rgba(255,255,255,0.45)', fontSize: 10 }}>{p.estado}</span>}
                                  </div>
                                  {p.notas && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>📝 {p.notas}</div>}
                                </div>
                              )}

                              {/* Formulario edición inline pedido */}
                              {editandoPedido === p.id && (
                                <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 14 }}>
                                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Editar pedido</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <div>
                                      <label style={labelStyle}>Cliente</label>
                                      <select value={editFormPedido.cliente_id} onChange={ev => setEditFormPedido({ ...editFormPedido, cliente_id: ev.target.value })} style={inputStyle}>
                                        <option value="">— seleccionar —</option>
                                        {clientesOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Entrega</label>
                                      <select value={editFormPedido.entrega_id} onChange={ev => setEditFormPedido({ ...editFormPedido, entrega_id: ev.target.value })} style={inputStyle}>
                                        <option value="">— seleccionar —</option>
                                        {entregas.map(en => <option key={en.id} value={en.id}>{en.fecha_entrega}{en.nota ? ` · ${en.nota}` : ''}</option>)}
                                      </select>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <label style={labelStyle}>Descripción</label>
                                      <input type="text" value={editFormPedido.descripcion} onChange={ev => setEditFormPedido({ ...editFormPedido, descripcion: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Lugar de compra</label>
                                      <select value={editFormPedido.lugar_compra} onChange={ev => setEditFormPedido({ ...editFormPedido, lugar_compra: ev.target.value })} style={inputStyle}>
                                        {['Ross', 'Walmart', 'Target', 'Costco', 'Amazon', 'Burlington', 'TJ Maxx', 'Otro'].map(l => <option key={l} value={l}>{l}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Fecha de compra</label>
                                      <input type="date" value={editFormPedido.fecha_compra} onChange={ev => setEditFormPedido({ ...editFormPedido, fecha_compra: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Cantidad</label>
                                      <input type="number" value={editFormPedido.cantidad} onChange={ev => setEditFormPedido({ ...editFormPedido, cantidad: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Precio USD</label>
                                      <input type="number" step="0.01" value={editFormPedido.precio_usd} onChange={ev => setEditFormPedido({ ...editFormPedido, precio_usd: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Tipo de cambio</label>
                                      <input type="number" step="0.01" value={editFormPedido.tipo_cambio} onChange={ev => setEditFormPedido({ ...editFormPedido, tipo_cambio: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Impuesto %</label>
                                      <input type="number" step="0.01" value={editFormPedido.impuesto_pct} onChange={ev => setEditFormPedido({ ...editFormPedido, impuesto_pct: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Costo MXN</label>
                                      <input type="number" step="0.01" value={editFormPedido.costo_mxn} onChange={ev => setEditFormPedido({ ...editFormPedido, costo_mxn: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Precio de venta</label>
                                      <input type="number" step="0.01" value={editFormPedido.precio_venta} onChange={ev => setEditFormPedido({ ...editFormPedido, precio_venta: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Utilidad</label>
                                      <input type="number" step="0.01" value={editFormPedido.utilidad} onChange={ev => setEditFormPedido({ ...editFormPedido, utilidad: ev.target.value })} style={inputStyle} />
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Estado</label>
                                      <select value={editFormPedido.estado} onChange={ev => setEditFormPedido({ ...editFormPedido, estado: ev.target.value })} style={inputStyle}>
                                        {['Pendiente', 'En camino', 'En tienda', 'Entregado', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label style={labelStyle}>Vendedor</label>
                                      <select value={editFormPedido.vendedor_id} onChange={ev => setEditFormPedido({ ...editFormPedido, vendedor_id: ev.target.value })} style={inputStyle}>
                                        <option value="">— ninguno —</option>
                                        {vendedoresOpts.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                                      </select>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <label style={labelStyle}>Notas</label>
                                      <input type="text" value={editFormPedido.notas} onChange={ev => setEditFormPedido({ ...editFormPedido, notas: ev.target.value })} style={inputStyle} placeholder="Opcional" />
                                    </div>
                                  </div>
                                  {pedidoMsg && <div style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>{pedidoMsg}</div>}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={guardarPedidoEdit} disabled={guardandoPedido}
                                      style={{ background: '#6366f1', border: 'none', borderRadius: 8, padding: '7px 16px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: guardandoPedido ? 0.6 : 1 }}>
                                      {guardandoPedido ? 'Guardando...' : '✓ Guardar'}
                                    </button>
                                    <button onClick={() => setEditandoPedido(null)}
                                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
