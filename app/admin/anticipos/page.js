'use client'
import { useState, useEffect } from 'react'

export default function Anticipos() {
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [anticipos, setAnticipos] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState('')
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState('Transferencia')
  const [fechaAnticipo, setFechaAnticipo] = useState(() => {
    const hoy = new Date()
    return new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })
  const [editando, setEditando] = useState(null)
  const [montoEditar, setMontoEditar] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEntrega, setFiltroEntrega] = useState('')

  useEffect(() => { cargarDatos() }, [])

  const cargarDatos = async () => {
    const [clRes, enRes, anRes] = await Promise.all([
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/entregas').then(r => r.json()),
      fetch('/api/anticipos').then(r => r.json()),
    ])
    setClientes(clRes.clientes || [])
    setEntregas(enRes.entregas || [])
    setAnticipos(anRes.anticipos || [])
  }

  const registrarAnticipo = async (modo = 'limpiar') => {
    if (!clienteSeleccionado || !monto || Number(monto) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Llena los campos obligatorios' }); return
    }

    setLoading(true)
    const horaActual = new Date().toLocaleTimeString('es-MX', { hour12: false })
    const res = await fetch('/api/anticipos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteSeleccionado,
        entrega_id: entregaSeleccionada || null,
        monto: Number(monto),
        metodo: metodoPago,
        creado_en: `${fechaAnticipo}T${horaActual}.000Z`,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (!data.ok) { setMensaje({ tipo: 'error', texto: data.mensaje || 'Error al registrar' }); return }
    setMensaje({ tipo: 'exito', texto: '✓ Anticipo registrado' })
    if (modo === 'limpiar') {
      setClienteSeleccionado(''); setEntregaSeleccionada(''); setMonto('')
    } else {
      setMonto('')
    }
    await cargarDatos()
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000)
  }

  const eliminarAnticipo = async (id) => {
    if (!confirm('¿Eliminar este anticipo?')) return
    await fetch('/api/anticipos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    cargarDatos()
  }

  const guardarEdicion = async (id) => {
    if (!montoEditar || Number(montoEditar) <= 0) return
    await fetch('/api/anticipos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, monto: Number(montoEditar) }),
    })
    setEditando(null)
    cargarDatos()
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const d = new Date(fecha)
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }

  const formatearFechaEntrega = (fecha) => {
    if (!fecha) return ''
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }

  const getNombreEntrega = (entrega_id) => {
    const e = entregas.find(e => e.id === entrega_id)
    return e ? formatearFechaEntrega(e.fecha_entrega) : 'Sin entrega'
  }

  const anticiposFiltrados = anticipos.filter(a => {
    if (filtroCliente && a.cliente_id !== filtroCliente) return false
    if (filtroEntrega && a.entrega_id !== filtroEntrega) return false
    return true
  })

  const totalFiltrado = anticiposFiltrados.reduce((s, a) => s + (a.monto || 0), 0)
  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">

        <div style={{ marginBottom: 24 }}>
          <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>💰 Anticipos</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>Registra y consulta anticipos por cliente y entrega</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>

          {/* FORMULARIO */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 20 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>➕ Nuevo anticipo</div>

            {mensaje.texto && (
              <div style={{ background: mensaje.tipo === 'exito' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${mensaje.tipo === 'exito' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, borderRadius: 10, padding: '8px 12px', color: mensaje.tipo === 'exito' ? '#4ade80' : '#f87171', fontSize: 12, marginBottom: 12 }}>
                {mensaje.texto}
              </div>
            )}

            {[
              { label: 'Cliente *', content: (
                <select value={clienteSeleccionado} onChange={e => setClienteSeleccionado(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 12, outline: 'none' }}>
                  <option value="">-- Elige un cliente --</option>
                  {clientes.filter(c => c.rol !== 'admin').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )},
              { label: 'Fecha del anticipo *', content: (
                <input type="date" value={fechaAnticipo} onChange={e => setFechaAnticipo(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              )},
              { label: 'Estado de cuenta', content: (
                <select value={entregaSeleccionada} onChange={e => setEntregaSeleccionada(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 12, outline: 'none' }}>
                  <option value="">Ninguno / General</option>
                  {entregas.map(e => <option key={e.id} value={e.id}>Entrega {formatearFechaEntrega(e.fecha_entrega)}</option>)}
                </select>
              )},
              { label: 'Monto *', content: (
                <input type="number" placeholder="0.00" value={monto} onChange={e => setMonto(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              )},
              { label: 'Método', content: (
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Efectivo','Transferencia','Terminal'].map(m => (
                    <button key={m} onClick={() => setMetodoPago(m)}
                      style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${metodoPago === m ? 'rgba(193,85,58,0.4)' : 'rgba(255,255,255,0.08)'}`, background: metodoPago === m ? 'rgba(193,85,58,0.15)' : 'rgba(255,255,255,0.03)', color: metodoPago === m ? '#dd8a6c' : 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer', fontWeight: metodoPago === m ? 600 : 400 }}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            ].map((campo, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>{campo.label}</label>
                {campo.content}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => registrarAnticipo('limpiar')} disabled={loading}
                style={{ flex: 1, background: '#c1553a', border: 'none', borderRadius: 10, padding: '11px', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Guardando...' : '✓ Registrar y limpiar'}
              </button>
              <button onClick={() => registrarAnticipo('continuar')} disabled={loading}
                style={{ flex: 1, background: 'transparent', border: '1px solid rgba(193,85,58,0.5)', borderRadius: 10, padding: '11px', color: '#dd8a6c', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Guardando...' : '✓ Registrar y continuar'}
              </button>
            </div>
          </div>

          {/* HISTORIAL */}
          <div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 16, marginBottom: 12 }}>
              <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🔍 Filtrar historial</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 11, outline: 'none' }}>
                  <option value="">Todos los clientes</option>
                  {clientes.filter(c => c.rol !== 'admin').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={filtroEntrega} onChange={e => setFiltroEntrega(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', color: 'white', fontSize: 11, outline: 'none' }}>
                  <option value="">Todas las entregas</option>
                  {entregas.map(e => <option key={e.id} value={e.id}>Entrega {formatearFechaEntrega(e.fecha_entrega)}</option>)}
                </select>
              </div>
              {anticiposFiltrados.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{anticiposFiltrados.length} anticipo{anticiposFiltrados.length !== 1 ? 's' : ''}</span>
                  <span style={{ color: '#10b981', fontSize: 12, fontWeight: 700 }}>Total: {fmt(totalFiltrado)}</span>
                </div>
              )}
            </div>

            <div style={{ maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {anticiposFiltrados.length === 0 ? (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                  No hay anticipos registrados
                </div>
              ) : (
                anticiposFiltrados.map(a => (
                  <div key={a.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{a.clientes?.nombre}</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>📅 {formatearFecha(a.creado_en)}</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>📦 {getNombreEntrega(a.entrega_id)}</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>💳 {a.metodo}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {editando === a.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input type="number" value={montoEditar} onChange={e => setMontoEditar(e.target.value)}
                              style={{ width: 80, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', color: 'white', fontSize: 12, outline: 'none' }} />
                            <button onClick={() => guardarEdicion(a.id)}
                              style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 6, padding: '4px 8px', color: '#4ade80', fontSize: 10, cursor: 'pointer' }}>✓</button>
                            <button onClick={() => setEditando(null)}
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer' }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ color: '#10b981', fontSize: 15, fontWeight: 800 }}>{fmt(a.monto)}</div>
                        )}
                      </div>
                    </div>
                    {editando !== a.id && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => { setEditando(a.id); setMontoEditar(String(a.monto)) }}
                          style={{ flex: 1, background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 7, padding: '5px', color: '#dd8a6c', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => eliminarAnticipo(a.id)}
                          style={{ flex: 1, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 7, padding: '5px', color: '#f87171', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                          🗑️ Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 