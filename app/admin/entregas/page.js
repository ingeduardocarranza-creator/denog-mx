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
  const [entTaxTipo, setEntTaxTipo] = useState('arizona')
  const [entTaxDenogPct, setEntTaxDenogPct] = useState('')
  const [busquedaPedidos, setBusquedaPedidos] = useState({})

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

  // Abrir el cobro de una entrega es dinero: se confirma diciendo exactamente
  // cuánto se va a volver cobrable, no con un "¿estás seguro?" genérico.
  const cambiarEstado = async (id, estado) => {
    const entrega = entregas.find(x => x.id === id)
    if (!entrega || entrega.estado === estado) return

    let detalle = ''
    try {
      const r = await fetch(`/api/reportes/pedidos?entrega_id=${id}&fotos=no`).then(r => r.json())
      const peds = (r.ok ? r.pedidos : []) || []
      const vivos = peds.filter(p => !['Cancelado', 'no_llego'].includes(p.estado))
      const total = vivos.reduce((s, p) => s + (Number(p.precio_venta) || 0), 0)
      if (vivos.length > 0) {
        detalle = `\n\n${vivos.length} pedido${vivos.length !== 1 ? 's' : ''} por $${total.toLocaleString('es-MX')}.`
      }
    } catch { /* si falla el conteo, la confirmación sigue valiendo */ }

    const pregunta = estado === 'en_tienda'
      ? `¿La mercancía de la entrega del ${entrega.fecha_entrega} YA ESTÁ FÍSICAMENTE EN TIENDA?${detalle}\n\nAl aceptar, se vuelve cobrable en el punto de venta del admin y de los colaboradores.`
      : `¿Regresar la entrega del ${entrega.fecha_entrega} a EN PROCESO?${detalle}\n\nDeja de poder cobrarse en el punto de venta. Lo ya cobrado no se toca.`
    if (!confirm(pregunta)) return

    await fetch('/api/admin/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargar()
  }

  const eliminarEntrega = async (entregaId) => {
    if (!confirm('¿Estás seguro de eliminar esta entrega?')) return
    const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}&fotos=no`)
    const data = await res.json()
    const pedidosDe = data.ok ? (data.pedidos || []) : []
    if (pedidosDe.length > 0) {
      const elimTambien = confirm(`Esta entrega tiene ${pedidosDe.length} pedido${pedidosDe.length !== 1 ? 's' : ''}. ¿Deseas eliminar también los pedidos?\n\nOK = eliminar pedidos\nCancelar = dejar pedidos sin entrega`)
      if (elimTambien) {
        for (const p of pedidosDe) {
          await fetch('/api/pedidos/actualizar-pedido', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id })
          })
        }
      } else {
        for (const p of pedidosDe) {
          await fetch('/api/pedidos/actualizar-pedido', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, entrega_id: null })
          })
        }
      }
    }
    await fetch('/api/entregas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entregaId })
    })
    cargar()
  }

  // ─── Pedidos ───────────────────────────────────────────────
  const togglePedidos = async (entregaId) => {
    const abriendo = !panelAbierto[entregaId]
    setPanelAbierto(prev => ({ ...prev, [entregaId]: abriendo }))
    if (abriendo && !pedidosPanel[entregaId]) {
      const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}&fotos=no`)
      const data = await res.json()
      if (data.ok) setPedidosPanel(prev => ({ ...prev, [entregaId]: data.pedidos || [] }))
    }
  }

  const recargarPedidos = async (entregaId) => {
    const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}&fotos=no`)
    const data = await res.json()
    if (data.ok) setPedidosPanel(prev => ({ ...prev, [entregaId]: data.pedidos || [] }))
  }

  const abrirEditarPedido = (p) => {
    const imp = parseFloat(p.impuesto_pct) || 0
    const taxTipo = Math.abs(imp - 8.6) < 0.01 ? 'arizona' : Math.abs(imp - 7.75) < 0.01 ? 'california' : 'denog'
    setEntTaxTipo(taxTipo)
    setEntTaxDenogPct(taxTipo === 'denog' && imp > 0 ? String(imp) : '')
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
    if (!confirm('¿Eliminar este artículo? Esta acción no se puede deshacer.')) return
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

  // El estado de una entrega no es una etiqueta: es el interruptor que decide
  // si el punto de venta la puede cobrar. "En proceso" = la mercancía todavía
  // no llega, así que nadie —ni el admin ni el colaborador— puede liquidarla.
  const estados = [
    { valor: 'futura', label: '🕐 En proceso', corto: 'En proceso', color: 'var(--ambar-t)', bg: 'rgba(161,98,7,0.10)', border: 'rgba(161,98,7,0.28)',
      consecuencia: 'No aparece cobrable en el punto de venta. Los anticipos sí se siguen recibiendo con normalidad.' },
    { valor: 'en_tienda', label: '✅ En tienda', corto: 'En tienda', color: 'var(--verde)', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)',
      consecuencia: 'Se cobra normal en el punto de venta, tanto el tuyo como el del colaborador.' },
  ]

  const getEstado = (valor) => estados.find(e => e.valor === valor) || estados[0]

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

  const inputStyle = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 700 }}>📅 Entregas</div>
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 2 }}>
              {entregas.length} entregas registradas
            </div>
          </div>
          <button onClick={() => setMostrarForm(!mostrarForm)}
            style={{ background: 'var(--marca)', border: 'none', borderRadius: 12, padding: '10px 18px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nueva entrega
          </button>
        </div>

        {/* Formulario nueva entrega */}
        {mostrarForm && (
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 18, padding: 20, marginBottom: 20 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nueva fecha de entrega</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Fecha de entrega</label>
                <input type="date" value={form.fecha_entrega} onChange={e => setForm({ ...form, fecha_entrega: e.target.value })}
                  style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 14px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Nota opcional</label>
                <input type="text" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })}
                  placeholder="Ej: Viaje Arizona mayo"
                  style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 14px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            {msg && <div style={{ color: msg.includes('✓') ? 'var(--verde)' : 'var(--rojo-t)', fontSize: 12, marginBottom: 10 }}>{msg}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={crear}
                style={{ background: 'var(--marca)', border: 'none', borderRadius: 10, padding: '10px 20px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Guardar entrega
              </button>
              <button onClick={() => { setMostrarForm(false); setMsg('') }}
                style={{ background: 'var(--w05)', border: '1px solid var(--w08)', borderRadius: 10, padding: '10px 20px', color: 'var(--w40)', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista de entregas */}
        {cargando ? (
          <div style={{ textAlign: 'center', color: 'var(--w30)', padding: 40 }}>Cargando...</div>
        ) : entregas.length === 0 ? (
          <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>
            No hay entregas registradas. Crea la primera.
          </div>
        ) : (
          entregas.map(e => {
            const est = getEstado(e.estado)
            const pedidos = pedidosPanel[e.id] || []
            const grupos = agruparPorFecha(pedidos)
            return (
              <div key={e.id} style={{ background: 'var(--w03)', border: `1px solid ${est.border}`, borderRadius: 18, padding: 18, marginBottom: 12 }}>

                {/* Cabecera entrega */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'var(--tinta)', fontSize: 16, fontWeight: 700 }}>📅 {e.fecha_entrega}</div>
                    {e.nota && <div style={{ color: 'var(--w40)', fontSize: 12, marginTop: 2 }}>{e.nota}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => abrirEdicion(e)}
                      style={{ background: 'rgba(193,85,58,0.1)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 8, padding: '5px 12px', color: 'var(--marca-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      ✏️ Editar
                    </button>
                    <button onClick={() => eliminarEntrega(e.id)}
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '5px 12px', color: 'var(--rojo-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      🗑️ Eliminar
                    </button>
                    <span style={{ background: est.bg, border: `1px solid ${est.border}`, borderRadius: 20, padding: '4px 12px', color: est.color, fontSize: 11, fontWeight: 600 }}>
                      {est.label}
                    </span>
                  </div>
                </div>

                {/* Panel edición entrega */}
                {editando === e.id && (
                  <div style={{ background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.18)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ color: 'var(--w60)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Editar entrega</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Fecha de entrega</label>
                        <input type="date" value={editForm.fecha_entrega} onChange={ev => setEditForm({ ...editForm, fecha_entrega: ev.target.value })}
                          style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Nota</label>
                        <input type="text" value={editForm.nota} onChange={ev => setEditForm({ ...editForm, nota: ev.target.value })}
                          placeholder="Ej: Viaje Arizona mayo"
                          style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    {editMsg && <div style={{ color: 'var(--rojo-t)', fontSize: 12, marginBottom: 10 }}>{editMsg}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => actualizar(e.id)} disabled={guardandoEdit}
                        style={{ background: 'var(--marca)', border: 'none', borderRadius: 8, padding: '8px 18px', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: guardandoEdit ? 0.6 : 1 }}>
                        {guardandoEdit ? 'Guardando...' : '✓ Guardar'}
                      </button>
                      <button onClick={cancelarEdicion}
                        style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 8, padding: '8px 18px', color: 'var(--w40)', fontSize: 12, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Interruptor de cobro — lo más importante de esta tarjeta */}
                <div style={{ background: est.bg, border: `1px solid ${est.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ color: 'var(--w45)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9, fontWeight: 700 }}>
                    ¿Se puede cobrar en el punto de venta?
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 9 }}>
                    {estados.map(op => {
                      const activo = e.estado === op.valor
                      return (
                        <button key={op.valor} onClick={() => cambiarEstado(e.id, op.valor)}
                          style={{ padding: '8px 15px', borderRadius: 9, border: `1px solid ${activo ? op.border : 'var(--w10)'}`, background: activo ? 'var(--sup)' : 'transparent', color: activo ? op.color : 'var(--w40)', fontSize: 12.5, cursor: activo ? 'default' : 'pointer', fontWeight: activo ? 700 : 500, boxShadow: activo ? 'var(--activo-sombra)' : 'none' }}>
                          {op.label}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ color: est.color, fontSize: 12, lineHeight: 1.5 }}>{est.consecuencia}</div>
                </div>

                {/* Accesos rápidos */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => window.location.href = `/admin/pedidos`}
                    style={{ flex: 1, background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 8, padding: '8px', color: 'var(--marca-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    📝 Capturar pedidos
                  </button>
                  <button onClick={() => window.location.href = `/admin/reportes`}
                    style={{ flex: 1, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '8px', color: 'var(--verde)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    📊 Ver reporte
                  </button>
                  <button onClick={() => togglePedidos(e.id)}
                    style={{ flex: 1, background: panelAbierto[e.id] ? 'rgba(245,158,11,0.12)' : 'var(--w04)', border: `1px solid ${panelAbierto[e.id] ? 'rgba(245,158,11,0.25)' : 'var(--w08)'}`, borderRadius: 8, padding: '8px', color: panelAbierto[e.id] ? 'var(--ambar)' : 'var(--w45)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {panelAbierto[e.id] ? '🔼 Ocultar pedidos' : '📋 Ver pedidos'}
                  </button>
                </div>

                {/* Panel de pedidos */}
                {panelAbierto[e.id] && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--w06)', borderRadius: 12, padding: 14 }}>
                    {!pedidosPanel[e.id] ? (
                      <div style={{ color: 'var(--w30)', fontSize: 12, textAlign: 'center', padding: 16 }}>Cargando pedidos...</div>
                    ) : (
                      <>
                        {pedidos.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <input
                              type="text"
                              placeholder="Buscar por cliente o descripción..."
                              value={busquedaPedidos[e.id] || ''}
                              onChange={ev => setBusquedaPedidos(prev => ({ ...prev, [e.id]: ev.target.value }))}
                              style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 12px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                        )}
                        {(() => {
                          const busq = (busquedaPedidos[e.id] || '').toLowerCase()
                          const pedsFiltrados = busq
                            ? pedidos.filter(p => p.clientes?.nombre?.toLowerCase().includes(busq) || p.descripcion?.toLowerCase().includes(busq))
                            : pedidos
                          if (pedsFiltrados.length === 0) return <div style={{ color: 'var(--w30)', fontSize: 12, textAlign: 'center', padding: 12 }}>Sin resultados para "{busquedaPedidos[e.id]}"</div>
                          const pendientes = pedsFiltrados.filter(p => p.estado !== 'Entregado')
                          const entregados = pedsFiltrados.filter(p => p.estado === 'Entregado')
                          const grupos = agruparPorFecha(pendientes)
                          return (
                            <>
                            {grupos.map(([fecha, peds]) => (
                        <div key={fecha} style={{ marginBottom: 16 }}>
                          <div style={{ color: 'var(--w35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, borderBottom: '1px solid var(--w06)', paddingBottom: 6 }}>
                            Capturados el {fecha}
                          </div>
                          {peds.map(p => (
                            <div key={p.id} style={{ marginBottom: 8 }}>
                              {/* Fila resumen pedido */}
                              {editandoPedido !== p.id && (
                                <div style={{ background: 'var(--w03)', borderRadius: 10, padding: '10px 12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600 }}>{p.descripcion}</div>
                                      <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 2 }}>
                                        {p.clientes?.nombre || '—'} · {p.cantidad || 1} pza
                                        {p.lugar_compra && ` · ${p.lugar_compra}`}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                      <button onClick={() => abrirEditarPedido(p)}
                                        style={{ background: 'rgba(193,85,58,0.1)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 6, padding: '4px 10px', color: 'var(--marca-t)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        ✏️ Editar
                                      </button>
                                      <button onClick={() => eliminarPedido(p.id, e.id)}
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 10px', color: 'var(--rojo-t)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        🗑️
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {p.precio_usd != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>USD <span style={{ color: 'var(--ambar)' }}>${p.precio_usd}</span></span>}
                                    {p.tipo_cambio != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>TC <span style={{ color: 'var(--tinta)' }}>{p.tipo_cambio}</span></span>}
                                    {p.impuesto_pct != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>Tax <span style={{ color: 'var(--tinta)' }}>{p.impuesto_pct}%</span></span>}
                                    {p.costo_mxn != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>Costo <span style={{ color: 'var(--tinta)' }}>{fmt(p.costo_mxn)}</span></span>}
                                    {p.precio_venta != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>Venta <span style={{ color: 'var(--verde)', fontWeight: 700 }}>{fmt(p.precio_venta)}</span></span>}
                                    {p.utilidad != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>Util. <span style={{ color: p.utilidad >= 0 ? 'var(--verde)' : 'var(--rojo-t)' }}>{fmt(p.utilidad)}</span></span>}
                                    {p.estado && <span style={{ background: p.estado === 'Entregado' ? 'rgba(16,185,129,0.15)' : 'var(--w05)', borderRadius: 4, padding: '1px 6px', color: p.estado === 'Entregado' ? 'var(--verde)' : 'var(--w45)', fontSize: 10 }}>{p.estado}</span>}
                                  </div>
                                  {p.notas && <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>📝 {p.notas}</div>}
                                </div>
                              )}

                              {/* Formulario edición inline pedido */}
                              {editandoPedido === p.id && (
                                <div style={{ background: 'rgba(193,85,58,0.07)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 10, padding: 14 }}>
                                  <div style={{ color: 'var(--w50)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Editar pedido</div>
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
                                    {/* Cotizador */}
                                    {(() => {
                                      const usd = parseFloat(editFormPedido.precio_usd) || 0
                                      const tcVal = parseFloat(editFormPedido.tipo_cambio) || 0
                                      const impPct = parseFloat(editFormPedido.impuesto_pct) || 0
                                      const imp = impPct / 100
                                      const costoCalc = usd > 0 && tcVal > 0 ? usd * (1 + imp) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                                      const venta = parseFloat(editFormPedido.precio_venta) || 0
                                      const util = venta - costoCalc
                                      const margen = venta > 0 ? (util / venta) * 100 : 0
                                      const setTax = (tipo) => {
                                        const pct = tipo === 'arizona' ? 8.6 : tipo === 'california' ? 7.75 : parseFloat(entTaxDenogPct) || 0
                                        const nc = usd > 0 && tcVal > 0 ? usd * (1 + pct/100) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                                        setEntTaxTipo(tipo)
                                        setEditFormPedido(prev => ({ ...prev, impuesto_pct: pct, costo_mxn: nc, utilidad: venta - nc }))
                                      }
                                      const handleUsd = (val) => {
                                        const nu = parseFloat(val) || 0
                                        const nc = nu > 0 && tcVal > 0 ? nu * (1 + imp) * tcVal : 0
                                        setEditFormPedido(prev => ({ ...prev, precio_usd: val, costo_mxn: nc || prev.costo_mxn, utilidad: venta - (nc || parseFloat(prev.costo_mxn) || 0) }))
                                      }
                                      const handleTc = (val) => {
                                        const nt = parseFloat(val) || 0
                                        const nc = usd > 0 && nt > 0 ? usd * (1 + imp) * nt : 0
                                        setEditFormPedido(prev => ({ ...prev, tipo_cambio: val, costo_mxn: nc || prev.costo_mxn, utilidad: venta - (nc || parseFloat(prev.costo_mxn) || 0) }))
                                      }
                                      const handleDenogPct = (val) => {
                                        setEntTaxDenogPct(val)
                                        const pct = parseFloat(val) || 0
                                        const nc = usd > 0 && tcVal > 0 ? usd * (1 + pct/100) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                                        setEditFormPedido(prev => ({ ...prev, impuesto_pct: pct, costo_mxn: nc, utilidad: venta - nc }))
                                      }
                                      const handleVenta = (val) => {
                                        setEditFormPedido(prev => ({ ...prev, precio_venta: val, utilidad: (parseFloat(val) || 0) - costoCalc }))
                                      }
                                      return (
                                        <div style={{ gridColumn: '1 / -1', background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.18)', borderRadius: 10, padding: 12 }}>
                                          <div style={{ color: 'var(--marca-t)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>💱 Cotizador</div>
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                            <div><label style={labelStyle}>Precio USD</label><input type="number" step="0.01" value={editFormPedido.precio_usd} onChange={ev => handleUsd(ev.target.value)} style={inputStyle} placeholder="Ej. 14.99" /></div>
                                            <div><label style={labelStyle}>Tipo de cambio</label><input type="number" step="0.01" value={editFormPedido.tipo_cambio} onChange={ev => handleTc(ev.target.value)} style={inputStyle} /></div>
                                          </div>
                                          <div style={{ marginBottom: 8 }}>
                                            <label style={labelStyle}>Impuesto</label>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                              {[['arizona','Arizona 8.6%'],['california','California 7.75%'],['denog','Tax Denog']].map(([k,lbl]) => (
                                                <button key={k} type="button" onClick={() => setTax(k)}
                                                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: `1px solid ${entTaxTipo === k ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: entTaxTipo === k ? 'rgba(193,85,58,0.2)' : 'var(--w04)', color: entTaxTipo === k ? 'var(--marca-t)' : 'var(--w45)' }}>
                                                  {lbl}
                                                </button>
                                              ))}
                                            </div>
                                            {entTaxTipo === 'denog' && <input type="number" step="0.01" value={entTaxDenogPct} onChange={ev => handleDenogPct(ev.target.value)} placeholder="%" style={{ ...inputStyle, marginTop: 5, width: '50%' }} />}
                                          </div>
                                          {usd > 0 && tcVal > 0 && (
                                            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: '7px 9px', fontSize: 10, display: 'grid', gap: 2, marginBottom: 8 }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}><span>Precio USD</span><span style={{ fontFamily: 'monospace' }}>${usd.toFixed(2)}</span></div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}><span>+ Impuesto ({impPct.toFixed(2)}%)</span><span style={{ fontFamily: 'monospace' }}>+${(usd * imp).toFixed(2)}</span></div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}><span>× TC {tcVal}</span></div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tinta)', fontWeight: 700, borderTop: '1px solid var(--w08)', paddingTop: 4, marginTop: 2 }}><span>= Costo MXN</span><span style={{ fontFamily: 'monospace', color: 'var(--ambar)' }}>${costoCalc.toFixed(2)}</span></div>
                                            </div>
                                          )}
                                          <div>
                                            <label style={labelStyle}>Precio de venta MXN</label>
                                            <input type="number" step="0.01" value={editFormPedido.precio_venta} onChange={ev => handleVenta(ev.target.value)} style={inputStyle} />
                                            {editFormPedido.precio_venta && costoCalc > 0 && (
                                              <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10 }}>
                                                <span style={{ color: util >= 0 ? 'var(--verde)' : 'var(--rojo-t)' }}>Utilidad: ${util.toFixed(2)}</span>
                                                <span style={{ color: margen >= 20 ? 'var(--verde)' : margen >= 0 ? 'var(--ambar)' : 'var(--rojo-t)' }}>Margen: {margen.toFixed(1)}%</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })()}
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
                                  {pedidoMsg && <div style={{ color: 'var(--rojo-t)', fontSize: 11, marginBottom: 8 }}>{pedidoMsg}</div>}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={guardarPedidoEdit} disabled={guardandoPedido}
                                      style={{ background: 'var(--marca)', border: 'none', borderRadius: 8, padding: '7px 16px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: guardandoPedido ? 0.6 : 1 }}>
                                      {guardandoPedido ? 'Guardando...' : '✓ Guardar'}
                                    </button>
                                    <button onClick={() => setEditandoPedido(null)}
                                      style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 8, padding: '7px 16px', color: 'var(--w40)', fontSize: 11, cursor: 'pointer' }}>
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                          ))}
                            {entregados.length > 0 && (
                              <>
                                {pendientes.length > 0 && (
                                  <div style={{ borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: 10, marginTop: 6, marginBottom: 10 }}>
                                    <span style={{ color: 'rgba(16,185,129,0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Entregados</span>
                                  </div>
                                )}
                                {entregados.map(p => (
                                  <div key={p.id} style={{ marginBottom: 8, opacity: 0.6 }}>
                                    <div style={{ position: 'relative', background: 'var(--w02)', borderRadius: 10, padding: '10px 12px' }}>
                                      <div style={{ position: 'absolute', top: 6, right: 8, background: 'var(--verde)', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>✓ ENTREGADO</div>
                                      <div style={{ paddingRight: 90 }}>
                                        <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600 }}>{p.descripcion}</div>
                                        <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 2 }}>
                                          {p.clientes?.nombre || '—'} · {p.cantidad || 1} pza{p.lugar_compra && ` · ${p.lugar_compra}`}
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                                        {p.precio_venta != null && <span style={{ color: 'var(--w40)', fontSize: 10 }}>Venta <span style={{ color: 'var(--verde)', fontWeight: 700 }}>{fmt(p.precio_venta)}</span></span>}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            </>
                          )
                        })()}
                      </>
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
