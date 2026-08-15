'use client'
import { useState, useEffect, useCallback } from 'react'
import { paraWaMe } from '@/lib/whatsapp/telefono'

const TIPOS = [
  { id: 'comprobante', label: 'Comprobantes', icon: '💸' },
  { id: 'pedido_especifico', label: 'Pedidos', icon: '🧾' },
  { id: 'sin_responder', label: 'Sin responder', icon: '⏱️' },
]

function haceCuanto(fecha) {
  const ms = Date.now() - new Date(fecha).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'justo ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function colorUrgencia(fecha) {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min >= 60) return '#f87171'
  if (min >= 15) return '#fbbf24'
  return 'rgba(255,255,255,0.4)'
}

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`

function fechaLocalHoy() {
  const hoy = new Date()
  return new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}

// La entrega "en curso": la próxima por fecha que no haya pasado, o si ya
// todas pasaron, la más reciente. Es solo la propuesta inicial — la persona
// que aprueba el pago puede cambiarla.
function entregaPorDefecto(entregas) {
  if (!entregas?.length) return ''
  const hoy = fechaLocalHoy()
  const futuras = entregas.filter(e => e.fecha_entrega >= hoy).sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega))
  if (futuras.length) return futuras[0].id
  return [...entregas].sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega))[0].id
}

export default function Pendientes() {
  const [tab, setTab] = useState('comprobante')
  const [vista, setVista] = useState('activos') // 'activos' | 'resueltos'
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [form, setForm] = useState({
    tipo: 'comprobante', telefono_whatsapp: '', nombre_whatsapp: '',
    resumen: '', monto: '', monto_no_coincide: false,
  })

  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [descarteReciente, setDescarteReciente] = useState(null) // { id, resumen } para el "Deshacer"
  const [aprobando, setAprobando] = useState(null) // id del pendiente en aprobación
  const [formAprobar, setFormAprobar] = useState(null)
  const [guardandoPago, setGuardandoPago] = useState(false)

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/pendientes?vista=${vista}`)
    const data = await res.json()
    if (data.ok) setPendientes(data.pendientes)
    setCargando(false)
  }, [vista])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 20000)
    return () => clearInterval(intervalo)
  }, [cargar])

  // El aviso de "Deshacer" se va solo a los 8 segundos.
  useEffect(() => {
    if (!descarteReciente) return
    const t = setTimeout(() => setDescarteReciente(null), 8000)
    return () => clearTimeout(t)
  }, [descarteReciente])

  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => setClientes(d.clientes || []))
    fetch('/api/entregas').then(r => r.json()).then(d => setEntregas(d.entregas || []))
  }, [])

  const abrirAprobar = (p) => {
    setAprobando(p.id)
    setFormAprobar({
      cliente_id: p.cliente_id || '',
      nombre_suelto: p.cliente_id ? '' : (p.nombre_whatsapp || ''),
      telefono_suelto: p.cliente_id ? '' : p.telefono_whatsapp,
      monto: p.monto != null ? String(p.monto) : '',
      entrega_id: entregaPorDefecto(entregas),
      creado_en: fechaLocalHoy(),
    })
  }

  const confirmarAprobar = async (pendiente_id) => {
    if (!formAprobar.monto || Number(formAprobar.monto) <= 0) { setMensaje('Falta el monto'); return }
    if (!formAprobar.cliente_id && !formAprobar.nombre_suelto) { setMensaje('Falta el cliente o un nombre'); return }
    setGuardandoPago(true)
    const res = await fetch('/api/pendientes/aprobar-comprobante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pendiente_id,
        cliente_id: formAprobar.cliente_id || null,
        nombre_suelto: formAprobar.nombre_suelto || null,
        telefono_suelto: formAprobar.telefono_suelto || null,
        entrega_id: formAprobar.entrega_id || null,
        monto: Number(formAprobar.monto),
        creado_en: formAprobar.creado_en ? `${formAprobar.creado_en}T12:00:00.000Z` : undefined,
      }),
    })
    const data = await res.json()
    setGuardandoPago(false)
    if (!data.ok) { setMensaje(data.mensaje || 'Error al aprobar'); return }
    setAprobando(null)
    setFormAprobar(null)
    setMensaje('')
    cargar()
  }

  const accion = async (id, accion) => {
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    })
    cargar()
  }

  // "Esto no era": saca el pendiente de la lista de un solo clic, sin
  // confirmación previa, y ofrece deshacer unos segundos. Se prefirió esto a
  // la doble confirmación porque el descarte va a ser frecuente (el
  // clasificador genera de más a propósito) y confirmar cada vez estorba;
  // el deshacer solo aparece cuando hizo falta. No borra: ver
  // docs/PENDIENTES.md §7.
  const descartar = async (id) => {
    const previo = pendientes.find(p => p.id === id)
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'descartar' }),
    })
    setDescarteReciente({ id, resumen: previo?.resumen || '' })
    cargar()
  }

  const deshacerDescarte = async () => {
    if (!descarteReciente) return
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: descarteReciente.id, accion: 'restaurar' }),
    })
    setDescarteReciente(null)
    cargar()
  }

  const agregarAMano = async () => {
    if (!form.telefono_whatsapp || !form.resumen) {
      setMensaje('Falta teléfono o resumen'); return
    }
    setGuardando(true)
    const res = await fetch('/api/pendientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        monto: form.tipo === 'comprobante' && form.monto ? Number(form.monto) : null,
      }),
    })
    const data = await res.json()
    setGuardando(false)
    if (!data.ok) { setMensaje(data.mensaje || 'Error al guardar'); return }
    setForm({ tipo: 'comprobante', telefono_whatsapp: '', nombre_whatsapp: '', resumen: '', monto: '', monto_no_coincide: false })
    setMostrarForm(false)
    setMensaje('')
    cargar()
  }

  const filtrados = pendientes.filter(p => p.tipo === tab)
  const conteos = TIPOS.reduce((acc, t) => {
    acc[t.id] = pendientes.filter(p => p.tipo === t.id).length
    return acc
  }, {})

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>🔔 Pendientes</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>Lo que llegó por WhatsApp y falta atender</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setVista(v => v === 'activos' ? 'resueltos' : 'activos')}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {vista === 'activos' ? '🕘 Ver resueltos' : '← Ver activos'}
            </button>
            {vista === 'activos' && (
              <button onClick={() => setVista('descartados')} title="Lo que la IA no debió generar — sirve para afinarla"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                🚫 Descartados
              </button>
            )}
            {vista === 'activos' && (
              <button onClick={() => setMostrarForm(m => !m)}
                style={{ background: 'rgba(193,85,58,0.15)', border: '1px solid rgba(193,85,58,0.3)', borderRadius: 10, padding: '8px 14px', color: '#dd8a6c', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                ➕ Agregar a mano
              </button>
            )}
          </div>
        </div>

        {mostrarForm && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Agregar pendiente a mano</div>
            {mensaje && <div style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{mensaje}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={inputStyle}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <input placeholder="Teléfono (10 dígitos)" value={form.telefono_whatsapp} onChange={e => setForm({ ...form, telefono_whatsapp: e.target.value })} style={inputStyle} />
              <input placeholder="Nombre (si se sabe)" value={form.nombre_whatsapp} onChange={e => setForm({ ...form, nombre_whatsapp: e.target.value })} style={inputStyle} />
              {form.tipo === 'comprobante' && (
                <input placeholder="Monto" type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} style={inputStyle} />
              )}
            </div>
            <textarea placeholder="Resumen (ej. transferencia de $450, banco BBVA)" value={form.resumen} onChange={e => setForm({ ...form, resumen: e.target.value })}
              style={{ ...inputStyle, minHeight: 60, marginBottom: 10, resize: 'vertical' }} />
            {form.tipo === 'comprobante' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 12 }}>
                <input type="checkbox" checked={form.monto_no_coincide} onChange={e => setForm({ ...form, monto_no_coincide: e.target.checked })} />
                El monto no coincide con lo que debe
              </label>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={agregarAMano} disabled={guardando}
                style={{ flex: 1, background: '#c1553a', border: 'none', borderRadius: 10, padding: '10px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                {guardando ? 'Guardando...' : '✓ Agregar'}
              </button>
              <button onClick={() => setMostrarForm(false)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {TIPOS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${tab === t.id ? 'rgba(193,85,58,0.4)' : 'rgba(255,255,255,0.08)'}`,
                background: tab === t.id ? 'rgba(193,85,58,0.15)' : 'rgba(255,255,255,0.03)',
                color: tab === t.id ? '#dd8a6c' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              }}>
              {t.icon} {t.label} {vista === 'activos' && conteos[t.id] > 0 && (
                <span style={{ background: 'rgba(248,113,113,0.2)', color: '#f87171', borderRadius: 8, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{conteos[t.id]}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cargando ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: 40 }}>Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              {vista === 'activos' ? '✓ Nada pendiente por aquí'
                : vista === 'descartados' ? 'Nada descartado en esta categoría'
                : 'Sin historial en esta categoría'}
            </div>
          ) : (
            filtrados.map(p => {
              const nombre = p.clientes?.nombre || p.nombre_whatsapp || p.telefono_whatsapp
              const wa = paraWaMe(p.telefono_whatsapp)
              return (
                <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{nombre}</div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{p.resumen}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: colorUrgencia(p.creado_en), fontSize: 10, fontWeight: 600 }}>
                          {vista === 'activos' ? haceCuanto(p.creado_en)
                            : vista === 'descartados' ? haceCuanto(p.descartado_en)
                            : haceCuanto(p.resuelto_en)}
                        </span>
                        {p.estado === 'visto' && p.atendido?.nombre && (
                          <span style={{ color: '#dd8a6c', fontSize: 10, background: 'rgba(193,85,58,0.12)', borderRadius: 8, padding: '2px 7px' }}>
                            👀 Viendo: {p.atendido.nombre}
                          </span>
                        )}
                        {vista === 'resueltos' && p.resuelto?.nombre && (
                          <span style={{ color: '#4ade80', fontSize: 10, background: 'rgba(74,222,128,0.1)', borderRadius: 8, padding: '2px 7px' }}>
                            ✓ Resuelto por {p.resuelto.nombre}
                          </span>
                        )}
                        {vista === 'descartados' && p.descartado?.nombre && (
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '2px 7px' }}>
                            🚫 Descartado por {p.descartado.nombre}
                          </span>
                        )}
                      </div>
                    </div>
                    {p.tipo === 'comprobante' && p.monto != null && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: p.monto_no_coincide ? '#f87171' : '#10b981', fontSize: 15, fontWeight: 800 }}>{fmt(p.monto)}</div>
                        {p.monto_no_coincide && <div style={{ color: '#f87171', fontSize: 9, marginTop: 2 }}>⚠️ no coincide</div>}
                      </div>
                    )}
                  </div>

                  {p.imagen_url && (
                    <a href={p.imagen_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 10 }}>
                      <img src={p.imagen_url} alt="Comprobante" style={{ maxHeight: 160, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                    </a>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, textAlign: 'center', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 8, padding: '7px', color: '#25D366', fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                      💬 Abrir chat
                    </a>
                    {vista === 'activos' && p.estado === 'nuevo' && (
                      <button onClick={() => accion(p.id, 'ver')}
                        style={{ flex: 1, background: 'rgba(193,85,58,0.1)', border: '1px solid rgba(193,85,58,0.25)', borderRadius: 8, padding: '7px', color: '#dd8a6c', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        👀 Yo lo veo
                      </button>
                    )}
                    {vista === 'activos' && p.tipo === 'comprobante' && (
                      <button onClick={() => aprobando === p.id ? setAprobando(null) : abrirAprobar(p)}
                        style={{ flex: 1, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '7px', color: '#10b981', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        💳 {aprobando === p.id ? 'Cancelar' : 'Aprobar pago'}
                      </button>
                    )}
                    {vista === 'activos' && p.tipo !== 'comprobante' && (
                      <button onClick={() => accion(p.id, 'resolver')}
                        style={{ flex: 1, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '7px', color: '#4ade80', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ✅ Listo
                      </button>
                    )}
                    {vista === 'activos' && (
                      <button onClick={() => descartar(p.id)} title="La IA no debió generar esto"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        🚫 Esto no era
                      </button>
                    )}
                    {vista === 'resueltos' && (
                      <button onClick={() => accion(p.id, 'reabrir')}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ↺ Reabrir
                      </button>
                    )}
                    {vista === 'descartados' && (
                      <button onClick={() => accion(p.id, 'restaurar')}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ↺ Devolver a la lista
                      </button>
                    )}
                  </div>

                  {aprobando === p.id && formAprobar && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Monto</label>
                          <input type="number" value={formAprobar.monto} onChange={e => setFormAprobar({ ...formAprobar, monto: e.target.value })}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Fecha</label>
                          <input type="date" value={formAprobar.creado_en} onChange={e => setFormAprobar({ ...formAprobar, creado_en: e.target.value })}
                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      </div>

                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Cliente</label>
                        <select value={formAprobar.cliente_id} onChange={e => setFormAprobar({ ...formAprobar, cliente_id: e.target.value })}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none' }}>
                          <option value="">— Cliente sin cuenta en el sitio —</option>
                          {clientes.filter(c => c.rol !== 'admin').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        {!formAprobar.cliente_id && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                            <input placeholder="Nombre" value={formAprobar.nombre_suelto} onChange={e => setFormAprobar({ ...formAprobar, nombre_suelto: e.target.value })}
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none' }} />
                            <input placeholder="Teléfono" value={formAprobar.telefono_suelto} onChange={e => setFormAprobar({ ...formAprobar, telefono_suelto: e.target.value })}
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none' }} />
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }}>Estado de cuenta (a qué entrega se abona)</label>
                        <select value={formAprobar.entrega_id} onChange={e => setFormAprobar({ ...formAprobar, entrega_id: e.target.value })}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: 'white', fontSize: 12, outline: 'none' }}>
                          <option value="">Ninguno / General</option>
                          {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega} {e.nota ? `— ${e.nota}` : ''}</option>)}
                        </select>
                      </div>

                      {mensaje && <div style={{ color: '#f87171', fontSize: 11 }}>{mensaje}</div>}

                      <button onClick={() => confirmarAprobar(p.id)} disabled={guardandoPago}
                        style={{ background: '#10b981', border: 'none', borderRadius: 8, padding: '9px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: guardandoPago ? 0.6 : 1 }}>
                        {guardandoPago ? 'Guardando...' : '✓ Confirmar y registrar pago'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Aviso flotante de "Deshacer" — reemplaza a la doble confirmación:
          no estorba cuando el descarte era correcto (que será casi siempre)
          y protege igual cuando fue error de dedo. */}
      {descarteReciente && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 14, background: '#1c1c22', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '11px 16px', boxShadow: '0 8px 28px rgba(0,0,0,0.5)', maxWidth: 'calc(100vw - 32px)' }}>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            🚫 Descartado{descarteReciente.resumen ? `: ${descarteReciente.resumen}` : ''}
          </span>
          <button onClick={deshacerDescarte}
            style={{ background: 'rgba(193,85,58,0.18)', border: '1px solid rgba(193,85,58,0.35)', borderRadius: 8, padding: '6px 12px', color: '#dd8a6c', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            ↺ Deshacer
          </button>
        </div>
      )}
    </div>
  )
}
