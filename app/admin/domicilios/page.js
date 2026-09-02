'use client'
import { useState, useEffect } from 'react'

export default function Domicilios() {
  const [domicilios, setDomicilios] = useState([])
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [cargando, setCargando] = useState(true)
  const [cobrando, setCobrando] = useState(null)
  const [modalMetodo1, setModalMetodo1] = useState('Efectivo')
  const [modalMonto1, setModalMonto1] = useState('')
  const [modalRecibido, setModalRecibido] = useState('')
  const [modalDosMetodos, setModalDosMetodos] = useState(false)
  const [modalMetodo2, setModalMetodo2] = useState('Transferencia')
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [pedidosCliente, setPedidosCliente] = useState([])
  const [anticiposCliente, setAnticiposCliente] = useState([])
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState([])
  const [formNuevo, setFormNuevo] = useState({
    cliente_id: '', direccion: '', colonia: '',
    referencias: '', celular_contacto: '', celular_contacto_adicional: '',
    fecha_preferida: '', horario: '', notas: ''
  })
  const [guardando, setGuardando] = useState(false)

  const HORARIOS_SEMANA = ['10:00am - 1:30pm', '3:00pm - 7:00pm']
  const HORARIOS_SABADO = ['10:00am - 1:00pm', '2:00pm - 5:00pm']

  useEffect(() => {
    cargar()
    fetch('/api/clientes/listar').then(r => r.json()).then(d => {
      if (d.ok) setClientes(d.clientes.filter(c => c.rol !== 'admin'))
    })
    fetch('/api/entregas').then(r => r.json()).then(d => {
      // Más reciente primero, igual que en el resto del panel.
      if (d.ok) setEntregas([...(d.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || '')))
    })
  }, [fecha])

  const cargar = async () => {
    setCargando(true)
    const res = await fetch(`/api/domicilios/listar?fecha=${fecha}`)
    const data = await res.json()
    if (data.ok) setDomicilios(data.domicilios)
    setCargando(false)
  }

  const cargarPedidosCliente = async (cliente_id) => {
    if (!cliente_id) { setPedidosCliente([]); setAnticiposCliente([]); return }
    const [pedidosRes, anticiposRes] = await Promise.all([
      fetch(`/api/cliente/pedidos?cliente_id=${cliente_id}`).then(r => r.json()),
      fetch(`/api/anticipos?cliente_id=${cliente_id}`).then(r => r.json())
    ])
    if (pedidosRes.ok) setPedidosCliente(pedidosRes.pedidos.filter(p => p.estado?.toLowerCase() !== 'entregado'))
    if (anticiposRes.ok) setAnticiposCliente(anticiposRes.anticipos || [])
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }

  const formatearFechaCorta = (fecha) => {
    if (!fecha) return ''
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const f = new Date(fecha)
    return `${f.getDate()} ${meses[f.getMonth()]} ${f.getFullYear()}`
  }

  const getTotalAnticipos = (d) => {
    return (d.anticipos_detalle || []).reduce((s, a) => s + (a.monto || 0), 0)
  }

  const getTotalAPagar = (d) => {
    if (d.es_externo) return Math.max(0, (d.total || 0) - (d.pago_anticipado_ext || 0))
    return Math.max(0, (d.total || 0) - getTotalAnticipos(d))
  }

  const getNombreCliente = (d) => d.es_externo ? d.nombre_externo : d.clientes?.nombre

  const entregasCliente = Object.values(
    pedidosCliente.reduce((acc, p) => {
      const fecha = p.entregas?.fecha_entrega
      if (!fecha) return acc
      if (!acc[fecha]) acc[fecha] = { fecha, entrega_id: p.entrega_id, productos: [], total: 0 }
      acc[fecha].productos.push(p)
      acc[fecha].total += p.precio_venta || 0
      return acc
    }, {})
  ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  const toggleEntregaNuevo = (entrega, index) => {
    const yaSeleccionada = entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
    if (yaSeleccionada) {
      setEntregasSeleccionadas(entregasSeleccionadas.filter(e => e.fecha !== entrega.fecha))
    } else {
      const primeraNoSeleccionada = entregasCliente.findIndex(
        e => !entregasSeleccionadas.find(s => s.fecha === e.fecha)
      )
      if (index > primeraNoSeleccionada) return
      setEntregasSeleccionadas([...entregasSeleccionadas, entrega])
    }
  }

const horariosDelDia = (fecha) => {
    if (!fecha) return []
    const dia = new Date(fecha + 'T12:00:00').getDay()
    if (dia === 0) return []
    if (dia === 6) return ['10:00am - 1:00pm', '2:00pm - 5:00pm']
    return ['10:00am - 1:30pm', '3:00pm - 7:00pm']
  }

  const esDomingo = (fecha) => fecha && new Date(fecha + 'T12:00:00').getDay() === 0

  const confirmarCosto = async (d, costo_envio) => {
    const subtotal = d.subtotal || 0
    const total = subtotal + costo_envio

    await fetch('/api/domicilios/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, estado: 'confirmado', costo_envio, total })
    })

    const totalAnticipos = getTotalAnticipos({ ...d, total })
    const totalAPagar = Math.max(0, total - totalAnticipos)

    const entregasMsg = (d.entrega_ids || []).map(entrega_id => {
      const productosEntrega = (d.productos_detalle || []).filter(p => p.entrega_id === entrega_id)
      const anticiposEntrega = (d.anticipos_detalle || []).filter(a => a.entrega_id === entrega_id)
      const totalProductos = productosEntrega.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const totalAnticiposEntrega = anticiposEntrega.reduce((s, a) => s + (a.monto || 0), 0)
      const subtotalEntrega = totalProductos - totalAnticiposEntrega
      const entregaInfo = entregas.find(e => e.id === entrega_id)
      const fechaEntrega = entregaInfo ? formatearFecha(entregaInfo.fecha_entrega) : entrega_id

      const lineas = [
        `📦 ENTREGA ${fechaEntrega}`,
        ...productosEntrega.map(p => `• ${p.descripcion} → $${p.precio_venta?.toLocaleString('es-MX')}`),
      ]
      if (anticiposEntrega.length > 0) {
        anticiposEntrega.forEach(a => {
          lineas.push(`✅ Anticipo ${formatearFechaCorta(a.creado_en)} → -$${a.monto?.toLocaleString('es-MX')}`)
        })
      }
      lineas.push(`Subtotal entrega: $${subtotalEntrega.toLocaleString('es-MX')}`)
      return lineas.join('\n')
    })

    const msg = [
      `Hola ${d.clientes?.nombre} 👋`,
      ``,
      `Tu domicilio ha sido confirmado ✅`,
      ``,
      ...entregasMsg.map(e => e + '\n'),
      `🚚 Envío → $${costo_envio}`,
      ``,
      `💰 Total a pagar: $${totalAPagar.toLocaleString('es-MX')}`,
      ``,
      `¡Gracias por tu Happy Shopping!`,
      `— Denog USA Compras 📦`
    ].join('\n')

    try {
      await navigator.clipboard.writeText(msg)
      alert('✅ Mensaje copiado. Ve a WhatsApp y pégalo.')
    } catch {
      prompt('Copia este mensaje:', msg)
    }
    cargar()
  }

  const cambiarEstado = async (id, estado) => {
    await fetch('/api/domicilios/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargar()
  }

  const cancelarDomicilio = async (d) => {
    if (!confirm('¿Cancelar este domicilio?')) return
    const res = await fetch('/api/domicilios/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, estado: 'cancelado' })
    }).then(r => r.json())
    if (!res.ok) { alert('Error al cancelar: ' + (res.mensaje || 'intenta de nuevo')); return }

    const nombre = getNombreCliente(d)
    const fechaStr = d.fecha_preferida ? formatearFecha(d.fecha_preferida) : null
    const msg = [
      `Hola ${nombre} 👋`,
      ``,
      `Te informamos que tu domicilio${fechaStr ? ` agendado para el ${fechaStr}` : ''} ha sido cancelado. 😔`,
      ``,
      `Por favor comunícate con nosotros para volver a reagendar tu entrega en la fecha que más te convenga — con gusto te ayudamos a encontrar el mejor horario. 📅`,
      ``,
      `¡Gracias por tu comprensión y seguimos en contacto!`,
      `— Denog USA Compras 📦`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(msg)
      alert('✅ Domicilio cancelado. Mensaje copiado — ve a WhatsApp y pégalo.')
    } catch {
      prompt('Copia este mensaje y envíalo por WhatsApp:', msg)
    }
    cargar()
  }

  const registrarPago = async (d, { metodo1: m1, monto1, metodo2: m2, monto2 }) => {
    const totalAPagar = getTotalAPagar(d)

    // External domicilio: simple path — record payment info and mark as entregado
    if (d.es_externo) {
      const montoTotal = monto1 + (monto2 || 0)
      const metodoLabel = monto2 > 0 ? `${m1} + ${m2}` : m1
      await fetch('/api/domicilios/actualizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, estado: 'entregado', monto_cobrado_ext: montoTotal, metodo_cobrado_ext: metodoLabel })
      })
      setCobrando(null)
      setModalMonto1(''); setModalDosMetodos(false); setModalMetodo1('Efectivo'); setModalRecibido(''); setModalMetodo2('Transferencia')
      cargar()
      return
    }

    if (totalAPagar === 0) {
      for (const entrega_id of (d.entrega_ids || [])) {
        await fetch('/api/pedidos/actualizar-estado', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, estado: 'Entregado' })
        })
      }
      await fetch('/api/domicilios/actualizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, estado: 'entregado' })
      })
      setCobrando(null)
      setModalMonto1(''); setModalDosMetodos(false); setModalMetodo1('Efectivo'); setModalRecibido(''); setModalMetodo2('Transferencia')
      cargar()
      return
    }

    if (monto1 <= 0) return

    const totalPago = monto1 + monto2
    let restante = totalPago
    const entregasOrdenadas = [...(d.entrega_ids || [])]

    for (let i = 0; i < entregasOrdenadas.length; i++) {
      const entrega_id = entregasOrdenadas[i]
      const productosEntrega = (d.productos_detalle || []).filter(p => p.entrega_id === entrega_id)
      const anticiposEntrega = (d.anticipos_detalle || []).filter(a => a.entrega_id === entrega_id)
      const subtotalEntrega = productosEntrega.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const totalAnticiposEntrega = anticiposEntrega.reduce((s, a) => s + (a.monto || 0), 0)
      let porPagarEntrega = Math.max(0, subtotalEntrega - totalAnticiposEntrega)
      if (i === 0) porPagarEntrega += (d.costo_envio || 0)

      const montoAplicar = Math.min(restante, porPagarEntrega)
      restante -= montoAplicar
      if (montoAplicar <= 0) continue

      const prop = totalPago > 0 ? monto1 / totalPago : 1
      const montoM1 = Math.round(montoAplicar * prop)
      const montoM2 = montoAplicar - montoM1

      if (montoM1 > 0) {
        await fetch('/api/punto-venta/pagar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, pagos: [{ monto: montoM1, metodo: m1 }] })
        })
      }
      if (monto2 > 0 && m2 && montoM2 > 0) {
        await fetch('/api/punto-venta/pagar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, pagos: [{ monto: montoM2, metodo: m2 }] })
        })
      }
      await fetch('/api/pedidos/actualizar-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, estado: 'Entregado' })
      })
    }

    await fetch('/api/domicilios/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, estado: 'entregado' })
    })

    setCobrando(null)
    setModalMonto1(''); setModalDosMetodos(false); setModalMetodo1('Efectivo'); setModalRecibido(''); setModalMetodo2('Transferencia')
    cargar()
  }

  const crearDomicilio = async () => {
    if (!formNuevo.cliente_id || entregasSeleccionadas.length === 0 || !formNuevo.direccion || !formNuevo.colonia || !formNuevo.fecha_preferida || !formNuevo.horario) {
      alert('Llena todos los campos obligatorios'); return
    }
    setGuardando(true)
    const subtotal = entregasSeleccionadas.reduce((s, e) => s + e.total, 0)
    await fetch('/api/domicilios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: formNuevo.cliente_id,
        entrega_ids: entregasSeleccionadas.map(e => e.entrega_id),
        direccion: formNuevo.direccion,
        colonia: formNuevo.colonia,
        referencias: formNuevo.referencias,
        celular_contacto: formNuevo.celular_contacto,
        celular_contacto_adicional: formNuevo.celular_contacto_adicional,
        fecha_preferida: formNuevo.fecha_preferida,
        horario: formNuevo.horario,
        notas: formNuevo.notas,
        distancia_km: null,
        costo_envio: null,
        subtotal,
        total: null,
        estado: 'pendiente'
      })
    })
    fetch('/api/clientes/actualizar-direccion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: formNuevo.cliente_id, direccion: formNuevo.direccion, colonia: formNuevo.colonia, referencias: formNuevo.referencias, celular_contacto: formNuevo.celular_contacto }) })
    setGuardando(false)
    setMostrarNuevo(false)
    setEntregasSeleccionadas([])
    setFormNuevo({ cliente_id: '', direccion: '', colonia: '', referencias: '', celular_contacto: '', celular_contacto_adicional: '', fecha_preferida: '', horario: '', notas: '' })
    setPedidosCliente([])
    setAnticiposCliente([])
    cargar()
  }

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`
  const totalRepartidor = domicilios.filter(d => d.costo_envio && d.estado !== 'cancelado').reduce((s, d) => s + (d.costo_envio || 0), 0)
  const pendientes = domicilios.filter(d => d.estado === 'pendiente').length
  const metodos = ['Efectivo', 'Transferencia', 'Terminal']
  const subtotalSeleccionado = entregasSeleccionadas.reduce((s, e) => s + e.total, 0)

  const renderModalCobro = () => {
    if (!cobrando) return null
    const d = domicilios.find(dom => dom.id === cobrando)
    if (!d) return null
    const totalAPagar = getTotalAPagar(d)
    const montoM1 = parseFloat(modalMonto1) || (modalDosMetodos ? 0 : totalAPagar)
    const restoM2 = Math.max(0, totalAPagar - montoM1)
    const recibido = parseFloat(modalRecibido) || 0
    const cambio = modalMetodo1 === 'Efectivo' ? recibido - (modalDosMetodos ? montoM1 : totalAPagar) : 0
    const confirmarDeshabilitado = modalDosMetodos && (montoM1 <= 0 || montoM1 > totalAPagar)
    return (
      <div onClick={e => { if (e.target === e.currentTarget) setCobrando(null) }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 70px rgba(0,0,0,0.7)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Cobro · Domicilio</div>
              <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 800 }}>{getNombreCliente(d)}</div>
              <div style={{ color: 'var(--tinta)', fontSize: 44, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1, marginTop: 6 }}>{fmt(totalAPagar)}</div>
            </div>
            <button onClick={() => setCobrando(null)}
              style={{ background: 'var(--w06)', border: '1px solid var(--w10)', borderRadius: 10, width: 36, height: 36, color: 'var(--w50)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
              ✕
            </button>
          </div>

          {totalAPagar === 0 ? (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'center' }}>
              <div style={{ color: 'var(--verde)', fontSize: 15, fontWeight: 700 }}>✅ Pagado con anticipos</div>
              <div style={{ color: 'rgba(74,222,128,0.6)', fontSize: 12, marginTop: 4 }}>Sin cobro adicional — solo se registrará la entrega</div>
            </div>
          ) : (
            <>
              {/* Modo simple */}
              {!modalDosMetodos ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {['Efectivo', 'Transferencia', 'Terminal'].map(m => (
                      <button key={m} onClick={() => { setModalMetodo1(m); setModalRecibido('') }}
                        style={{ flex: 1, padding: '14px 8px', borderRadius: 14, border: `2px solid ${modalMetodo1 === m ? 'rgba(74,222,128,0.5)' : 'var(--w08)'}`, background: modalMetodo1 === m ? 'rgba(74,222,128,0.12)' : 'var(--w03)', color: modalMetodo1 === m ? 'var(--verde)' : 'var(--w40)', fontSize: 13, fontWeight: modalMetodo1 === m ? 700 : 400, cursor: 'pointer' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {modalMetodo1 === 'Efectivo' && (
                    <input type="number" value={modalRecibido} onChange={e => setModalRecibido(e.target.value)}
                      placeholder="Con cuánto pagó"
                      style={{ width: '100%', background: 'var(--w06)', border: '1px solid var(--w12)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', marginBottom: 10 }} />
                  )}
                  {modalMetodo1 === 'Efectivo' && modalRecibido && cambio !== 0 && (
                    <div style={{ background: cambio > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${cambio > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 16, marginBottom: 14, textAlign: 'center' }}>
                      {cambio > 0
                        ? <><div style={{ color: 'rgba(74,222,128,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Dar de cambio al cliente</div><div style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmt(cambio)}</div></>
                        : <><div style={{ color: 'rgba(248,113,113,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta cobrar</div><div style={{ color: 'var(--rojo-t)', fontSize: 36, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmt(Math.abs(cambio))}</div></>
                      }
                    </div>
                  )}
                </div>
              ) : (
                /* Modo dos métodos */
                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: 'var(--w40)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Primer método</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {['Efectivo', 'Transferencia', 'Terminal'].map(m => (
                        <button key={m} onClick={() => { setModalMetodo1(m); setModalRecibido('') }}
                          style={{ flex: 1, padding: '10px 6px', borderRadius: 12, border: `2px solid ${modalMetodo1 === m ? 'rgba(74,222,128,0.5)' : 'var(--w08)'}`, background: modalMetodo1 === m ? 'rgba(74,222,128,0.12)' : 'var(--w03)', color: modalMetodo1 === m ? 'var(--verde)' : 'var(--w40)', fontSize: 12, fontWeight: modalMetodo1 === m ? 700 : 400, cursor: 'pointer' }}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <input type="number" value={modalMonto1} onChange={e => setModalMonto1(e.target.value)}
                      placeholder="Monto del primer método"
                      style={{ width: '100%', background: 'var(--w06)', border: '1px solid var(--w12)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                    {modalMetodo1 === 'Efectivo' && (
                      <input type="number" value={modalRecibido} onChange={e => setModalRecibido(e.target.value)}
                        placeholder="Con cuánto pagó"
                        style={{ width: '100%', background: 'var(--w04)', border: '1px solid var(--w07)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginTop: 8, fontFamily: 'monospace' }} />
                    )}
                    {modalMetodo1 === 'Efectivo' && modalRecibido && cambio !== 0 && (
                      <div style={{ background: cambio > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${cambio > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 14, marginTop: 8, textAlign: 'center' }}>
                        {cambio > 0
                          ? <><div style={{ color: 'rgba(74,222,128,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Cambio parcial</div><div style={{ color: 'var(--verde)', fontSize: 36, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmt(cambio)}</div></>
                          : <><div style={{ color: 'rgba(248,113,113,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta</div><div style={{ color: 'var(--rojo-t)', fontSize: 32, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmt(Math.abs(cambio))}</div></>
                        }
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ color: 'var(--w40)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Segundo método</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {['Transferencia', 'Terminal'].map(m => (
                        <button key={m} onClick={() => setModalMetodo2(m)}
                          style={{ flex: 1, padding: '10px 6px', borderRadius: 12, border: `2px solid ${modalMetodo2 === m ? 'rgba(193,85,58,0.5)' : 'var(--w08)'}`, background: modalMetodo2 === m ? 'rgba(193,85,58,0.12)' : 'var(--w03)', color: modalMetodo2 === m ? 'var(--marca-t)' : 'var(--w40)', fontSize: 12, fontWeight: modalMetodo2 === m ? 700 : 400, cursor: 'pointer' }}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <div style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 12, padding: '12px 16px', color: restoM2 > 0 ? 'var(--marca-t)' : 'var(--w20)', fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                      {fmt(restoM2)} en {modalMetodo2}
                    </div>
                  </div>
                </div>
              )}

              {/* Botón dividir */}
              <button onClick={() => { setModalDosMetodos(!modalDosMetodos); setModalMonto1(''); setModalRecibido('') }}
                style={{ width: '100%', background: 'transparent', border: '1px dashed var(--w15)', borderRadius: 12, padding: '10px', color: 'var(--w35)', fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>
                {modalDosMetodos ? '− Un solo método' : '+ Dividir en dos métodos'}
              </button>
            </>
          )}

          {/* Botón confirmar */}
          <button
            onClick={() => registrarPago(d, {
              metodo1: modalMetodo1,
              monto1: modalDosMetodos ? montoM1 : totalAPagar,
              metodo2: modalDosMetodos ? modalMetodo2 : null,
              monto2: modalDosMetodos ? restoM2 : 0
            })}
            disabled={confirmarDeshabilitado}
            style={{ width: '100%', background: confirmarDeshabilitado ? 'var(--w05)' : '#14532d', border: `1px solid ${confirmarDeshabilitado ? 'var(--w10)' : 'rgba(74,222,128,0.35)'}`, borderRadius: 14, padding: '14px', color: confirmarDeshabilitado ? 'var(--w30)' : 'var(--verde)', fontSize: 15, fontWeight: 800, cursor: confirmarDeshabilitado ? 'not-allowed' : 'pointer' }}>
            {totalAPagar === 0 ? '✅ Confirmar entrega' : '✅ Confirmar cobro'}
          </button>

        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 700 }}>🚚 Domicilios</div>
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 2 }}>
              {pendientes > 0 && <span style={{ color: 'var(--ambar)' }}>{pendientes} por confirmar · </span>}
              {domicilios.length} domicilio{domicilios.length !== 1 ? 's' : ''} este día
            </div>
          </div>
          {totalRepartidor > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Pagar repartidor</div>
              <div style={{ color: 'var(--ambar)', fontSize: 24, fontWeight: 800 }}>{fmt(totalRepartidor)}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--w40)', fontSize: 12 }}>📅</span>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--tinta)', fontSize: 13, outline: 'none', cursor: 'pointer' }} />
          </div>
          <button onClick={() => { setMostrarNuevo(!mostrarNuevo); setEntregasSeleccionadas([]); setPedidosCliente([]); setAnticiposCliente([]) }}
            style={{ background: 'var(--marca)', border: 'none', borderRadius: 12, padding: '10px 18px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nuevo domicilio
          </button>
        </div>

        {mostrarNuevo && (
          <div style={{ background: 'var(--w03)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 18, padding: 20, marginBottom: 20 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>➕ Nuevo domicilio</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>① Cliente *</label>
              <select value={formNuevo.cliente_id}
                onChange={e => {
                  const c = clientes.find(cl => String(cl.id) === e.target.value)
                  setFormNuevo({
                    ...formNuevo,
                    cliente_id: e.target.value,
                    direccion: c?.direccion || '',
                    colonia: c?.colonia || '',
                    referencias: c?.referencias || '',
                    celular_contacto: c?.celular_contacto || c?.telefono || '',
                    celular_contacto_adicional: '',
                  })
                  setEntregasSeleccionadas([])
                  cargarPedidosCliente(e.target.value)
                }}
                style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }}>
                <option value="">-- Elige un cliente --</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {formNuevo.cliente_id && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>② Estados de cuenta — del más antiguo al más nuevo</label>
                {entregasCliente.length === 0 ? (
                  <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--w30)', fontSize: 12 }}>
                    Este cliente no tiene pedidos pendientes
                  </div>
                ) : (
                  entregasCliente.map((entrega, index) => {
                    const seleccionada = entregasSeleccionadas.find(e => e.fecha === entrega.fecha)
                    const anteriorSeleccionada = index === 0 || entregasSeleccionadas.find(e => e.fecha === entregasCliente[index - 1].fecha)
                    const bloqueada = !anteriorSeleccionada && !seleccionada
                    const anticiposEntrega = anticiposCliente.filter(a => a.entrega_id === entrega.entrega_id)
                    const totalAnticiposEntrega = anticiposEntrega.reduce((s, a) => s + (a.monto || 0), 0)
                    const porPagar = Math.max(0, entrega.total - totalAnticiposEntrega)

                    return (
                      <div key={entrega.fecha}
                        onClick={() => !bloqueada && toggleEntregaNuevo(entrega, index)}
                        style={{ background: seleccionada ? 'rgba(245,158,11,0.06)' : bloqueada ? 'var(--w02)' : 'var(--w03)', border: `1px solid ${seleccionada ? 'rgba(245,158,11,0.35)' : bloqueada ? 'var(--w04)' : 'var(--w08)'}`, borderRadius: 14, padding: 12, marginBottom: 8, cursor: bloqueada ? 'not-allowed' : 'pointer', opacity: bloqueada ? 0.35 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${seleccionada ? 'var(--ambar)' : bloqueada ? 'var(--w10)' : 'var(--w20)'}`, background: seleccionada ? 'rgba(245,158,11,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: seleccionada ? 'var(--ambar)' : 'var(--w30)', flexShrink: 0 }}>
                              {seleccionada ? '✓' : bloqueada ? '🔒' : ''}
                            </div>
                            <span style={{ color: seleccionada ? 'var(--ambar)' : 'var(--w70)', fontSize: 12, fontWeight: 600 }}>📅 {formatearFecha(entrega.fecha)}</span>
                            {index === 0 && <span style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--rojo-t)', fontSize: 9, padding: '2px 6px', borderRadius: 10 }}>⚠️ Más antigua</span>}
                          </div>
                          <span style={{ color: seleccionada ? 'var(--ambar)' : 'var(--w50)', fontSize: 12, fontWeight: 700 }}>{fmt(entrega.total)}</span>
                        </div>
                        <div style={{ paddingLeft: 28 }}>
                          {entrega.productos.map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--w04)' }}>
                              <span style={{ color: 'var(--w45)', fontSize: 10 }}>{p.descripcion}</span>
                              <span style={{ color: 'var(--w50)', fontSize: 10 }}>{fmt(p.precio_venta)}</span>
                            </div>
                          ))}
                          {anticiposEntrega.length > 0 && (
                            <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px solid rgba(16,185,129,0.15)' }}>
                              <div style={{ color: 'rgba(16,185,129,0.6)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>✅ Anticipos</div>
                              {anticiposEntrega.map((a, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'var(--w30)', fontSize: 9 }}>• {formatearFechaCorta(a.creado_en)}</span>
                                  <span style={{ color: 'var(--verde)', fontSize: 9, fontWeight: 600 }}>-{fmt(a.monto)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, paddingTop: 4, borderTop: '1px solid var(--w06)' }}>
                            <span style={{ color: 'var(--w30)', fontSize: 10 }}>Por pagar</span>
                            <span style={{ color: 'var(--rojo-t)', fontSize: 10, fontWeight: 600 }}>{fmt(porPagar)}</span>
                          </div>
                          {bloqueada && (
                            <div style={{ marginTop: 6, padding: '3px 8px', background: 'var(--w02)', borderRadius: 6, textAlign: 'center', color: 'var(--w20)', fontSize: 9 }}>
                              🔒 Selecciona primero la entrega anterior
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
                {entregasSeleccionadas.length > 0 && (
                  <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <span style={{ color: 'var(--w50)', fontSize: 11 }}>{entregasSeleccionadas.length} entrega{entregasSeleccionadas.length > 1 ? 's' : ''} seleccionada{entregasSeleccionadas.length > 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--ambar)', fontSize: 13, fontWeight: 700 }}>{fmt(subtotalSeleccionado)}</span>
                  </div>
                )}
              </div>
            )}

            {entregasSeleccionadas.length > 0 && (
              <div>
                <div style={{ height: 1, background: 'var(--w06)', marginBottom: 14 }} />
                <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 10 }}>③ Datos de entrega</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  {[
                    { label: 'Calle y número *', key: 'direccion', placeholder: 'Blvd. Morelos #432' },
                    { label: 'Colonia *', key: 'colonia', placeholder: 'Villa del Real' },
                    { label: 'Referencias', key: 'referencias', placeholder: 'Casa azul, cerca de...' },
                    { label: 'Celular', key: 'celular_contacto', placeholder: '662 000 0000' },
                    { label: 'Celular adicional (opcional)', key: 'celular_contacto_adicional', placeholder: '662 000 0001' },
                  ].map(campo => (
                    <div key={campo.key}>
                      <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>{campo.label}</label>
                      <input type="text" value={formNuevo[campo.key]} onChange={e => setFormNuevo({ ...formNuevo, [campo.key]: e.target.value })}
                        placeholder={campo.placeholder}
                        style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Fecha *</label>
                    <input type="date" value={formNuevo.fecha_preferida}
                      onChange={e => setFormNuevo({ ...formNuevo, fecha_preferida: e.target.value, horario: '' })}
                      style={{ width: '100%', background: 'var(--w05)', border: `1px solid ${esDomingo(formNuevo.fecha_preferida) ? 'rgba(239,68,68,0.4)' : 'var(--w10)'}`, borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                    {esDomingo(formNuevo.fecha_preferida) && <div style={{ color: 'var(--rojo-t)', fontSize: 10, marginTop: 4 }}>⚠️ No hay servicio de domicilio los domingos</div>}
                  </div>
                  <div>
                    <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Horario *</label>
                    <select value={formNuevo.horario} onChange={e => setFormNuevo({ ...formNuevo, horario: e.target.value })}
                      style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }}>
                      <option value="">-- Elige horario --</option>
                      {horariosDelDia(formNuevo.fecha_preferida).map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Notas</label>
                    <input type="text" value={formNuevo.notas} onChange={e => setFormNuevo({ ...formNuevo, notas: e.target.value })}
                      placeholder="Instrucciones especiales..."
                      style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={crearDomicilio} disabled={guardando}
                    style={{ flex: 1, background: 'var(--marca)', border: 'none', borderRadius: 10, padding: '10px', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                    {guardando ? 'Guardando...' : '✓ Crear domicilio'}
                  </button>
                  <button onClick={() => { setMostrarNuevo(false); setEntregasSeleccionadas([]); setPedidosCliente([]); setAnticiposCliente([]) }}
                    style={{ background: 'var(--w05)', border: '1px solid var(--w08)', borderRadius: 10, padding: '10px 16px', color: 'var(--w40)', fontSize: 12, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!formNuevo.cliente_id && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--w25)', fontSize: 12 }}>
                Selecciona un cliente para ver sus estados de cuenta
              </div>
            )}
          </div>
        )}

        {cargando ? (
          <div style={{ textAlign: 'center', color: 'var(--w30)', padding: 40 }}>Cargando...</div>
        ) : domicilios.length === 0 ? (
          <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 16, padding: 48, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>
            No hay domicilios para este día
          </div>
        ) : (
          domicilios.map(d => (
            <div key={d.id} style={{ background: 'var(--w03)', border: `1px solid ${d.estado === 'cancelado' ? 'rgba(248,113,113,0.15)' : d.estado === 'entregado' ? 'rgba(74,222,128,0.15)' : d.estado === 'en_camino' ? 'rgba(251,191,36,0.15)' : d.estado === 'confirmado' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}`, borderRadius: 16, padding: 16, marginBottom: 10, opacity: d.estado === 'cancelado' ? 0.5 : 1 }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>{getNombreCliente(d)}</div>
                    {d.es_externo && (
                      <span style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--ambar)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(251,191,36,0.3)' }}>
                        🚲 Cliente externo
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 2 }}>📍 {d.direccion}, Col. {d.colonia}</div>
                  <div style={{ color: 'var(--w30)', fontSize: 11 }}>📝 {d.referencias}</div>
                  <div style={{ color: 'var(--w30)', fontSize: 11 }}>📱 {d.celular_contacto}</div>
                  <div style={{ color: 'var(--w30)', fontSize: 11 }}>📅 {formatearFecha(d.fecha_preferida)} · 🕐 {d.horario}</div>
                  {d.notas && <div style={{ color: 'var(--w30)', fontSize: 11 }}>📝 {d.notas}</div>}
                  {d.es_externo && d.items_tienda?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {d.items_tienda.map((it, i) => (
                        <div key={i} style={{ color: 'var(--w45)', fontSize: 11 }}>
                          • {it.nombre} ×{it.cantidad} — {fmt(it.precio * it.cantidad)}
                        </div>
                      ))}
                      {d.es_externo && d.forma_pago_ext === 'anticipado' && d.pago_anticipado_ext > 0 && (
                        <div style={{ color: 'var(--verde)', fontSize: 11, marginTop: 3 }}>✅ Anticipo: {fmt(d.pago_anticipado_ext)} ({d.metodo_pago_ext})</div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ color: d.estado === 'cancelado' ? 'var(--rojo-t)' : d.estado === 'entregado' ? 'var(--verde)' : d.estado === 'en_camino' ? 'var(--ambar)' : d.estado === 'confirmado' ? 'var(--verde)' : 'var(--ambar)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                    {d.estado === 'cancelado' ? '❌ Cancelado' : d.estado === 'entregado' ? '✅ Entregado' : d.estado === 'en_camino' ? '🚚 En camino' : d.estado === 'confirmado' ? '✅ Confirmado' : '⏳ Por confirmar'}
                  </div>
                  {d.costo_envio && <div style={{ color: 'var(--ambar)', fontSize: 12 }}>{fmt(d.costo_envio)} envío</div>}
                  {d.total && <div style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 800 }}>{fmt(getTotalAPagar(d))} por pagar</div>}
                </div>
              </div>

              {d.estado === 'pendiente' && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Elige el costo de envío</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <button onClick={() => confirmarCosto(d, 50)}
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px', cursor: 'pointer' }}>
                      <div style={{ color: 'var(--verde)', fontSize: 20, fontWeight: 800 }}>$50</div>
                      <div style={{ color: 'var(--w40)', fontSize: 10 }}>Zona corta · 0-5 km</div>
                    </button>
                    <button onClick={() => confirmarCosto(d, 70)}
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px', cursor: 'pointer' }}>
                      <div style={{ color: '#818cf8', fontSize: 20, fontWeight: 800 }}>$70</div>
                      <div style={{ color: 'var(--w40)', fontSize: 10 }}>Zona larga · 5.1+ km</div>
                    </button>
                  </div>
                  <button onClick={() => cancelarDomicilio(d)}
                    style={{ width: '100%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 8, padding: '7px', color: 'var(--rojo-t)', fontSize: 11, cursor: 'pointer' }}>
                    ❌ Cancelar domicilio
                  </button>
                </div>
              )}

              {d.estado === 'confirmado' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => cambiarEstado(d.id, 'en_camino')}
                    style={{ flex: 1, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '8px', color: 'var(--ambar)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    🚚 Marcar en camino
                  </button>
                  <button onClick={() => cancelarDomicilio(d)}
                    style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 8, padding: '8px 12px', color: 'var(--rojo-t)', fontSize: 11, cursor: 'pointer' }}>
                    ❌ Cancelar
                  </button>
                </div>
              )}

              {d.estado === 'en_camino' && cobrando !== d.id && (
                d.es_externo && d.forma_pago_ext === 'anticipado' ? (
                  <button onClick={() => cambiarEstado(d.id, 'entregado')}
                    style={{ width: '100%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px', color: 'var(--verde)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✅ Marcar como entregado (ya pagó anticipado)
                  </button>
                ) : (
                  <button onClick={() => {
                    setCobrando(d.id)
                    setModalMonto1(''); setModalDosMetodos(false); setModalMetodo1('Efectivo'); setModalRecibido(''); setModalMetodo2('Transferencia')
                  }}
                    style={{ width: '100%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px', color: 'var(--verde)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {getTotalAPagar(d) === 0 ? '✅ Marcar como entregado (cubierto por anticipos)' : '💳 Registrar cobro y marcar entregado'}
                  </button>
                )
              )}

            </div>
          ))
        )}
      </div>
    </div>
    {renderModalCobro()}
    </>
  )
}