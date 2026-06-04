'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const HORARIOS_SEMANA = ['10:00am - 1:30pm', '3:00pm - 7:00pm']
const HORARIOS_SABADO = ['10:00am - 1:00pm', '2:00pm - 5:00pm']

export default function Domicilio() {
  const [cliente, setCliente] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [anticipos, setAnticipos] = useState([])
  const [entregasDisponibles, setEntregasDisponibles] = useState([])
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState([])
  const [paso, setPaso] = useState(1)
  const [tieneDireccion, setTieneDireccion] = useState(false)
  const [form, setForm] = useState({
    direccion: '', colonia: '', referencias: '', celular_contacto: '',
    fecha_preferida: '', horario: '', notas: ''
  })
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState([])
  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)
    setCliente(c)

    fetch(`/api/cliente/pedidos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const pendientes = d.pedidos.filter(p => p.estado?.toLowerCase() !== 'entregado')
          setPedidos(pendientes)
          const entregasUnicas = Object.values(
            pendientes.reduce((acc, p) => {
              const fecha = p.entregas?.fecha_entrega
              if (!acc[fecha]) acc[fecha] = { fecha, entrega_id: p.entrega_id, productos: [], total: 0 }
              acc[fecha].productos.push(p)
              acc[fecha].total += p.precio_venta || 0
              return acc
            }, {})
          ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
          setEntregasDisponibles(entregasUnicas)
        }
      })

    fetch(`/api/domicilios/listar?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setHistorial(d.domicilios) })

    fetch(`/api/anticipos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setAnticipos(d.anticipos || []) })

    fetch(`/api/clientes/listar`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const cli = d.clientes.find(x => x.id === c.id)
          if (cli?.direccion) {
            setForm(f => ({
              ...f,
              direccion: cli.direccion || '',
              colonia: cli.colonia || '',
              referencias: cli.referencias || '',
              celular_contacto: cli.celular_contacto || ''
            }))
            setTieneDireccion(true)
          }
        }
      })
  }, [])

  const getAnticiposEntrega = (entrega_id) => {
    return anticipos.filter(a => a.entrega_id === entrega_id)
  }

  const getPorPagarEntrega = (entrega) => {
    const totalAnticipos = getAnticiposEntrega(entrega.entrega_id).reduce((s, a) => s + (a.monto || 0), 0)
    return Math.max(0, entrega.total - totalAnticipos)
  }

  const toggleEntrega = (entrega, index) => {
    const yaSeleccionada = entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
    if (yaSeleccionada) {
      setEntregasSeleccionadas(entregasSeleccionadas.filter(e => e.fecha !== entrega.fecha))
    } else {
      const primeraNoSeleccionada = entregasDisponibles.findIndex(
        e => !entregasSeleccionadas.find(s => s.fecha === e.fecha)
      )
      if (index > primeraNoSeleccionada) {
        setError('Debes seleccionar primero la entrega más antigua')
        return
      }
      setEntregasSeleccionadas([...entregasSeleccionadas, entrega])
      setError('')
    }
  }

  const diasDisponibles = () => {
    const dias = []
    const hoy = new Date()
    const horaActual = hoy.getHours() * 60 + hoy.getMinutes()
    const hayHorarioManana = horaActual < (10 * 60 + 30)
    const hayHorarioTarde = horaActual < (15 * 60 + 30)
    if (hoy.getDay() !== 0 && (hayHorarioManana || hayHorarioTarde)) dias.push(hoy)
    for (let i = 1; i <= 14; i++) {
      const fecha = new Date(hoy)
      fecha.setDate(hoy.getDate() + i)
      if (fecha.getDay() !== 0) dias.push(fecha)
    }
    return dias
  }

  const horariosDelDia = (fecha) => {
    if (!fecha) return []
    const dia = new Date(fecha + 'T12:00:00').getDay()
    if (dia === 0) return []
    const horariosBase = dia === 6 ? HORARIOS_SABADO : HORARIOS_SEMANA
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    if (fecha !== hoy) return horariosBase
    const horaActual = ahora.getHours() * 60 + ahora.getMinutes()
    console.log('[Horarios] fecha param:', fecha, '| hoy calculado:', hoy, '| iguales:', fecha === hoy, '| hora actual (min):', horaActual)
    return horariosBase.filter(h => {
      if (h.includes('10:00am')) return horaActual < 630
      if (h.includes('3:00pm') || h.includes('2:00pm')) return horaActual < 915
      return true
    })
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }

  const enviar = async () => {
    if (!form.fecha_preferida || !form.horario) { setError('Selecciona fecha y horario'); return }
    if (!form.direccion || !form.colonia) { setError('Escribe tu dirección y colonia'); return }
    setEnviando(true)

    await fetch('/api/clientes/actualizar-direccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        direccion: form.direccion,
        colonia: form.colonia,
        referencias: form.referencias,
        celular_contacto: form.celular_contacto
      })
    })

    const subtotal = entregasSeleccionadas.reduce((s, e) => s + e.total, 0)

    const res = await fetch('/api/domicilios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        entrega_ids: entregasSeleccionadas.map(e => e.entrega_id),
        direccion: form.direccion,
        colonia: form.colonia,
        referencias: form.referencias,
        celular_contacto: form.celular_contacto,
        fecha_preferida: form.fecha_preferida,
        horario: form.horario,
        notas: form.notas,
        distancia_km: null,
        costo_envio: null,
        subtotal,
        total: null,
        estado: 'pendiente'
      })
    })

    const data = await res.json()
    setEnviando(false)
    if (data.ok) setConfirmado(true)
    else setError(data.mensaje)
  }

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`
  const subtotalTotal = entregasSeleccionadas.reduce((s, e) => s + getPorPagarEntrega(e), 0)

  if (confirmado) return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>📨</div>
        <div style={{ color: 'white', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>¡Solicitud enviada!</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 24 }}>Pronto te confirmamos el costo y hora de entrega</div>
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'left' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tu solicitud</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>📅 Fecha</span>
            <span style={{ color: 'white', fontSize: 12 }}>{formatearFecha(form.fecha_preferida)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>🕐 Horario</span>
            <span style={{ color: 'white', fontSize: 12 }}>{form.horario}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>📍 Dirección</span>
            <span style={{ color: 'white', fontSize: 12 }}>{form.direccion}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>💰 Costo envío</span>
            <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>Por confirmar</span>
          </div>
        </div>
        <button onClick={() => router.push('/cliente')}
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
          ← Regresar al portal
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#050508', padding: '24px 16px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => paso === 1 ? router.push('/cliente') : setPaso(paso - 1)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
            ← Regresar
          </button>
          <div>
            <div style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>🚚 Pedir domicilio</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
              {paso === 1 ? 'Selecciona tus entregas' : 'Tu dirección y horario'}
            </div>
          </div>
        </div>

        {/* Indicador pasos */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[1, 2].map(p => (
            <div key={p} style={{ flex: 1, height: 3, borderRadius: 2, background: p <= paso ? '#f59e0b' : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }} />
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* PASO 1: Seleccionar entregas */}
        {paso === 1 && (
          <div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 12 }}>
              Selecciona las entregas que quieres recibir. Empieza por la más antigua.
            </div>
            {entregasDisponibles.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                No tienes entregas pendientes
              </div>
            ) : (
              entregasDisponibles.map((entrega, index) => {
                const seleccionada = entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
                const anteriorSeleccionada = index === 0 || entregasSeleccionadas.find(e => e.fecha === entregasDisponibles[index - 1].fecha)
                const bloqueada = !anteriorSeleccionada && !seleccionada
                const yaAgendada = historial.some(h =>
                  h.entrega_ids?.includes(entrega.entrega_id) &&
                  ['pendiente', 'confirmado', 'en_camino'].includes(h.estado)
                )
                const anticiposEntrega = getAnticiposEntrega(entrega.entrega_id)
                const totalAnticipos = anticiposEntrega.reduce((s, a) => s + (a.monto || 0), 0)
                const porPagar = getPorPagarEntrega(entrega)

                return (
                  <div key={entrega.fecha} style={{ background: seleccionada ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${seleccionada ? 'rgba(245,158,11,0.25)' : bloqueada || yaAgendada ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, padding: 14, marginBottom: 10, opacity: bloqueada || yaAgendada ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ color: seleccionada ? '#f59e0b' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>📅 {formatearFecha(entrega.fecha)}</span>
                      <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700 }}>{fmt(entrega.total)}</span>
                    </div>

                    {entrega.productos.map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{p.descripcion}</span>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{fmt(p.precio_venta)}</span>
                      </div>
                    ))}

                    {anticiposEntrega.length > 0 && (
                      <div style={{ marginTop: 8, padding: '6px 0', borderTop: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ color: 'rgba(16,185,129,0.6)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>✅ Anticipos</div>
                        {anticiposEntrega.map((a, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>• {new Date(a.creado_en).toLocaleDateString('es-MX')}</span>
                            <span style={{ color: '#10b981', fontSize: 10, fontWeight: 600 }}>-{fmt(a.monto)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Por pagar</span>
                      <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>{fmt(porPagar)}</span>
                    </div>

                    {yaAgendada ? (
                      <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(16,185,129,0.05)', borderRadius: 8, textAlign: 'center', color: 'rgba(16,185,129,0.5)', fontSize: 10 }}>
                        ✅ Ya tienes un domicilio agendado para esta entrega
                      </div>
                    ) : bloqueada ? (
                      <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                        🔒 Selecciona primero la entrega anterior
                      </div>
                    ) : (
                      <button onClick={() => toggleEntrega(entrega, index)}
                        style={{ width: '100%', marginTop: 10, background: seleccionada ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${seleccionada ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 8, padding: '8px', color: seleccionada ? '#f87171' : '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        {seleccionada ? '✕ Quitar esta entrega' : '+ Agregar al domicilio'}
                      </button>
                    )}
                  </div>
                )
              })
            )}

            {entregasSeleccionadas.length > 0 && (
              <div>
                <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{entregasSeleccionadas.length} entrega{entregasSeleccionadas.length > 1 ? 's' : ''} · Por pagar</span>
                  <span style={{ color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>{fmt(subtotalTotal)}</span>
                </div>
                <button onClick={() => setPaso(2)}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#f59e0b,#f97316)', border: 'none', borderRadius: 12, padding: 13, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Continuar →
                </button>
              </div>
            )}

            {/* Historial */}
            {historial.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Historial de domicilios</div>
                {historial.map(d => (
                  <div key={d.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>📅 {formatearFecha(d.fecha_preferida)}</span>
                      <span style={{ color: d.estado === 'entregado' ? '#4ade80' : d.estado === 'en_camino' ? '#fbbf24' : d.estado === 'confirmado' ? '#10b981' : d.estado === 'cancelado' ? '#f87171' : '#f59e0b', fontSize: 11, fontWeight: 600 }}>
                        {d.estado === 'entregado' ? '✅ Entregado' : d.estado === 'en_camino' ? '🚚 En camino' : d.estado === 'confirmado' ? '✅ Confirmado' : d.estado === 'cancelado' ? '❌ Cancelado' : '⏳ Por confirmar'}
                      </span>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{d.direccion}, {d.colonia}</div>
                    <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                      {d.costo_envio ? `${fmt(d.total)} total` : 'Costo por confirmar'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PASO 2: Dirección y horario */}
        {paso === 2 && (
          <div>
            {tieneDireccion && (
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ color: '#10b981', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>📍 Dirección guardada</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{form.direccion}, {form.colonia}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{form.referencias}</div>
              </div>
            )}

            {[
              { label: 'Calle y número', key: 'direccion', placeholder: 'Ej: Blvd. Morelos #432' },
              { label: 'Colonia', key: 'colonia', placeholder: 'Ej: Villa del Real' },
              { label: 'Referencias', key: 'referencias', placeholder: 'Color de casa, cerca de...' },
              { label: 'Celular de contacto', key: 'celular_contacto', placeholder: '662 000 0000' },
            ].map(campo => (
              <div key={campo.key} style={{ marginBottom: 10 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>{campo.label}</label>
                <input type="text" value={form[campo.key]} onChange={e => setForm({ ...form, [campo.key]: e.target.value })}
                  placeholder={campo.placeholder}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}

            <div style={{ marginBottom: 10 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>📅 Fecha preferida</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {diasDisponibles().slice(0, 6).map(d => {
                  const fechaStr = d.toISOString().split('T')[0]
                  const nombreDia = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <button key={fechaStr} onClick={() => setForm({ ...form, fecha_preferida: fechaStr, horario: '' })}
                      style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${form.fecha_preferida === fechaStr ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`, background: form.fecha_preferida === fechaStr ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)', color: form.fecha_preferida === fechaStr ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer', fontWeight: form.fecha_preferida === fechaStr ? 600 : 400 }}>
                      {nombreDia}
                    </button>
                  )
                })}
              </div>
            </div>

            {form.fecha_preferida && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>🕐 Horario preferido</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {horariosDelDia(form.fecha_preferida).map(h => (
                    <button key={h} onClick={() => setForm({ ...form, horario: h })}
                      style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${form.horario === h ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`, background: form.horario === h ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)', color: form.horario === h ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontWeight: form.horario === h ? 600 : 400, textAlign: 'left' }}>
                      🕐 {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>📝 Notas adicionales</label>
              <input type="text" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })}
                placeholder="Instrucciones especiales..."
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>ℹ️ El costo de envío será de <strong style={{ color: '#f59e0b' }}>$50 o $70</strong> según tu zona. Te lo confirmamos pronto.</div>
            </div>

            <button onClick={enviar} disabled={enviando}
              style={{ width: '100%', background: 'linear-gradient(135deg,#f59e0b,#f97316)', border: 'none', borderRadius: 12, padding: 13, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.6 : 1 }}>
              {enviando ? 'Enviando...' : '📨 Enviar solicitud de domicilio'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}