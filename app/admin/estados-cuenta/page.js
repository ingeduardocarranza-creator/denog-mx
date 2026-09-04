'use client'
import { useState, useEffect, useRef } from 'react'
import { armarPorEntrega } from '../../../lib/estadosCuenta/armar'
import { dibujarEnNavegador } from '../../../lib/estadosCuenta/navegador'
import { fmt, fmtFecha, saldoDeGrupos } from '../../../lib/estadosCuenta/dibujar'



const fmtFechaCorta = (f) => {
  if (!f) return ''
  const d = new Date(f)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}



export default function EstadosCuenta() {
  const [modo, setModo] = useState('entrega')
  const [entregas, setEntregas] = useState([])
  const [clientes, setClientes] = useState([])
  const [entregaId, setEntregaId] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState([])
  const [indice, setIndice] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [errorClip, setErrorClip] = useState(false)
  const [imagenURL, setImagenURL] = useState(null)
  const canvasRef = useRef(null)

  // Edición de pedidos
  const [todosClientes, setTodosClientes] = useState([])
  const [vendedoresOpts, setVendedoresOpts] = useState([])
  const [editandoPedido, setEditandoPedido] = useState(null)
  const [editFormPedido, setEditFormPedido] = useState({})
  const [guardandoPedido, setGuardandoPedido] = useState(false)
  const [pedidoMsg, setPedidoMsg] = useState('')
  const [ecTaxTipo, setEcTaxTipo] = useState('arizona')
  const [ecTaxDenogPct, setEcTaxDenogPct] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/entregas').then(r => r.json()),
      fetch('/api/clientes/listar').then(r => r.json())
    ]).then(([e, c]) => {
      // De más reciente a más vieja: al abrir el selector, la entrega en
      // curso es la que se busca casi siempre.
      if (e.ok) setEntregas([...(e.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || '')))
      if (c.ok) {
        setClientes(c.clientes.filter(cl => cl.rol !== 'admin'))
        setTodosClientes(c.clientes)
        setVendedoresOpts(c.clientes.filter(cl => cl.rol === 'admin' || cl.rol === 'vendedor'))
      }
    })
  }, [])

  const abrirEditarPedido = (p) => {
    const imp = parseFloat(p.impuesto_pct) || 0
    const taxTipo = Math.abs(imp - 8.6) < 0.01 ? 'arizona' : Math.abs(imp - 7.75) < 0.01 ? 'california' : 'denog'
    setEcTaxTipo(taxTipo)
    setEcTaxDenogPct(taxTipo === 'denog' && imp > 0 ? String(imp) : '')
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
      setEditandoPedido(null)
      if (modo === 'entrega') cargarPorEntrega()
      else cargarPorCliente()
    } else {
      setPedidoMsg(data.mensaje || 'Error al guardar')
    }
  }

  const eliminarPedido = async (pedidoId) => {
    if (!confirm('¿Eliminar este artículo? Esta acción no se puede deshacer.')) return
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pedidoId })
    })
    const data = await res.json()
    if (data.ok) {
      if (modo === 'entrega') cargarPorEntrega()
      else cargarPorCliente()
    }
  }

  const cargarPorEntrega = async () => {
    if (!entregaId) return
    setCargando(true)
    setDatos([])

    // Paso 1: identificar qué clientes tienen pedidos en la entrega seleccionada
    // Paso 2: traer TODOS los pedidos y pagos sin filtro de entrega
    const [pedsEntregaRes, todosPedsRes, todosPagsRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?entrega_id=${entregaId}&fotos=no`).then(r => r.json()),
      fetch('/api/reportes/pedidos?fotos=no').then(r => r.json()),
      fetch('/api/reportes/pagos').then(r => r.json())
    ])

    // El armado vive en lib/estadosCuenta/armar.js: la misma funcion que usa el
    // envio por WhatsApp, para que el saldo de la pantalla y el de la imagen
    // enviada no puedan diferir.
    const lista = armarPorEntrega({
      pedidosDeLaEntrega: pedsEntregaRes.pedidos || [],
      todosPedidos: todosPedsRes.pedidos || [],
      todosPagos: todosPagsRes.pagos || [],
      entregas,
      clientes,
      entregaId,
    })

    if (lista.pagosSinGrupo?.length) {
      console.warn('[estados-cuenta] pagos sin grupo:', lista.pagosSinGrupo)
    }
    if (lista.length === 0) { setCargando(false); return }

    setDatos(lista)
    setIndice(0)
    setCargando(false)
  }

  const cargarPorCliente = async () => {
    if (!clienteId) return
    setCargando(true)
    setDatos([])
    const cl = clientes.find(c => String(c.id) === String(clienteId))

    // Filtrar server-side por cliente_id para evitar el límite de 1000 filas de Supabase
    const [pedsRes, pagsRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?cliente_id=${clienteId}&fotos=no`).then(r => r.json()),
      fetch(`/api/reportes/pagos?cliente_id=${clienteId}`).then(r => r.json())
    ])

    const pedidos = (pedsRes.pedidos || []).filter(p => p.estado !== 'no_llego')
    const pagos = pagsRes.pagos || []

    const porEntrega = {}
    pedidos.forEach(p => {
      const eid = String(p.entrega_id || 'sin')
      if (!porEntrega[eid]) porEntrega[eid] = { pedidos: [], pagos: [] }
      porEntrega[eid].pedidos.push(p)
    })
    const keysEntrega = Object.keys(porEntrega)
    pagos.forEach(p => {
      const eid = String(p.entrega_id || 'sin')
      if (porEntrega[eid]) {
        porEntrega[eid].pagos.push(p)
      } else {
        console.warn('[estados-cuenta] pago SIN grupo coincidente — tipo:', p.tipo, 'entrega_id:', p.entrega_id, 'eids disponibles:', keysEntrega)
      }
    })

    let grupos = Object.entries(porEntrega).map(([eid, d]) => ({
      entrega: entregas.find(e => String(e.id) === eid) || null,
      pedidos: d.pedidos,
      pagos: d.pagos
    })).sort((a, b) => {
      if (!a.entrega) return 1
      if (!b.entrega) return -1
      return new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega)
    })

    // En entregas anteriores a la más reciente, ocultar pedidos ya entregados
    // (el recordatorio solo debe mostrar lo pendiente de recoger).
    // Si se filtró por una entrega vieja específica, se muestra todo (evidencia histórica).
    const fechaMasReciente = grupos.reduce((max, g) => {
      if (!g.entrega) return max
      const f = new Date(g.entrega.fecha_entrega)
      return (!max || f > max) ? f : max
    }, null)
    const entregaConsultada = entregaId ? entregas.find(e => String(e.id) === String(entregaId)) : null
    const consultandoEntregaVieja = entregaConsultada && fechaMasReciente &&
      new Date(entregaConsultada.fecha_entrega).getTime() !== fechaMasReciente.getTime()

    if (!consultandoEntregaVieja) {
      grupos = grupos.map(g => {
        const esLaMasReciente = g.entrega && fechaMasReciente && new Date(g.entrega.fecha_entrega).getTime() === fechaMasReciente.getTime()
        if (esLaMasReciente) return g
        const pedidosPendientes = g.pedidos.filter(p => p.estado !== 'Entregado')
        const totalEntregadosOriginal = g.pedidos.filter(p => p.estado === 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
        // Si ya no quedan pedidos pendientes en este grupo viejo, el grupo completo
        // (incluyendo sus anticipos) deja de mostrarse en el estado de cuenta actual
        if (pedidosPendientes.length === 0) return { ...g, pedidos: [], pagos: [] }
        return { ...g, pedidos: pedidosPendientes, totalEntregadosOriginal }
      }).filter(g => g.pedidos.length > 0 || g.pagos.length > 0)
    }

    if (grupos.length === 0) { setCargando(false); return }

    setDatos([{ cliente: { id: clienteId, nombre: cl?.nombre || '', telefono: cl?.telefono || '' }, grupos }])
    setIndice(0)
    setCargando(false)
  }

  const copiarAlPortapapeles = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      // Pasar el blob como Promise a ClipboardItem de forma síncrona dentro del gesto de usuario
      const blobPromise = new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
        .then(() => {
          setCopiado(true)
          setErrorClip(false)
          setTimeout(() => setCopiado(false), 2500)
        })
        .catch(e => {
          console.error('[Copia] Error:', e.name, e.message)
          setErrorClip(true)
          setTimeout(() => setErrorClip(false), 3000)
        })
    } catch (e) {
      console.error('[Copia] Error al crear ClipboardItem:', e.name, e.message)
      setErrorClip(true)
      setTimeout(() => setErrorClip(false), 3000)
    }
  }

  useEffect(() => {
    if (datos.length > 0 && datos[indice]) {
      setImagenURL(null)
      dibujarEnNavegador(datos[indice]).then(canvas => {
        canvasRef.current = canvas
        setImagenURL(canvas.toDataURL('image/png'))
      })
    }
  }, [indice, datos])

  const siguiente = () => { if (indice < datos.length - 1) setIndice(i => i + 1) }

  const clienteActual = datos[indice]
  const clientesFiltrados = busqueda.length > 1
    ? clientes.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : []

  const inputStyle = { width: '100%', background: 'var(--w06)', border: '1px solid var(--w12)', borderRadius: 8, padding: '9px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { color: 'var(--w40)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '24px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 20, fontWeight: 700 }}>📋 Estados de cuenta</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>Genera y comparte por WhatsApp — copia la imagen y pégala en el chat</div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['entrega', '📅 Por entrega'], ['cliente', '🔍 Buscar cliente']].map(([m, lbl]) => (
            <button key={m} onClick={() => { setModo(m); setDatos([]); setIndice(0) }}
              style={{ padding: '8px 18px', borderRadius: 10, border: `1px solid ${modo === m ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: modo === m ? 'rgba(193,85,58,0.15)' : 'var(--w04)', color: modo === m ? 'var(--marca-t)' : 'var(--w50)', fontSize: 13, fontWeight: modo === m ? 600 : 400, cursor: 'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          {modo === 'entrega' ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Entrega</label>
                <select value={entregaId} onChange={e => setEntregaId(e.target.value)} style={{ ...inputStyle }}>
                  <option value="">Selecciona una entrega</option>
                  {entregas.map(e => <option key={e.id} value={e.id}>{fmtFecha(e.fecha_entrega)}{e.nota ? ' · ' + e.nota : ''}</option>)}
                </select>
              </div>
              <button onClick={cargarPorEntrega} disabled={!entregaId || cargando}
                style={{ padding: '9px 20px', borderRadius: 8, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', color: 'var(--marca-t)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !entregaId || cargando ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                {cargando ? 'Cargando...' : 'Cargar clientes'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Cliente</label>
                <input value={busqueda} onChange={e => { setBusqueda(e.target.value); setClienteId('') }} placeholder="Escribe el nombre..."
                  style={inputStyle} />
                {clientesFiltrados.length > 0 && !clienteId && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                    {clientesFiltrados.map(c => (
                      <div key={c.id} onClick={() => { setClienteId(c.id); setBusqueda(c.nombre) }}
                        style={{ padding: '10px 14px', cursor: 'pointer', color: 'var(--tinta)', fontSize: 13, borderBottom: '1px solid var(--w05)' }}>
                        {c.nombre}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Entrega (opcional)</label>
                  <select value={entregaId} onChange={e => setEntregaId(e.target.value)} style={{ ...inputStyle }}>
                    <option value="">Todas las entregas</option>
                    {entregas.map(e => <option key={e.id} value={e.id}>{fmtFecha(e.fecha_entrega)}</option>)}
                  </select>
                </div>
                <button onClick={cargarPorCliente} disabled={!clienteId || cargando}
                  style={{ padding: '9px 20px', borderRadius: 8, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', color: 'var(--marca-t)', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !clienteId || cargando ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  {cargando ? 'Cargando...' : 'Ver estado'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Client view */}
        {datos.length > 0 && clienteActual && (
          <>
            {/* Navegación avanzada */}
            <div className="flex items-center gap-2 flex-wrap justify-center mb-4">
              <button
                onClick={() => setIndice(0)}
                disabled={indice === 0}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >⏮ Primero</button>

              <button
                onClick={() => setIndice(i => Math.max(0, i - 10))}
                disabled={indice === 0}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >-10</button>

              <button
                onClick={() => setIndice(i => Math.max(0, i - 1))}
                disabled={indice === 0}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >◀ Ant</button>

              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">Cliente</span>
                <input
                  type="number"
                  min={1}
                  max={datos.length}
                  value={indice + 1}
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= datos.length) setIndice(val - 1);
                  }}
                  className="w-14 text-center bg-gray-800 border border-gray-600 rounded-lg text-white text-sm py-1"
                />
                <span className="text-gray-400 text-sm">de {datos.length}</span>
              </div>

              <button
                onClick={() => setIndice(i => Math.min(datos.length - 1, i + 1))}
                disabled={indice === datos.length - 1}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >Sig ▶</button>

              <button
                onClick={() => setIndice(i => Math.min(datos.length - 1, i + 10))}
                disabled={indice === datos.length - 1}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >+10</button>

              <button
                onClick={() => setIndice(datos.length - 1)}
                disabled={indice === datos.length - 1}
                className="px-3 py-1 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-30"
              >⏭ Último</button>
            </div>

            {/* Client card */}
            <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 700 }}>{clienteActual.cliente.nombre}</div>
                  {clienteActual.cliente.telefono && (
                    <div style={{ color: 'var(--w40)', fontSize: 12, marginTop: 3 }}>📱 {clienteActual.cliente.telefono}</div>
                  )}
                </div>

              </div>

              {clienteActual.grupos.map((g, gi) => {
                const totalEntregados = g.totalEntregadosOriginal ?? g.pedidos.filter(p => p.estado === 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
                const sub = g.pedidos.filter(p => p.estado !== 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
                const pagAnt = g.pagos.filter(p => !p.tipo?.toLowerCase().includes('liquidaci')).reduce((s, p) => s + (p.monto || 0), 0)
                const pag = g.pagos.reduce((s, p) => s + (p.monto || 0), 0)
                const sobrante = Math.max(0, pag - totalEntregados)
                const neto = Math.max(0, sub - sobrante)
                return (
                  <div key={gi} style={{ marginBottom: gi < clienteActual.grupos.length - 1 ? 16 : 0 }}>
                    {clienteActual.grupos.length > 1 && g.entrega && (
                      <div style={{ color: 'var(--marca-t)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        Entrega {fmtFecha(g.entrega.fecha_entrega)}
                      </div>
                    )}
                    <div style={{ background: 'var(--w03)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                      {[...g.pedidos].sort(p => p.estado === 'Entregado' ? 1 : -1).map((p, pi, arr) => (
                        <div key={pi} style={{ opacity: p.estado === 'Entregado' ? 0.6 : 1 }}>
                          {editandoPedido !== p.id ? (
                            <div style={{ padding: '6px 14px', borderBottom: pi < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1, marginRight: 12 }}>
                                  <span style={{ color: 'var(--w70)', fontSize: 12 }}>{p.descripcion}</span>
                                  {p.apartado_fragil && (
                                    <span style={{ background: 'var(--ambar)', color: '#000', fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px' }}>
                                      ⚠️ APARTADOS / FRÁGIL
                                    </span>
                                  )}
                                  {p.fecha_compra && (
                                    <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 1 }}>
                                      Comprado: {fmtFecha(p.fecha_compra)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                  <span style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600 }}>
                                    {(p.cantidad || 1) > 1 ? `x${p.cantidad} = ${fmt(p.precio_venta)}` : fmt(p.precio_venta)}
                                  </span>
                                  {p.estado !== 'Entregado' && (
                                    <>
                                      <button onClick={() => abrirEditarPedido(p)}
                                        style={{ background: 'rgba(193,85,58,0.1)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 6, padding: '3px 9px', color: 'var(--marca-t)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        ✏️
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const nuevoValor = !p.apartado_fragil;
                                          await fetch('/api/pedidos/actualizar-pedido', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ...p, apartado_fragil: nuevoValor })
                                          });
                                          setDatos(prev => prev.map(cliente => ({
                                            ...cliente,
                                            grupos: cliente.grupos.map(g => ({
                                              ...g,
                                              pedidos: g.pedidos.map(ped =>
                                                ped.id === p.id ? { ...ped, apartado_fragil: nuevoValor } : ped
                                              )
                                            }))
                                          })));
                                        }}
                                        title={p.apartado_fragil ? 'Quitar APARTADOS/FRÁGIL' : 'Marcar APARTADOS/FRÁGIL'}
                                        style={{ background: p.apartado_fragil ? 'var(--ambar)' : 'rgba(250,204,21,0.15)', color: p.apartado_fragil ? '#000' : 'var(--ambar)', border: '1px solid #facc15', borderRadius: '6px', padding: '2px 7px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                                        ⚠️
                                      </button>
                                      <button onClick={() => eliminarPedido(p.id)}
                                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '3px 9px', color: 'var(--rojo-t)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                        🗑️
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {p.estado === 'Entregado' && (
                                <div style={{ marginTop: 4 }}>
                                  <span style={{ background: 'var(--verde)', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>✓ ENTREGADO</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ background: 'rgba(193,85,58,0.07)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 10, padding: 14, margin: 6 }}>
                              <div style={{ color: 'var(--w50)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Editar pedido</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Cliente</label>
                                  <select value={editFormPedido.cliente_id} onChange={ev => setEditFormPedido({ ...editFormPedido, cliente_id: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}>
                                    <option value="">— seleccionar —</option>
                                    {todosClientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Entrega</label>
                                  <select value={editFormPedido.entrega_id} onChange={ev => setEditFormPedido({ ...editFormPedido, entrega_id: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}>
                                    <option value="">— seleccionar —</option>
                                    {entregas.map(en => <option key={en.id} value={en.id}>{en.fecha_entrega}{en.nota ? ` · ${en.nota}` : ''}</option>)}
                                  </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Descripción</label>
                                  <input type="text" value={editFormPedido.descripcion} onChange={ev => setEditFormPedido({ ...editFormPedido, descripcion: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Cantidad</label>
                                  <input type="number" value={editFormPedido.cantidad} onChange={ev => setEditFormPedido({ ...editFormPedido, cantidad: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Fecha compra</label>
                                  <input type="date" value={editFormPedido.fecha_compra} onChange={ev => setEditFormPedido({ ...editFormPedido, fecha_compra: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                {/* Cotizador */}
                                {(() => {
                                  const iSt = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }
                                  const lSt = { color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }
                                  const usd = parseFloat(editFormPedido.precio_usd) || 0
                                  const tcVal = parseFloat(editFormPedido.tipo_cambio) || 0
                                  const impPct = parseFloat(editFormPedido.impuesto_pct) || 0
                                  const imp = impPct / 100
                                  const costoCalc = usd > 0 && tcVal > 0 ? usd * (1 + imp) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                                  const venta = parseFloat(editFormPedido.precio_venta) || 0
                                  const util = venta - costoCalc
                                  const margen = venta > 0 ? (util / venta) * 100 : 0
                                  const setTax = (tipo) => {
                                    const pct = tipo === 'arizona' ? 8.6 : tipo === 'california' ? 7.75 : parseFloat(ecTaxDenogPct) || 0
                                    const nc = usd > 0 && tcVal > 0 ? usd * (1 + pct/100) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                                    setEcTaxTipo(tipo)
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
                                    setEcTaxDenogPct(val)
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
                                        <div><label style={lSt}>Precio USD</label><input type="number" step="0.01" value={editFormPedido.precio_usd} onChange={ev => handleUsd(ev.target.value)} style={iSt} placeholder="Ej. 14.99" /></div>
                                        <div><label style={lSt}>Tipo de cambio</label><input type="number" step="0.01" value={editFormPedido.tipo_cambio} onChange={ev => handleTc(ev.target.value)} style={iSt} /></div>
                                      </div>
                                      <div style={{ marginBottom: 8 }}>
                                        <label style={lSt}>Impuesto</label>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                          {[['arizona','Arizona 8.6%'],['california','California 7.75%'],['denog','Tax Denog']].map(([k,lbl]) => (
                                            <button key={k} type="button" onClick={() => setTax(k)}
                                              style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: `1px solid ${ecTaxTipo === k ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: ecTaxTipo === k ? 'rgba(193,85,58,0.2)' : 'var(--w04)', color: ecTaxTipo === k ? 'var(--marca-t)' : 'var(--w45)' }}>
                                              {lbl}
                                            </button>
                                          ))}
                                        </div>
                                        {ecTaxTipo === 'denog' && <input type="number" step="0.01" value={ecTaxDenogPct} onChange={ev => handleDenogPct(ev.target.value)} placeholder="%" style={{ ...iSt, marginTop: 5, width: '50%' }} />}
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
                                        <label style={lSt}>Precio de venta MXN</label>
                                        <input type="number" step="0.01" value={editFormPedido.precio_venta} onChange={ev => handleVenta(ev.target.value)} style={iSt} />
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
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Estado</label>
                                  <select value={editFormPedido.estado} onChange={ev => setEditFormPedido({ ...editFormPedido, estado: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}>
                                    {['Pendiente', 'En camino', 'En tienda', 'Entregado', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Vendedor</label>
                                  <select value={editFormPedido.vendedor_id} onChange={ev => setEditFormPedido({ ...editFormPedido, vendedor_id: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}>
                                    <option value="">— ninguno —</option>
                                    {vendedoresOpts.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                                  </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                  <label style={{ color: 'var(--w40)', fontSize: 10, display: 'block', marginBottom: 3 }}>Notas</label>
                                  <input type="text" value={editFormPedido.notas} onChange={ev => setEditFormPedido({ ...editFormPedido, notas: ev.target.value })}
                                    style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 7, padding: '6px 9px', color: 'var(--tinta)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} placeholder="Opcional" />
                                </div>
                              </div>
                              {pedidoMsg && <div style={{ color: 'var(--rojo-t)', fontSize: 11, marginBottom: 8 }}>{pedidoMsg}</div>}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={guardarPedidoEdit} disabled={guardandoPedido}
                                  style={{ background: 'var(--marca)', border: 'none', borderRadius: 7, padding: '6px 14px', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: guardandoPedido ? 0.6 : 1 }}>
                                  {guardandoPedido ? 'Guardando...' : '✓ Guardar'}
                                </button>
                                <button onClick={() => setEditandoPedido(null)}
                                  style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 7, padding: '6px 14px', color: 'var(--w40)', fontSize: 11, cursor: 'pointer' }}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const pagosAnt = g.pagos.filter(pg => !pg.tipo?.toLowerCase().includes('liquidaci'))
                      if (pagosAnt.length === 0 || g.totalEntregadosOriginal !== undefined) return null
                      const emojiMetodo = (m) => m === 'Efectivo' ? '💵' : m === 'Transferencia' ? '📱' : m === 'Terminal' ? '💳' : m
                      const totalAnt = pagosAnt.reduce((s, pg) => s + pg.monto, 0)
                      const fechaAnt = pagosAnt[0]?.creado_en
                      const porMetodo = pagosAnt.reduce((acc, pg) => {
                        if (!pg.metodo) return acc
                        acc[pg.metodo] = (acc[pg.metodo] || 0) + pg.monto
                        return acc
                      }, {})
                      return (
                        <div style={{ borderLeft: '4px solid #16a34a', background: '#dcfce7', borderRadius: '0 6px 6px 0', padding: '8px 12px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: '#166534', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                              ✓ Anticipos aplicados{fechaAnt ? ` · ${fmtFecha(fechaAnt.split('T')[0])}` : ''}
                            </div>
                            <div style={{ color: '#15803d', fontSize: 10 }}>
                              {Object.entries(porMetodo).map(([m, monto]) => `${emojiMetodo(m)} ${m}: ${fmt(monto)}`).join(' · ')}
                            </div>
                          </div>
                          <span style={{ color: '#166534', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>-{fmt(totalAnt)}</span>
                        </div>
                      )
                    })()}
                    {(() => {
                      const pagosLiq = g.pagos.filter(pg => pg.tipo?.toLowerCase().includes('liquidaci'))
                      if (pagosLiq.length === 0 || g.totalEntregadosOriginal !== undefined) return null
                      const emojiMetodo = (m) => m === 'Efectivo' ? '💵' : m === 'Transferencia' ? '📱' : m === 'Terminal' ? '💳' : m
                      const porMetodo = pagosLiq.reduce((acc, pg) => {
                        if (!pg.metodo) return acc
                        acc[pg.metodo] = (acc[pg.metodo] || 0) + pg.monto
                        return acc
                      }, {})
                      const totalLiq = pagosLiq.reduce((s, pg) => s + pg.monto, 0)
                      const fechaLiq = pagosLiq[0]?.creado_en
                      return (
                        <div style={{ borderLeft: '4px solid #1d4ed8', background: '#dbeafe', borderRadius: '0 6px 6px 0', padding: '8px 12px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                              ✓ Liquidado{fechaLiq ? ` · ${fmtFecha(fechaLiq.split('T')[0])}` : ''}
                            </div>
                            <div style={{ color: '#1e40af', fontSize: 10 }}>
                              {Object.entries(porMetodo).map(([m, monto]) => `${emojiMetodo(m)} ${m}: ${fmt(monto)}`).join(' · ')}
                            </div>
                          </div>
                          <span style={{ color: '#1d4ed8', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>{fmt(totalLiq)}</span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {(() => {
                const saldo = saldoDeGrupos(clienteActual.grupos)
                return (
                  <div style={{ marginTop: 16, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.14)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--rojo-t)', fontSize: 13, fontWeight: 600 }}>Total a pagar</span>
                    <span style={{ color: 'var(--rojo-t)', fontSize: 22, fontWeight: 800 }}>{fmt(saldo)}</span>
                  </div>
                )
              })()}
            </div>

            {/* Imagen del estado de cuenta */}
            {imagenURL && (
              <div style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--w08)' }}>
                <img src={imagenURL} alt="Estado de cuenta" style={{ width: '100%', display: 'block' }} />
              </div>
            )}
            {!imagenURL && (
              <div style={{ marginBottom: 14, borderRadius: 12, background: 'var(--w02)', border: '1px solid var(--w06)', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w20)', fontSize: 13 }}>
                Generando imagen...
              </div>
            )}

            {/* Botones principales */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={() => copiarAlPortapapeles(clienteActual)} disabled={!imagenURL}
                style={{ flex: 2, padding: '14px', borderRadius: 12, background: copiado ? 'rgba(74,222,128,0.15)' : 'rgba(193,85,58,0.2)', border: `1px solid ${copiado ? 'rgba(74,222,128,0.35)' : 'rgba(193,85,58,0.4)'}`, color: copiado ? 'var(--verde)' : 'var(--marca-t)', fontSize: 15, fontWeight: 700, cursor: imagenURL ? 'pointer' : 'default', opacity: imagenURL ? 1 : 0.4, transition: 'all 0.25s', letterSpacing: 0.3 }}>
                {copiado ? '✅ ¡Copiada!' : '📋 Copiar imagen'}
              </button>
              {clienteActual.cliente.telefono ? (
                <a href={`https://wa.me/${((tel) => { const n = tel.replace(/\D/g, ''); if (n.length === 12 && n.startsWith('52')) return n; if (n.length === 10) return '52' + n; if (n.length === 11 && n.startsWith('1')) return '52' + n.slice(1); if (n.length === 11 && !n.startsWith('52')) return '52' + n.slice(1); if (n.length === 13 && n.startsWith('521')) return '52' + n.slice(3); return n; })(clienteActual.cliente.telefono)}`} target="_blank" rel="noreferrer"
                  style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: 'var(--verde)', fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  📱 WhatsApp
                </a>
              ) : (
                <div style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'var(--w02)', border: '1px solid var(--w05)', color: 'var(--w18)', fontSize: 13, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Sin tel.
                </div>
              )}
            </div>
            <button onClick={() => setIndice(i => Math.min(datos.length - 1, i + 1))} disabled={indice >= datos.length - 1}
              style={{ width: '100%', padding: '12px', borderRadius: 12, background: indice < datos.length - 1 ? 'var(--w06)' : 'var(--w02)', border: `1px solid ${indice < datos.length - 1 ? 'var(--w12)' : 'var(--w04)'}`, color: indice < datos.length - 1 ? 'var(--w60)' : 'var(--w15)', fontSize: 14, fontWeight: 600, cursor: indice < datos.length - 1 ? 'pointer' : 'default' }}>
              Siguiente cliente → ({indice + 1} / {datos.length})
            </button>
          </>
        )}

        {!cargando && datos.length === 0 && entregaId && modo === 'entrega' && (
          <div style={{ textAlign: 'center', color: 'var(--w25)', fontSize: 13, padding: 40 }}>
            No hay clientes con pedidos pendientes en esta entrega
          </div>
        )}
      </div>
    </div>
  )
}
