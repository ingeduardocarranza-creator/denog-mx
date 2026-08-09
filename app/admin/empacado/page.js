'use client'
import { useState, useEffect, useMemo } from 'react'
import { clay } from '../../../lib/theme/colors'

const TIPO_EMPAQUE = {
  chico:   { label: 'Chico',   sub: 'Bolsa blanca o cartón', icon: '🥡', color: '#60a5fa' },
  mediano: { label: 'Mediano', sub: 'Bolsa blanca',          icon: '🛍️', color: '#facc15' },
  grande:  { label: 'Grande',  sub: 'Bolsa TJ Maxx',         icon: '🛒', color: '#fb923c' },
}

export default function Empacado() {
  const [entregas, setEntregas] = useState([])
  const [entregaId, setEntregaId] = useState('')
  const [pedidos, setPedidos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [tab, setTab] = useState('empacado') // 'empacado' | 'nollego' | 'fragil' | 'pendiente'
  const [indice, setIndice] = useState(0)
  const [procesando, setProcesando] = useState(false)
  const [fotoModal, setFotoModal] = useState(null)

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => {
      if (d.ok && (d.entregas || []).length > 0) {
        setEntregas(d.entregas)
        const futuras = d.entregas
          .filter(e => e.estado === 'futura')
          .sort((a, b) => new Date(a.fecha_entrega) - new Date(b.fecha_entrega))
        setEntregaId(String((futuras[0] || d.entregas[d.entregas.length - 1]).id))
      }
    })
  }, [])

  useEffect(() => {
    if (!entregaId) return
    cargarPedidos()
  }, [entregaId])

  const cargarPedidos = async () => {
    setCargando(true)
    const res = await fetch(`/api/reportes/pedidos?entrega_id=${entregaId}`)
    const data = await res.json()
    const ps = data.ok ? data.pedidos || [] : []
    setPedidos(ps)
    setIndice(0)
    setCargando(false)
  }

  // ── Agrupar pedidos activos de la entrega por cliente ──────────────
  const clientes = useMemo(() => {
    const activosEntrega = pedidos.filter(p => !['Entregado', 'Cancelado'].includes(p.estado))
    const porCliente = {}
    activosEntrega.forEach(p => {
      const cid = p.cliente_id
      if (!cid) return
      if (!porCliente[cid]) {
        porCliente[cid] = {
          cliente_id: cid,
          nombre: p.clientes?.nombre || 'Sin nombre',
          telefono: p.clientes?.telefono || '',
          todos: [],
        }
      }
      porCliente[cid].todos.push(p)
    })
    return Object.values(porCliente).map(c => {
      const noLlegoItems   = c.todos.filter(it => it.estado === 'no_llego')
      const fragilItems    = c.todos.filter(it => it.apartado_fragil && it.estado !== 'no_llego')
      const pendienteItems = c.todos.filter(it => it.estado === 'pendiente' && !it.apartado_fragil)
      const items          = c.todos.filter(it => !it.apartado_fragil && it.estado !== 'no_llego' && it.estado !== 'pendiente')
      const piezasBolsa    = items.reduce((s, it) => s + (it.cantidad || 1), 0)
      const piezasFragil   = fragilItems.reduce((s, it) => s + (it.cantidad || 1), 0)
      let status
      if (items.length === 0 && fragilItems.length === 0 && pendienteItems.length === 0) status = 'sin_llegar'
      else if (pendienteItems.length === 0 && items.every(it => it.estado === 'empacado')) status = 'empacado'
      else status = 'pendiente'
      const tipoEmpaque = items.find(it => it.tipo_empaque)?.tipo_empaque || null
      return { ...c, items, noLlegoItems, fragilItems, pendienteItems, piezasBolsa, piezasFragil, status, tipoEmpaque }
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [pedidos])

  const total           = clientes.length
  const countEmpacados  = clientes.filter(c => c.status === 'empacado').length
  const countSinLlegar  = clientes.filter(c => c.status === 'sin_llegar').length
  const countPendientes = total - countEmpacados - countSinLlegar
  const pct = (n) => total > 0 ? `${(n / total) * 100}%` : '0%'

  const clamp = (i) => Math.max(0, Math.min(total - 1, i))
  const irA   = (i) => setIndice(clamp(i))
  const cliente = clientes[indice] || null

  const noLlegoTodos = useMemo(() => {
    const flat = []
    clientes.forEach(c => c.noLlegoItems.forEach(it => flat.push({ ...it, clienteNombre: c.nombre })))
    return flat
  }, [clientes])

  const fragilTodos = useMemo(() => {
    const flat = []
    clientes.forEach(c => c.fragilItems.forEach(it => flat.push({ ...it, clienteNombre: c.nombre })))
    return flat
  }, [clientes])

  const pendienteTodos = useMemo(() => {
    const flat = []
    clientes.forEach(c => c.pendienteItems.forEach(it => flat.push({ ...it, clienteNombre: c.nombre })))
    return flat
  }, [clientes])

  // ── Acciones sobre pedidos ──────────────────────────────────────────
  const actualizarPedido = async (pedido, cambios) => {
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pedido, ...cambios })
    })
    const data = await res.json()
    if (data.ok) {
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, ...cambios } : p))
    }
    return data
  }

  const quitarDeLista = (id) => setPedidos(prev => prev.filter(p => p.id !== id))

  const toggleFragil    = (p) => actualizarPedido(p, { apartado_fragil: !p.apartado_fragil })
  const toggleNoLlego   = (p) => actualizarPedido(p, { estado: p.estado === 'no_llego' ? 'comprado' : 'no_llego' })
  const togglePendiente = (p) => actualizarPedido(p, { estado: p.estado === 'pendiente' ? 'comprado' : 'pendiente' })

  const setTipoEmpaqueCliente = async (tipo) => {
    if (!cliente || procesando) return
    const nuevoTipo = cliente.tipoEmpaque === tipo ? null : tipo
    for (const item of cliente.items) {
      await actualizarPedido(item, { tipo_empaque: nuevoTipo })
    }
  }

  const marcarClienteEmpacado = async () => {
    if (!cliente || procesando) return
    setProcesando(true)
    const nuevoEstado = cliente.status === 'empacado' ? 'comprado' : 'empacado'
    for (const item of cliente.items) {
      await actualizarPedido(item, { estado: nuevoEstado })
    }
    setProcesando(false)
    if (nuevoEstado === 'empacado') irA(indice + 1)
  }

  const siguienteEntrega = useMemo(() => {
    const actual = entregas.find(e => String(e.id) === String(entregaId))
    if (!actual) return null
    const futuras = entregas
      .filter(e => new Date(e.fecha_entrega) > new Date(actual.fecha_entrega))
      .sort((a, b) => new Date(a.fecha_entrega) - new Date(b.fecha_entrega))
    return futuras[0] || null
  }, [entregas, entregaId])

  const cancelarPedido = async (p) => {
    const data = await actualizarPedido(p, { estado: 'Cancelado' })
    if (data.ok) quitarDeLista(p.id)
  }
  const pasarASiguienteEntrega = async (p) => {
    if (!siguienteEntrega) return
    const data = await actualizarPedido(p, { entrega_id: siguienteEntrega.id, estado: 'comprado' })
    if (data.ok) quitarDeLista(p.id)
  }

  const fmtFechaEntrega = (e) => {
    const d = new Date(e.fecha_entrega + 'T12:00:00')
    const fecha = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    return `Entrega ${fecha}${e.nota ? ` · ${e.nota}` : ''}`
  }

  const pillPorStatus = {
    empacado:   { bg: 'rgba(52,211,153,0.15)', color: '#34d399', label: '✅ Empacado' },
    pendiente:  { bg: 'rgba(250,204,21,0.15)', color: '#facc15', label: '🟡 Pendiente' },
    sin_llegar: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', label: '⏳ Sin llegar' },
  }

  const navBtnStyle = { background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }

  const tabBtn = (key, label, count, color = clay[500]) => (
    <button key={key} onClick={() => setTab(key)}
      style={{
        background: tab === key ? `rgba(${color === clay[500] ? '193,85,58' : color === '#facc15' ? '250,204,21' : color === '#f97316' ? '249,115,22' : '251,191,36'},0.14)` : 'transparent',
        color: tab === key ? color : 'rgba(255,255,255,0.55)',
        border: 'none',
        borderBottom: tab === key ? `2px solid ${color}` : '2px solid transparent',
        borderRadius: '10px 10px 0 0',
        padding: '12px 18px', fontSize: 15,
        fontWeight: tab === key ? 700 : 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
      }}>
      {label}
      {count > 0 && (
        <span style={{ background: color, color: color === '#facc15' ? '#0f172a' : '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{count}</span>
      )}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#ffffff', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", padding: '28px 32px 64px' }}>

      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 6 }}>Panel Admin · Denog USA Compras</div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>Empacado</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Entrega a empacar</label>
          <select value={entregaId} onChange={e => setEntregaId(e.target.value)}
            style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '12px 16px', fontSize: 15, fontWeight: 600, minWidth: 280, cursor: 'pointer' }}>
            {entregas.map(e => <option key={e.id} value={e.id} style={{ background: '#0f172a' }}>{fmtFechaEntrega(e)}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
        {tabBtn('empacado',  '📦 Empacado', 0, clay[500])}
        {tabBtn('fragil',    '⚠️ Artículos frágiles', fragilTodos.length, '#facc15')}
        {tabBtn('pendiente', '⏸ Pendientes', pendienteTodos.length, '#f97316')}
        {tabBtn('nollego',   '❌ Sin llegar', noLlegoTodos.length, '#ef4444')}
      </div>

      {cargando && <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>Cargando...</div>}

      {/* ============ TAB EMPACADO ============ */}
      {!cargando && tab === 'empacado' && (
        <div>
          {total === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>Sin clientes por empacar en esta entrega.</div>
          ) : (
            <>
              {/* Progreso */}
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    Cliente <span style={{ color: clay[300], fontWeight: 800 }}>{indice + 1}</span> de {total}
                  </div>
                  <div style={{ display: 'flex', gap: 22, fontSize: 14 }}>
                    <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#34d399', marginRight: 7 }} />Empacados: <b>{countEmpacados}</b></span>
                    <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: '#facc15', marginRight: 7 }} />Pendientes: <b>{countPendientes}</b></span>
                    <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', marginRight: 7 }} />Sin llegar: <b>{countSinLlegar}</b></span>
                  </div>
                </div>
                <div style={{ marginTop: 12, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', background: '#34d399', width: pct(countEmpacados) }} />
                  <div style={{ height: '100%', background: '#facc15', width: pct(countPendientes) }} />
                </div>
              </div>

              {/* Navegación */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <button onClick={() => irA(0)} style={navBtnStyle}>⏮ Primero</button>
                <button onClick={() => irA(indice - 10)} style={navBtnStyle}>−10</button>
                <button onClick={() => irA(indice - 1)} style={navBtnStyle}>◀ Ant</button>
                <input type="number" value={indice + 1}
                  onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) irA(v - 1) }}
                  style={{ width: 76, textAlign: 'center', background: 'rgba(193,85,58,0.12)', color: '#fff', border: `1px solid ${clay[500]}`, borderRadius: 10, padding: '10px 8px', fontSize: 15, fontWeight: 700 }} />
                <button onClick={() => irA(indice + 1)} style={navBtnStyle}>Sig ▶</button>
                <button onClick={() => irA(indice + 10)} style={navBtnStyle}>+10</button>
                <button onClick={() => irA(total - 1)} style={navBtnStyle}>Último ⏭</button>
              </div>

              {/* Card de cliente */}
              {cliente && (
                <div style={{ maxWidth: 820, margin: '0 auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>

                  {/* Header */}
                  <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{cliente.nombre}</div>
                      <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>📞 {cliente.telefono || '—'}</div>
                    </div>
                    <div style={{ flex: 'none', background: pillPorStatus[cliente.status].bg, color: pillPorStatus[cliente.status].color, borderRadius: 999, padding: '8px 16px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {pillPorStatus[cliente.status].label}
                    </div>
                  </div>

                  {/* Selector de tipo de empaque */}
                  <div style={{ padding: '16px 20px 0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Tipo de empaque de esta bolsa</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {Object.entries(TIPO_EMPAQUE).map(([key, meta]) => {
                        const activo = cliente.tipoEmpaque === key
                        return (
                          <button key={key} onClick={() => setTipoEmpaqueCliente(key)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              padding: '12px 10px', borderRadius: 12, cursor: 'pointer',
                              background: activo ? `${meta.color}26` : 'rgba(255,255,255,0.04)',
                              border: `1.5px solid ${activo ? meta.color : 'rgba(255,255,255,0.14)'}`,
                              color: activo ? meta.color : 'rgba(255,255,255,0.7)',
                            }}>
                            <span style={{ fontSize: 18 }}>{meta.icon}</span>
                            <span style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{meta.label}</div>
                              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75, lineHeight: 1.2 }}>{meta.sub}</div>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Banner de piezas */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 16px', marginBottom: 4, background: 'linear-gradient(90deg,rgba(193,85,58,0.16),rgba(193,85,58,0.04))', border: `1px solid rgba(193,85,58,0.35)`, borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ flex: 'none', width: 52, height: 52, borderRadius: 12, background: clay[500], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📦</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>Piezas a empacar en bolsa</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>No incluye artículos frágiles (se entregan aparte)</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
                        <div style={{ textAlign: 'center', background: 'rgba(193,85,58,0.2)', border: `1px solid rgba(193,85,58,0.5)`, borderRadius: 12, padding: '8px 24px', minWidth: 100 }}>
                          <div style={{ fontSize: 40, fontWeight: 900, color: clay[300], lineHeight: 1 }}>{cliente.piezasBolsa}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>piezas</div>
                        </div>
                        {cliente.piezasFragil > 0 && (
                          <div style={{ textAlign: 'center', background: 'rgba(250,204,21,0.16)', border: '1px solid rgba(250,204,21,0.5)', borderRadius: 12, padding: '8px 20px', minWidth: 92 }}>
                            <div style={{ fontSize: 40, fontWeight: 900, color: '#facc15', lineHeight: 1 }}>{cliente.piezasFragil}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>⚠️ aparte</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lista de artículos normales */}
                    {cliente.items.map(item => (
                      <div key={item.id} style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                            {item.imagen_url && (
                              <img src={item.imagen_url} alt={item.descripcion}
                                onClick={() => setFotoModal({ url: item.imagen_url, descripcion: item.descripcion })}
                                style={{ flex: 'none', width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: '#1e293b', cursor: 'zoom-in' }} />
                            )}
                            <div style={{ flex: 'none', minWidth: 40, height: 40, padding: '0 8px', borderRadius: 10, background: 'rgba(193,85,58,0.15)', color: clay[300], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>×{item.cantidad || 1}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 17, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{item.descripcion}</div>
                              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Cantidad: {item.cantidad || 1} pza(s)</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button onClick={() => toggleFragil(item)}
                              style={{ background: 'rgba(250,204,21,0.08)', color: '#facc15', border: '1px solid rgba(250,204,21,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ⚠️ Frágil
                            </button>
                            <button onClick={() => togglePendiente(item)}
                              style={{ background: 'rgba(249,115,22,0.08)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ⏸ Pendiente
                            </button>
                            <button onClick={() => toggleNoLlego(item)}
                              style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              ❌ No llegó
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {cliente.items.length === 0 && cliente.fragilItems.length === 0 && cliente.pendienteItems.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '28px 20px', color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>
                        Todos los artículos están en sin llegar, frágiles o pendientes.
                      </div>
                    )}
                  </div>

                  {/* Movidos a Frágiles */}
                  {cliente.fragilItems.length > 0 && (
                    <div style={{ padding: '0 20px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#facc15', padding: '0 6px 2px' }}>⚠️ Artículos frágiles</div>
                      {cliente.fragilItems.map(it => (
                        <div key={it.id} style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            {it.imagen_url && (
                              <img src={it.imagen_url} alt={it.descripcion}
                                onClick={() => setFotoModal({ url: it.imagen_url, descripcion: it.descripcion })}
                                style={{ flex: 'none', width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(250,204,21,0.4)', cursor: 'zoom-in' }} />
                            )}
                            <div style={{ fontSize: 14, color: '#facc15', fontWeight: 600 }}>{it.descripcion} · ×{it.cantidad || 1}</div>
                          </div>
                          <button onClick={() => toggleFragil(it)}
                            style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↩ Quitar frágil
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Movidos a Pendientes */}
                  {cliente.pendienteItems.length > 0 && (
                    <div style={{ padding: '0 20px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f97316', padding: '0 6px 2px' }}>⏸ Artículos pendientes</div>
                      {cliente.pendienteItems.map(it => (
                        <div key={it.id} style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: 14, color: '#f97316', fontWeight: 600 }}>{it.descripcion} · ×{it.cantidad || 1}</div>
                          <button onClick={() => togglePendiente(it)}
                            style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↩ Regresar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Movidos a sin llegar */}
                  {cliente.noLlegoItems.length > 0 && (
                    <div style={{ padding: '0 20px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#ef4444', padding: '0 6px 2px' }}>❌ Sin llegar</div>
                      {cliente.noLlegoItems.map(it => (
                        <div key={it.id} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                            <span style={{ textDecoration: 'line-through' }}>{it.descripcion}</span> · ×{it.cantidad || 1}
                          </div>
                          <button onClick={() => toggleNoLlego(it)}
                            style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            ↩ Regresar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acción */}
                  <div style={{ padding: '8px 20px 24px' }}>
                    <button onClick={marcarClienteEmpacado} disabled={procesando}
                      style={{
                        width: '100%', border: 'none', borderRadius: 12, padding: 18, fontSize: 18, fontWeight: 800, cursor: procesando ? 'wait' : 'pointer',
                        background: cliente.status === 'empacado' ? 'rgba(52,211,153,0.15)' : '#34d399',
                        color: cliente.status === 'empacado' ? '#34d399' : '#0f172a',
                        boxShadow: cliente.status === 'empacado' ? 'none' : '0 6px 20px rgba(52,211,153,0.25)',
                        opacity: procesando ? 0.6 : 1,
                      }}>
                      {cliente.status === 'empacado' ? '✅ Cliente empacado — clic para desmarcar' : '✅ Cliente empacado'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ TAB ARTÍCULOS FRÁGILES ============ */}
      {!cargando && tab === 'fragil' && (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Artículos frágiles</h2>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{fragilTodos.length} artículo(s) en esta entrega</div>
          </div>

          {fragilTodos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {fragilTodos.map(row => (
                <div key={row.id} style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.28)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                    {row.imagen_url && (
                      <img src={row.imagen_url} alt={row.descripcion}
                        onClick={() => setFotoModal({ url: row.imagen_url, descripcion: row.descripcion })}
                        style={{ flex: 'none', width: 72, height: 72, objectFit: 'cover', borderRadius: 10, border: '2px solid rgba(250,204,21,0.5)', cursor: 'zoom-in' }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{row.descripcion}</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
                        <span style={{ color: '#facc15', fontWeight: 600 }}>Cliente:</span> {row.clienteNombre} · Cant. {row.cantidad || 1}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => toggleFragil(row)}
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ↩ Quitar frágil
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Ningún artículo marcado como frágil.</div>
            </div>
          )}
        </div>
      )}

      {/* ============ TAB PENDIENTES ============ */}
      {!cargando && tab === 'pendiente' && (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Artículos pendientes</h2>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{pendienteTodos.length} artículo(s) en esta entrega</div>
          </div>

          {pendienteTodos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendienteTodos.map(row => (
                <div key={row.id} style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.28)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                    {row.imagen_url && (
                      <img src={row.imagen_url} alt={row.descripcion}
                        onClick={() => setFotoModal({ url: row.imagen_url, descripcion: row.descripcion })}
                        style={{ flex: 'none', width: 60, height: 60, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(249,115,22,0.4)', cursor: 'zoom-in' }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{row.descripcion}</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
                        <span style={{ color: '#f97316', fontWeight: 600 }}>Cliente:</span> {row.clienteNombre} · Cant. {row.cantidad || 1}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => togglePendiente(row)}
                    style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    ↩ Regresar a lista
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Ningún artículo marcado como pendiente.</div>
            </div>
          )}
        </div>
      )}

      {/* ============ TAB ARTÍCULOS SIN LLEGAR ============ */}
      {!cargando && tab === 'nollego' && (
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Artículos sin llegar</h2>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{noLlegoTodos.length} artículo(s) en esta entrega</div>
          </div>

          {noLlegoTodos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {noLlegoTodos.map(row => (
                <div key={row.id} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{row.descripcion}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>Cliente:</span> {row.clienteNombre} · Cant. {row.cantidad || 1}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
                    <button onClick={() => cancelarPedido(row)}
                      style={{ background: 'rgba(239,68,68,0.14)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      🚫 Cancelar pedido
                    </button>
                    <button onClick={() => pasarASiguienteEntrega(row)} disabled={!siguienteEntrega}
                      title={siguienteEntrega ? '' : 'No hay una entrega posterior disponible'}
                      style={{ background: 'rgba(193,85,58,0.14)', color: clay[300], border: `1px solid rgba(193,85,58,0.5)`, borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: siguienteEntrega ? 'pointer' : 'not-allowed', opacity: siguienteEntrega ? 1 : 0.5 }}>
                      📅 Pasar a siguiente entrega
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Ningún artículo marcado como "No llegó".</div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {fotoModal && (
        <div onClick={() => setFotoModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 14, textAlign: 'center', maxWidth: 500 }}>{fotoModal.descripcion}</div>
          <img src={fotoModal.url} alt={fotoModal.descripcion}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }} />
          <button onClick={() => setFotoModal(null)}
            style={{ marginTop: 20, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}
