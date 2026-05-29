'use client'
import { useState, useEffect } from 'react'

export default function Entregas() {
  const [entregas, setEntregas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ fecha_entrega: '', nota: '' })
  const [msg, setMsg] = useState('')

  useEffect(() => { cargar() }, [])

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

  const cambiarEstado = async (id, estado) => {
    await fetch('/api/admin/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargar()
  }

  const estados = [
    { valor: 'futura', label: '🔵 Futura', color: '#818cf8', bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.2)' },
    { valor: 'en_tienda', label: '✅ En tienda', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.2)' },
  ]

  const getEstado = (valor) => estados.find(e => e.valor === valor) || estados[0]

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

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
            return (
              <div key={e.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${est.border}`, borderRadius: 18, padding: 18, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>📅 {e.fecha_entrega}</div>
                    {e.nota && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{e.nota}</div>}
                  </div>
                  <span style={{ background: est.bg, border: `1px solid ${est.border}`, borderRadius: 20, padding: '4px 12px', color: est.color, fontSize: 11, fontWeight: 600 }}>
                    {est.label}
                  </span>
                </div>

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
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => window.location.href = `/admin/pedidos`}
  style={{ flex: 1, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '8px', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
  📝 Capturar pedidos
</button>
<button onClick={() => window.location.href = `/admin/reportes`}
  style={{ flex: 1, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '8px', color: '#10b981', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
  📊 Ver reporte
</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}