'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const HORARIOS = [
  { value: '9-12', label: '9:00 am – 12:00 pm' },
  { value: '12-3', label: '12:00 pm – 3:00 pm' },
  { value: '3-6', label: '3:00 pm – 6:00 pm' },
]

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`
const fk = { fontFamily: 'var(--font-baloo2)' }
const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 14px', color: '#2a2118', fontSize: 14.5, marginBottom: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

export default function Domicilio() {
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pedidos, setPedidos] = useState([])
  const [pagos, setPagos] = useState([])
  const [historial, setHistorial] = useState([])
  const [entregasDisponibles, setEntregasDisponibles] = useState([])
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState([])
  const [paso, setPaso] = useState(1)
  const [confirmado, setConfirmado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [calle, setCalle] = useState('')
  const [colonia, setColonia] = useState('')
  const [referencias, setReferencias] = useState('')
  const [celular, setCelular] = useState('')
  const [editingAddress, setEditingAddress] = useState(false)
  const [horario, setHorario] = useState('')
  const [notas, setNotas] = useState('')

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
          setPedidos(d.pedidos)
          const pendientes = d.pedidos.filter(p => p.estado?.toLowerCase() !== 'entregado')
          const entregasUnicas = Object.values(
            pendientes.reduce((acc, p) => {
              const fecha = p.entregas?.fecha_entrega
              if (!acc[fecha]) acc[fecha] = { fecha, entrega_id: p.entrega_id, items: [], total: 0 }
              acc[fecha].items.push(p)
              acc[fecha].total += p.precio_venta || 0
              return acc
            }, {})
          ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
          setEntregasDisponibles(entregasUnicas)
        }
        setCargando(false)
      })

    fetch(`/api/domicilios/listar?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setHistorial(d.domicilios) })

    fetch(`/api/anticipos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPagos(d.anticipos || []) })

    supabase.from('clientes').select('direccion, colonia, referencias, celular_contacto').eq('id', c.id).single()
      .then(({ data }) => {
        if (data) {
          setCalle(data.direccion || '')
          setColonia(data.colonia || '')
          setReferencias(data.referencias || '')
          setCelular(data.celular_contacto || '')
        }
      })
  }, [])

  const getPorPagarEntrega = (entrega) => {
    const totalPagado = pagos.filter(a => a.entrega_id === entrega.entrega_id).reduce((s, a) => s + (a.monto || 0), 0)
    return Math.max(0, entrega.total - totalPagado)
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]}`
  }

  const toggleEntrega = (entrega, index) => {
    const yaSeleccionada = entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
    if (yaSeleccionada) {
      setEntregasSeleccionadas(entregasSeleccionadas.filter(e => e.fecha !== entrega.fecha))
      return
    }
    const primeraNoSeleccionada = entregasDisponibles.findIndex(e => !entregasSeleccionadas.find(s => s.fecha === e.fecha))
    if (index > primeraNoSeleccionada) {
      setError('Selecciona primero la entrega más antigua')
      return
    }
    setEntregasSeleccionadas([...entregasSeleccionadas, entrega].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)))
    setError('')
  }

  const seleccionTotal = entregasSeleccionadas.reduce((s, e) => s + getPorPagarEntrega(e), 0)

  const confirmarDomicilio = async () => {
    if (!horario) { setError('Elige un horario de entrega'); return }
    if (!calle.trim() || !colonia.trim()) { setError('Escribe tu calle y colonia'); return }
    setEnviando(true)
    setError('')

    await fetch('/api/clientes/actualizar-direccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: cliente.id, direccion: calle, colonia, referencias, celular_contacto: celular }),
    })

    const res = await fetch('/api/domicilios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        entrega_ids: entregasSeleccionadas.map(e => e.entrega_id),
        direccion: calle, colonia, referencias, celular_contacto: celular,
        fecha_preferida: entregasSeleccionadas[0]?.fecha || null,
        horario: HORARIOS.find(h => h.value === horario)?.label || horario,
        notas, distancia_km: null, costo_envio: null, subtotal: seleccionTotal, total: null,
      }),
    })
    const data = await res.json()
    setEnviando(false)
    if (data.ok) setConfirmado(true)
    else setError(data.mensaje || 'No se pudo enviar tu solicitud.')
  }

  if (cargando) return (
    <TarjetaCliente>
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 14 }}>Cargando...</div>
      </div>
    </TarjetaCliente>
  )

  if (confirmado) return (
    <TarjetaCliente>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '22px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 18 }}>✅</div>
        <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 22, marginBottom: 10, ...fk }}>¡Domicilio confirmado!</div>
        <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 14.5, lineHeight: 1.6, maxWidth: 280, marginBottom: 26 }}>Te avisaremos por WhatsApp cuando tu pedido esté en camino.</div>
        <button onClick={() => router.push('/cliente')} style={{ background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 14, padding: '14px 28px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Volver al inicio
        </button>
      </div>
    </TarjetaCliente>
  )

  return (
    <TarjetaCliente>
      <div style={{ padding: '22px 20px 40px' }}>

        <button onClick={() => paso === 1 ? router.push('/cliente') : setPaso(1)} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
          <div style={{ color: '#2a2118', fontSize: 20 }}>←</div>
          <div>
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>🚚 Pedir domicilio</div>
            <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12.5, marginTop: 1 }}>
              {paso === 1 ? 'Paso 1 de 2 · Selecciona tus entregas' : 'Paso 2 de 2 · Datos de entrega'}
            </div>
          </div>
        </button>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#c1553a' }} />
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: paso === 2 ? '#c1553a' : 'rgba(0,0,0,0.1)' }} />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', color: '#c0392b', fontSize: 12.5, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {paso === 1 && (
          <div>
            <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>Marca las entregas que quieres recibir en tu domicilio.</div>

            {entregasDisponibles.length === 0 ? (
              <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 13 }}>
                No tienes entregas pendientes para domicilio.
              </div>
            ) : (
              <>
                {entregasDisponibles.map((entrega, index) => {
                  const seleccionada = !!entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
                  const primeraNoSeleccionada = entregasDisponibles.findIndex(e => !entregasSeleccionadas.find(s => s.fecha === e.fecha))
                  const bloqueada = !seleccionada && index > primeraNoSeleccionada
                  const yaAgendada = historial.some(h => h.entrega_ids?.includes(entrega.entrega_id) && ['pendiente', 'confirmado', 'en_camino'].includes(h.estado))
                  const lugares = [...new Set(entrega.items.map(p => p.lugar_compra).filter(Boolean))]
                  const resumenProductos = entrega.items.map(p => `${p.cantidad}x ${p.descripcion}`).join(', ')
                  const disabled = bloqueada || yaAgendada

                  return (
                    <div key={entrega.fecha}
                      onClick={() => !disabled && toggleEntrega(entrega, index)}
                      style={{
                        background: '#fff',
                        border: seleccionada ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.1)',
                        borderRadius: 16, padding: '16px 18px', marginBottom: 12,
                        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                          flex: 'none', width: 26, height: 26, borderRadius: 7, marginTop: 2,
                          background: seleccionada ? '#c1553a' : '#fff',
                          border: seleccionada ? 'none' : '2px solid rgba(0,0,0,0.15)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 800,
                        }}>
                          {seleccionada ? '✓' : ''}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <div style={{ color: '#2a2118', fontSize: 15.5, fontWeight: 700 }}>
                              {lugares[0] ? `Pedido de ${lugares[0]}` : 'Tu pedido'} · {formatearFecha(entrega.fecha)}
                            </div>
                            {index === 0 && (
                              <div style={{ background: 'rgba(193,85,58,0.1)', color: '#a3432b', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px' }}>Más antigua</div>
                            )}
                          </div>
                          <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 13, lineHeight: 1.5 }}>{resumenProductos}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                            <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 13 }}>Saldo pendiente</div>
                            <div style={{ color: '#c1553a', fontSize: 17, fontWeight: 800 }}>{money(getPorPagarEntrega(entrega))}</div>
                          </div>
                          {yaAgendada && (
                            <div style={{ marginTop: 10, color: 'rgba(46,125,79,0.7)', fontSize: 11.5 }}>✅ Ya tienes un domicilio agendado para esta entrega</div>
                          )}
                          {bloqueada && !yaAgendada && (
                            <div style={{ marginTop: 10, color: 'rgba(42,33,24,0.35)', fontSize: 11.5 }}>🔒 Selecciona primero la entrega anterior</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 12.5, textAlign: 'center', margin: '16px 0 22px' }}>No tienes más entregas pendientes.</div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ color: '#2a2118', fontSize: 14, fontWeight: 600 }}>
                {entregasSeleccionadas.length} entrega{entregasSeleccionadas.length === 1 ? '' : 's'} seleccionada{entregasSeleccionadas.length === 1 ? '' : 's'}
              </div>
              <div style={{ color: '#2a2118', fontSize: 16, fontWeight: 800 }}>{money(seleccionTotal)}</div>
            </div>
            <button
              onClick={() => entregasSeleccionadas.length > 0 && setPaso(2)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
                background: entregasSeleccionadas.length > 0 ? '#c1553a' : 'rgba(0,0,0,0.12)',
                color: entregasSeleccionadas.length > 0 ? '#fff' : 'rgba(0,0,0,0.35)',
                border: 'none', borderRadius: 16, padding: '17px 18px', minHeight: 52,
                cursor: entregasSeleccionadas.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Continuar</div>
              <div style={{ fontSize: 18 }}>→</div>
            </button>
          </div>
        )}

        {paso === 2 && (
          <div>
            {!editingAddress ? (
              <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15 }}>📍 Tu dirección guardada</div>
                  <button onClick={() => setEditingAddress(true)} style={{ color: '#c1553a', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Editar</button>
                </div>
                {calle || colonia ? (
                  <>
                    <div style={{ color: '#2a2118', fontSize: 14.5, lineHeight: 1.7 }}>
                      {calle}{calle && colonia ? ', ' : ''}{colonia}<br />
                      {referencias && <>{referencias}<br /></>}
                      Cel: {celular}
                    </div>
                    <div style={{ color: 'rgba(42,33,24,0.45)', fontSize: 12, marginTop: 10 }}>Guardada de tu último pedido — no hace falta volver a escribirla.</div>
                  </>
                ) : (
                  <div style={{ color: 'rgba(42,33,24,0.45)', fontSize: 13 }}>Aún no tienes una dirección guardada — captúrala con "Editar".</div>
                )}
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15 }}>📍 Editar dirección</div>
                  <button onClick={() => setEditingAddress(false)} style={{ color: 'rgba(42,33,24,0.4)', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                </div>
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Calle y número</div>
                <input type="text" value={calle} onChange={e => setCalle(e.target.value)} placeholder="Ej: Blvd. Morelos #432" style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Colonia</div>
                <input type="text" value={colonia} onChange={e => setColonia(e.target.value)} placeholder="Ej: Villa del Real" style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Referencias</div>
                <input type="text" value={referencias} onChange={e => setReferencias(e.target.value)} placeholder="Color de casa, cerca de..." style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Celular</div>
                <input type="text" value={celular} onChange={e => setCelular(e.target.value)} placeholder="662 000 0000" style={{ ...inputStyle, marginBottom: 0 }} />
                <button onClick={() => setEditingAddress(false)} style={{ width: '100%', textAlign: 'center', background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 14.5, border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer', marginTop: 14, fontFamily: 'inherit' }}>
                  Guardar dirección
                </button>
              </div>
            )}

            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Horario de entrega</div>
            <select value={horario} onChange={e => setHorario(e.target.value)} style={{ width: '100%', background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '15px 16px', marginBottom: 18, color: '#2a2118', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}>
              <option value="">-- Elige horario --</option>
              {HORARIOS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>

            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Notas (opcional)</div>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Instrucciones especiales…" style={{ width: '100%', minHeight: 64, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '15px 16px', marginBottom: 22, color: '#2a2118', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />

            <button onClick={confirmarDomicilio} disabled={enviando}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', background: '#c1553a', border: 'none', borderRadius: 16, padding: '17px 18px', minHeight: 52, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1, fontFamily: 'inherit' }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{enviando ? 'Enviando…' : '✓ Confirmar domicilio'}</div>
            </button>
          </div>
        )}
      </div>
    </TarjetaCliente>
  )
}
