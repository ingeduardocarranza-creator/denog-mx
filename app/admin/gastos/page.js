'use client'
import { useState, useEffect } from 'react'

const CATEGORIAS = ['Gasolina', 'Hotel', 'Comida', 'Casetas/Peaje', 'Otro']

const fmt = (n) => {
  const v = Number(n || 0)
  const centavos = Math.abs(v % 1) > 0.004
  return `$${v.toLocaleString('es-MX', {
    minimumFractionDigits: centavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

const formatearFecha = (fecha) => {
  if (!fecha) return ''
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d = new Date(fecha + 'T12:00:00')
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

const getFechaLocal = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
}

export default function AdminGastos() {
  const [vista, setVista] = useState('pendientes')
  const [gastos, setGastos] = useState([])
  const [devoluciones, setDevoluciones] = useState([])
  const [cargandoDevoluciones, setCargandoDevoluciones] = useState(false)
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [edicion, setEdicion] = useState({}) // { [id]: { monto, categoria, descripcion, fecha_gasto, entrega_id } }
  const [guardando, setGuardando] = useState(null)
  const [msg, setMsg] = useState('')

  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ monto: '', categoria: 'Gasolina', descripcion: '', fecha_gasto: getFechaLocal(), entrega_id: '' })

  useEffect(() => {
    if (vista === 'devoluciones') cargarDevoluciones()
    else cargar()
  }, [vista])

  const cargarDevoluciones = async () => {
    setCargandoDevoluciones(true)
    const res = await fetch('/api/compras/devoluciones')
    const data = await res.json()
    if (data.ok) setDevoluciones(data.devoluciones)
    setCargandoDevoluciones(false)
  }
  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => {
      if (d.ok) setEntregas(d.entregas.sort((a, b) => new Date(b.fecha_entrega) - new Date(a.fecha_entrega)))
    })
  }, [])

  const cargar = async () => {
    setCargando(true)
    const res = await fetch(`/api/gastos?vista=${vista}`)
    const data = await res.json()
    if (data.ok) {
      setGastos(data.gastos)
      const base = {}
      for (const g of data.gastos) {
        base[g.id] = {
          monto: g.monto ?? '',
          categoria: g.categoria || 'Otro',
          descripcion: g.descripcion || '',
          fecha_gasto: g.fecha_gasto || getFechaLocal(),
          entrega_id: g.entrega_id || '',
        }
      }
      setEdicion(base)
    }
    setCargando(false)
  }

  const cambiar = (id, campo, valor) => {
    setEdicion(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }

  const aprobar = async (id) => {
    const e = edicion[id]
    if (!e?.monto) { setMsg('Falta el monto'); return }
    setGuardando(id)
    setMsg('')
    const res = await fetch('/api/gastos/aprobar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        monto: Number(e.monto),
        categoria: e.categoria,
        descripcion: e.descripcion,
        fecha_gasto: e.fecha_gasto,
        entrega_id: e.entrega_id || null,
      }),
    })
    const data = await res.json()
    setGuardando(null)
    if (data.ok) { setMsg('✓ Gasto aprobado'); cargar() } else { setMsg(data.mensaje || 'Error') }
  }

  const rechazar = async (id) => {
    const motivo = window.prompt('¿Por qué se rechaza este gasto? (opcional)') || ''
    setGuardando(id)
    const res = await fetch('/api/gastos/rechazar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, motivo }),
    })
    const data = await res.json()
    setGuardando(null)
    if (data.ok) { setMsg('Gasto rechazado'); cargar() } else { setMsg(data.mensaje || 'Error') }
  }

  const crear = async () => {
    if (!form.monto) { setMsg('Falta el monto'); return }
    const res = await fetch('/api/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, monto: Number(form.monto), entrega_id: form.entrega_id || null }),
    })
    const data = await res.json()
    if (data.ok) {
      setMsg('✓ Gasto agregado, pendiente de aprobar')
      setForm({ monto: '', categoria: 'Gasolina', descripcion: '', fecha_gasto: getFechaLocal(), entrega_id: '' })
      setMostrarForm(false)
      setVista('pendientes')
      cargar()
    } else {
      setMsg(data.mensaje || 'Error')
    }
  }

  const tarjeta = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
  const input = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }
  const btn = { border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Gastos del negocio</div>
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>Capturados por WhatsApp o a mano — todos pasan por aprobación</div>
          </div>
          <button
            onClick={() => setMostrarForm(v => !v)}
            style={{ ...btn, background: 'var(--marca)', color: '#fff' }}
          >
            {mostrarForm ? 'Cancelar' : '+ Agregar a mano'}
          </button>
        </div>

        {msg && (
          <div style={{ color: 'var(--tinta)', fontSize: 13, marginBottom: 14, background: 'var(--w03)', borderRadius: 8, padding: '8px 12px' }}>{msg}</div>
        )}

        {mostrarForm && (
          <div style={{ ...tarjeta, padding: 18, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 11, marginBottom: 4 }}>Monto</div>
              <input style={input} type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 11, marginBottom: 4 }}>Categoría</div>
              <select style={input} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ color: 'var(--w40)', fontSize: 11, marginBottom: 4 }}>Descripción</div>
              <input style={{ ...input, width: '100%' }} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="ej. Gasolina - Circle K" />
            </div>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 11, marginBottom: 4 }}>Fecha</div>
              <input style={input} type="date" value={form.fecha_gasto} onChange={e => setForm({ ...form, fecha_gasto: e.target.value })} />
            </div>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 11, marginBottom: 4 }}>Entrega/viaje (opcional)</div>
              <select style={input} value={form.entrega_id} onChange={e => setForm({ ...form, entrega_id: e.target.value })}>
                <option value="">General (sin viaje)</option>
                {entregas.map(e => <option key={e.id} value={e.id}>{formatearFecha(e.fecha_entrega)}{e.nota ? ` — ${e.nota}` : ''}</option>)}
              </select>
            </div>
            <button onClick={crear} style={{ ...btn, background: 'var(--verde)', color: '#fff' }}>Guardar</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['pendientes', 'Por aprobar'], ['historial', 'Historial'], ['devoluciones', 'Devoluciones (compras EUA)']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              style={{
                ...btn,
                background: vista === v ? 'var(--marca)' : 'var(--w05)',
                color: vista === v ? '#fff' : 'var(--w40)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {vista === 'devoluciones' ? (
          cargandoDevoluciones ? (
            <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
          ) : devoluciones.length === 0 ? (
            <div style={{ color: 'var(--w40)', fontSize: 13 }}>Sin devoluciones registradas. Se marcan desde el pedido, en Encargos → Pedidos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...tarjeta, padding: '10px 16px', color: 'var(--w40)', fontSize: 12.5 }}>
                Reembolsos totales: {fmt(devoluciones.reduce((s, d) => s + (Number(d.reembolso_usd) || 0), 0))} USD — no se convierte a pesos ni se resta de Gastos automáticamente.
              </div>
              {devoluciones.map(d => (
                <div key={d.id} style={{ ...tarjeta, padding: 16 }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 700 }}>{d.descripcion || '(sin descripción)'}</div>
                  <div style={{ color: 'var(--w40)', fontSize: 12, marginTop: 4 }}>
                    {d.cliente?.nombre ? `Cliente: ${d.cliente.nombre} · ` : ''}{d.lugar_compra || ''}
                    {d.entregas?.fecha_entrega && ` · Viaje ${formatearFecha(d.entregas.fecha_entrega)}`}
                  </div>
                  <div style={{ color: 'var(--w32)', fontSize: 11.5, marginTop: 6 }}>
                    Devuelto {d.devuelto_en ? formatearFecha(d.devuelto_en.slice(0, 10)) : ''}{d.devuelto_por_nombre?.nombre ? ` por ${d.devuelto_por_nombre.nombre}` : ''}
                    {d.devuelto_motivo && ` — ${d.devuelto_motivo}`}
                  </div>
                  <div style={{ color: 'var(--verde)', fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                    {d.reembolso_usd != null ? `Reembolso: $${Number(d.reembolso_usd).toFixed(2)} USD` : 'Sin monto de reembolso capturado'}
                    {d.reembolso_en && ` · ${formatearFecha(d.reembolso_en.slice(0, 10))}`}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : cargando ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
        ) : gastos.length === 0 ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>
            {vista === 'pendientes' ? 'No hay gastos pendientes de aprobar.' : 'Sin gastos en el historial.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {gastos.map(g => {
              const e = edicion[g.id] || {}
              const enRevision = vista === 'pendientes'
              return (
                <div key={g.id} style={{ ...tarjeta, padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {g.imagen_url && (
                    <a href={g.imagen_url} target="_blank" rel="noreferrer">
                      <img src={g.imagen_url} alt="ticket" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--w10)' }} />
                    </a>
                  )}
                  <div style={{ flex: 1, minWidth: 260 }}>
                    {enRevision ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <input style={{ ...input, width: 100 }} type="number" value={e.monto} onChange={ev => cambiar(g.id, 'monto', ev.target.value)} placeholder="Monto" />
                        <select style={input} value={e.categoria} onChange={ev => cambiar(g.id, 'categoria', ev.target.value)}>
                          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input style={{ ...input, flex: 1, minWidth: 140 }} value={e.descripcion} onChange={ev => cambiar(g.id, 'descripcion', ev.target.value)} placeholder="Descripción" />
                        <input style={input} type="date" value={e.fecha_gasto} onChange={ev => cambiar(g.id, 'fecha_gasto', ev.target.value)} />
                        <select style={input} value={e.entrega_id} onChange={ev => cambiar(g.id, 'entrega_id', ev.target.value)}>
                          <option value="">General (sin viaje)</option>
                          {entregas.map(en => <option key={en.id} value={en.id}>{formatearFecha(en.fecha_entrega)}{en.nota ? ` — ${en.nota}` : ''}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700 }}>{fmt(g.monto)}</span>
                        <span style={{ color: 'var(--w40)', fontSize: 12.5, marginLeft: 8 }}>{g.categoria}</span>
                        {g.descripcion && <span style={{ color: 'var(--w40)', fontSize: 12.5, marginLeft: 8 }}>— {g.descripcion}</span>}
                      </div>
                    )}
                    <div style={{ color: 'var(--w32)', fontSize: 11.5 }}>
                      {formatearFecha(g.fecha_gasto)}
                      {g.entregas?.fecha_entrega && ` · Viaje ${formatearFecha(g.entregas.fecha_entrega)}`}
                      {g.origen === 'whatsapp' ? ' · WhatsApp' : ` · Manual${g.registrado?.nombre ? ` (${g.registrado.nombre})` : ''}`}
                    </div>
                    {!enRevision && (
                      <div style={{ color: g.estado === 'aprobado' ? 'var(--verde)' : 'var(--rojo-t)', fontSize: 11.5, marginTop: 4 }}>
                        {g.estado === 'aprobado'
                          ? `Aprobado por ${g.aprobado?.nombre || '—'}`
                          : `Rechazado por ${g.rechazado?.nombre || '—'}${g.rechazado_motivo ? `: ${g.rechazado_motivo}` : ''}`}
                      </div>
                    )}
                  </div>
                  {enRevision && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                      <button disabled={guardando === g.id} onClick={() => aprobar(g.id)} style={{ ...btn, background: 'var(--verde)', color: '#fff' }}>Aprobar</button>
                      <button disabled={guardando === g.id} onClick={() => rechazar(g.id)} style={{ ...btn, background: 'var(--w05)', color: 'var(--rojo-t)' }}>Rechazar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
