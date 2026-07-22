'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'
import BotonCarrito from '../../components/mercadito/BotonCarrito'

const HORARIOS = [
  { value: '9-12',  label: '9:00 am – 12:00 pm' },
  { value: '12-3',  label: '12:00 pm – 3:00 pm' },
  { value: '3-6',   label: '3:00 pm – 6:00 pm' },
]

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`
const fk = { fontFamily: 'var(--font-baloo2)' }
const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '12px 14px', color: '#2a2118', fontSize: 14.5, marginBottom: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

const FORM_VACIO = { alias: '', calle: '', colonia: '', referencias: '', celular: '' }

export default function Domicilio() {
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pagos, setPagos] = useState([])
  const [historial, setHistorial] = useState([])
  const [entregasDisponibles, setEntregasDisponibles] = useState([])
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState([])
  const [paso, setPaso] = useState(1)
  const [confirmado, setConfirmado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Direcciones (tabla compartida con app)
  const [direcciones, setDirecciones] = useState([])
  const [dirIdSeleccionada, setDirIdSeleccionada] = useState(null)
  const [mostrarFormNueva, setMostrarFormNueva] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [formEditar, setFormEditar] = useState(FORM_VACIO)

  const [horario, setHorario] = useState('')
  const [notas, setNotas] = useState('')

  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)
    setCliente(c)

    Promise.all([
      fetch(`/api/cliente/pedidos?cliente_id=${c.id}`).then(r => r.json()),
      fetch(`/api/domicilios/listar?cliente_id=${c.id}`).then(r => r.json()),
      fetch(`/api/anticipos?cliente_id=${c.id}`).then(r => r.json()),
      fetch(`/api/clientes/direcciones?cliente_id=${c.id}`).then(r => r.json()),
    ]).then(([dPedidos, dDomicilios, dAnticipos, dDirs]) => {
      if (dPedidos.ok) {
        const pendientes = dPedidos.pedidos.filter(p => p.estado?.toLowerCase() !== 'entregado')
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
      if (dDomicilios.ok) setHistorial(dDomicilios.domicilios)
      if (dAnticipos.ok) setPagos(dAnticipos.anticipos || [])
      if (dDirs.ok) {
        const dirs = dDirs.direcciones || []
        setDirecciones(dirs)
        if (dirs.length > 0) setDirIdSeleccionada(dirs[0].id)
      }
      setCargando(false)
    })
  }, [])

  const getPorPagarEntrega = (entrega) => {
    const totalPagado = pagos.filter(a => a.entrega_id === entrega.entrega_id).reduce((s, a) => s + (a.monto || 0), 0)
    return Math.max(0, entrega.total - totalPagado)
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
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
    if (index > primeraNoSeleccionada) { setError('Selecciona primero la entrega más antigua'); return }
    setEntregasSeleccionadas([...entregasSeleccionadas, entrega].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)))
    setError('')
  }

  const seleccionTotal = entregasSeleccionadas.reduce((s, e) => s + getPorPagarEntrega(e), 0)

  const guardarNuevaDireccion = async () => {
    if (!form.calle.trim() || !form.colonia.trim()) { setError('Calle y colonia son obligatorias'); return }
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/clientes/direcciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: cliente.id, alias: form.alias || null, direccion: form.calle, colonia: form.colonia, referencias: form.referencias, celular_contacto: form.celular }),
      }).then(r => r.json())
      if (res.ok) {
        const nuevas = [res.direccion, ...direcciones]
        setDirecciones(nuevas)
        setDirIdSeleccionada(res.direccion.id)
        setMostrarFormNueva(false)
        setForm(FORM_VACIO)
      } else {
        setError(res.mensaje || 'No se pudo guardar')
      }
    } finally { setGuardando(false) }
  }

  const iniciarEdicion = (d) => {
    setEditandoId(d.id)
    setFormEditar({ alias: d.alias || '', calle: d.direccion, colonia: d.colonia, referencias: d.referencias || '', celular: d.celular_contacto || '' })
    setMostrarFormNueva(false)
    setError('')
  }

  const guardarEdicion = async () => {
    if (!formEditar.calle.trim() || !formEditar.colonia.trim()) { setError('Calle y colonia son obligatorias'); return }
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/clientes/direcciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editandoId, cliente_id: cliente.id, alias: formEditar.alias || null, direccion: formEditar.calle, colonia: formEditar.colonia, referencias: formEditar.referencias, celular_contacto: formEditar.celular }),
      }).then(r => r.json())
      if (res.ok) {
        setDirecciones(direcciones.map(d => d.id === editandoId ? res.direccion : d))
        setEditandoId(null)
        setFormEditar(FORM_VACIO)
      } else { setError(res.mensaje || 'No se pudo guardar') }
    } finally { setGuardando(false) }
  }

  const eliminarDireccion = async (id) => {
    setEliminando(id)
    const res = await fetch('/api/clientes/direcciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, cliente_id: cliente.id }),
    }).then(r => r.json())
    if (res.ok) {
      const nuevas = direcciones.filter(d => d.id !== id)
      setDirecciones(nuevas)
      if (dirIdSeleccionada === id) setDirIdSeleccionada(nuevas[0]?.id || null)
    }
    setEliminando(null)
  }

  const confirmarDomicilio = async () => {
    if (!horario) { setError('Elige un horario de entrega'); return }
    const dir = direcciones.find(d => d.id === dirIdSeleccionada)
    if (!dir?.direccion || !dir?.colonia) { setError('Selecciona o agrega una dirección de entrega'); return }
    setEnviando(true); setError('')
    const res = await fetch('/api/domicilios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        entrega_ids: entregasSeleccionadas.map(e => e.entrega_id),
        direccion: dir.direccion, colonia: dir.colonia,
        referencias: dir.referencias || '', celular_contacto: dir.celular_contacto || '',
        fecha_preferida: entregasSeleccionadas[0]?.fecha || null,
        horario: HORARIOS.find(h => h.value === horario)?.label || horario,
        notas, distancia_km: null, costo_envio: null, subtotal: seleccionTotal, total: null,
      }),
    }).then(r => r.json())
    setEnviando(false)
    if (res.ok) setConfirmado(true)
    else setError(res.mensaje || 'No se pudo enviar tu solicitud.')
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <button onClick={() => paso === 1 ? router.push('/cliente') : setPaso(1)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ color: '#2a2118', fontSize: 20 }}>←</div>
            <div>
              <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>🚚 Pedir domicilio</div>
              <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12.5, marginTop: 1 }}>
                {paso === 1 ? 'Paso 1 de 2 · Selecciona tus entregas' : 'Paso 2 de 2 · Datos de entrega'}
              </div>
            </div>
          </button>
          <BotonCarrito />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#c1553a' }} />
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: paso === 2 ? '#c1553a' : 'rgba(0,0,0,0.1)' }} />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', color: '#c0392b', fontSize: 12.5, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* ── PASO 1 ── */}
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
                  const yaAgendada = historial.some(h => h.entrega_ids?.includes(entrega.entrega_id) && ['pendiente','confirmado','en_camino'].includes(h.estado))
                  const lugares = [...new Set(entrega.items.map(p => p.lugar_compra).filter(Boolean))]
                  const resumenProductos = entrega.items.map(p => `${p.cantidad}x ${p.descripcion}`).join(', ')
                  const disabled = bloqueada || yaAgendada
                  return (
                    <div key={entrega.fecha} onClick={() => !disabled && toggleEntrega(entrega, index)}
                      style={{ background: '#fff', border: seleccionada ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.1)', borderRadius: 16, padding: '16px 18px', marginBottom: 12, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, marginTop: 2, background: seleccionada ? '#c1553a' : '#fff', border: seleccionada ? 'none' : '2px solid rgba(0,0,0,0.15)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>
                          {seleccionada ? '✓' : ''}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <div style={{ color: '#2a2118', fontSize: 15.5, fontWeight: 700 }}>
                              {lugares[0] ? `Pedido de ${lugares[0]}` : 'Tu pedido'} · {formatearFecha(entrega.fecha)}
                            </div>
                            {index === 0 && <div style={{ background: 'rgba(193,85,58,0.1)', color: '#a3432b', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px' }}>Más antigua</div>}
                          </div>
                          <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 13, lineHeight: 1.5 }}>{resumenProductos}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                            <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 13 }}>Saldo pendiente</div>
                            <div style={{ color: '#c1553a', fontSize: 17, fontWeight: 800 }}>{money(getPorPagarEntrega(entrega))}</div>
                          </div>
                          {yaAgendada && <div style={{ marginTop: 10, color: 'rgba(46,125,79,0.7)', fontSize: 11.5 }}>✅ Ya tienes un domicilio agendado para esta entrega</div>}
                          {bloqueada && !yaAgendada && <div style={{ marginTop: 10, color: 'rgba(42,33,24,0.35)', fontSize: 11.5 }}>🔒 Selecciona primero la entrega anterior</div>}
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
            <button onClick={() => entregasSeleccionadas.length > 0 && setPaso(2)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', background: entregasSeleccionadas.length > 0 ? '#c1553a' : 'rgba(0,0,0,0.12)', color: entregasSeleccionadas.length > 0 ? '#fff' : 'rgba(0,0,0,0.35)', border: 'none', borderRadius: 16, padding: '17px 18px', minHeight: 52, cursor: entregasSeleccionadas.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Continuar →</div>
            </button>
          </div>
        )}

        {/* ── PASO 2 ── */}
        {paso === 2 && (
          <div>

            {/* Direcciones guardadas */}
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📍 Dirección de entrega</div>

            {direcciones.map(d => (
              <div key={d.id}>
                {editandoId === d.id ? (
                  <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 18, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15 }}>Editar dirección</div>
                      <button onClick={() => { setEditandoId(null); setFormEditar(FORM_VACIO); setError('') }} style={{ color: 'rgba(42,33,24,0.4)', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                    </div>
                    <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Nombre / alias (opcional)</div>
                    <input value={formEditar.alias} onChange={e => setFormEditar(f => ({...f, alias: e.target.value}))} placeholder="Ej: Casa, Trabajo, Mamá" style={inputStyle} />
                    <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Calle y número *</div>
                    <input value={formEditar.calle} onChange={e => setFormEditar(f => ({...f, calle: e.target.value}))} placeholder="Ej: Blvd. Morelos #432" style={inputStyle} />
                    <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Colonia *</div>
                    <input value={formEditar.colonia} onChange={e => setFormEditar(f => ({...f, colonia: e.target.value}))} placeholder="Ej: Villa del Real" style={inputStyle} />
                    <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Referencias</div>
                    <input value={formEditar.referencias} onChange={e => setFormEditar(f => ({...f, referencias: e.target.value}))} placeholder="Color de casa, cerca de..." style={inputStyle} />
                    <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Celular</div>
                    <input value={formEditar.celular} onChange={e => setFormEditar(f => ({...f, celular: e.target.value}))} placeholder="662 000 0000" style={{ ...inputStyle, marginBottom: 16 }} />
                    <button onClick={guardarEdicion} disabled={guardando}
                      style={{ width: '100%', background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 12, padding: 13, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1, fontFamily: 'inherit' }}>
                      {guardando ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                ) : (
                  <div onClick={() => { setDirIdSeleccionada(d.id); setMostrarFormNueva(false); setEditandoId(null) }}
                    style={{ background: '#fff', border: dirIdSeleccionada === d.id ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 16, marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 'none', width: 20, height: 20, borderRadius: 10, border: dirIdSeleccionada === d.id ? '6px solid #c1553a' : '2px solid rgba(0,0,0,0.2)', background: '#fff', marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {d.alias && <div style={{ fontSize: 13, fontWeight: 800, color: '#2a2118', marginBottom: 2 }}>{d.alias}</div>}
                      <div style={{ fontSize: 14, color: '#2a2118', lineHeight: 1.6 }}>{d.direccion}, {d.colonia}</div>
                      {d.referencias && <div style={{ fontSize: 12, color: 'rgba(42,33,24,0.5)', marginTop: 2 }}>{d.referencias}</div>}
                      {d.celular_contacto && <div style={{ fontSize: 12, color: 'rgba(42,33,24,0.5)' }}>Cel: {d.celular_contacto}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); iniciarEdicion(d) }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: '#c1553a', fontWeight: 700, padding: 0, fontFamily: 'inherit' }}>
                        Editar
                      </button>
                      <button onClick={e => { e.stopPropagation(); eliminarDireccion(d.id) }}
                        disabled={eliminando === d.id}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(42,33,24,0.3)', fontWeight: 700, padding: 0, fontFamily: 'inherit' }}>
                        {eliminando === d.id ? '…' : '✕'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Formulario nueva dirección */}
            {mostrarFormNueva ? (
              <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 18, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15 }}>Nueva dirección</div>
                  <button onClick={() => { setMostrarFormNueva(false); setForm(FORM_VACIO); setError('') }} style={{ color: 'rgba(42,33,24,0.4)', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                </div>
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Nombre / alias (opcional)</div>
                <input value={form.alias} onChange={e => setForm(f => ({...f, alias: e.target.value}))} placeholder="Ej: Casa, Trabajo, Mamá" style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Calle y número *</div>
                <input value={form.calle} onChange={e => setForm(f => ({...f, calle: e.target.value}))} placeholder="Ej: Blvd. Morelos #432" style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Colonia *</div>
                <input value={form.colonia} onChange={e => setForm(f => ({...f, colonia: e.target.value}))} placeholder="Ej: Villa del Real" style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Referencias</div>
                <input value={form.referencias} onChange={e => setForm(f => ({...f, referencias: e.target.value}))} placeholder="Color de casa, cerca de..." style={inputStyle} />
                <div style={{ color: 'rgba(42,33,24,0.55)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Celular</div>
                <input value={form.celular} onChange={e => setForm(f => ({...f, celular: e.target.value}))} placeholder="662 000 0000" style={{ ...inputStyle, marginBottom: 16 }} />
                <button onClick={guardarNuevaDireccion} disabled={guardando}
                  style={{ width: '100%', background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 12, padding: 13, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {guardando ? 'Guardando…' : 'Usar esta dirección'}
                </button>
              </div>
            ) : (
              <button onClick={() => { setMostrarFormNueva(true); setDirIdSeleccionada(null); setError('') }}
                style={{ width: '100%', background: 'transparent', border: '1.5px dashed #c1553a', borderRadius: 14, padding: '14px 18px', color: '#c1553a', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 4, fontFamily: 'inherit' }}>
                + Agregar dirección
              </button>
            )}

            {/* Horario */}
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginTop: 22, marginBottom: 10 }}>Horario de entrega</div>
            {HORARIOS.map(h => (
              <div key={h.value} onClick={() => setHorario(h.value)}
                style={{ background: '#fff', border: horario === h.value ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '15px 16px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 'none', width: 20, height: 20, borderRadius: 10, border: horario === h.value ? '6px solid #c1553a' : '2px solid rgba(0,0,0,0.2)', background: '#fff' }} />
                <div style={{ fontSize: 15, color: '#2a2118', fontWeight: horario === h.value ? 700 : 400 }}>{h.label}</div>
              </div>
            ))}

            {/* Notas */}
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginTop: 18, marginBottom: 10 }}>Notas (opcional)</div>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Instrucciones especiales…"
              style={{ width: '100%', minHeight: 64, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '15px 16px', marginBottom: 22, color: '#2a2118', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />

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
