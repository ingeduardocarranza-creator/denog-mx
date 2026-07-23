'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'
import BotonCarrito from '../../components/mercadito/BotonCarrito'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const HORARIOS = [
  { value: '12-3', label: '12:00 pm – 3:00 pm' },
  { value: '3-5',  label: '3:00 pm – 5:00 pm' },
]

const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function generarDiasDisponibles() {
  const dias = []
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const ahora = new Date()
  const minutos = ahora.getHours() * 60 + ahora.getMinutes()
  const empezarDesde = minutos >= 16 * 60 + 15 ? 1 : 0
  for (let i = empezarDesde; dias.length < 14; i++) {
    const d = new Date(hoy); d.setDate(hoy.getDate() + i)
    if (d.getDay() !== 0) dias.push(d)
    if (i > 30) break
  }
  return dias
}
function isoFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

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
  const [perfilCliente, setPerfilCliente] = useState({ nombre: '', celular: '' })
  const [mostrarFormNueva, setMostrarFormNueva] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [eliminando, setEliminando] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [formEditar, setFormEditar] = useState(FORM_VACIO)

  // Paso 3 — upsell Mercadito
  const [domicilioId, setDomicilioId] = useState(null)
  const [productosUpsell, setProductosUpsell] = useState([])
  const [carritoUpsell, setCarritoUpsell] = useState({})
  const [enviandoMercadito, setEnviandoMercadito] = useState(false)
  const [productoDetalle, setProductoDetalle] = useState(null)
  const [categoriaUpsell, setCategoriaUpsell] = useState('Todos')
  const [busquedaUpsell, setBusquedaUpsell] = useState('')
  const [mostrarResumenUpsell, setMostrarResumenUpsell] = useState(false)

  const [diasDisponibles] = useState(() => generarDiasDisponibles())
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => {
    const dias = generarDiasDisponibles()
    return dias.length > 0 ? isoFecha(dias[0]) : ''
  })
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
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
        const atrasados = dPedidos.pedidos.filter(p => {
          if (p.estado?.toLowerCase() === 'entregado') return false
          const fecha = p.entregas?.fecha_entrega
          if (!fecha) return false
          return new Date(fecha + 'T12:00:00') < hoy
        })
        const entregasUnicas = Object.values(
          atrasados.reduce((acc, p) => {
            const key = p.entrega_id || p.entregas?.fecha_entrega
            if (!key) return acc
            if (!acc[key]) acc[key] = { fecha: p.entregas?.fecha_entrega, entrega_id: p.entrega_id, items: [], total: 0 }
            acc[key].items.push(p)
            acc[key].total += p.precio_venta || 0
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
        if (dDirs.perfil) setPerfilCliente(dDirs.perfil)
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
        fecha_preferida: fechaSeleccionada || null,
        horario: HORARIOS.find(h => h.value === horario)?.label || horario,
        notas, distancia_km: null, costo_envio: null, subtotal: seleccionTotal, total: null,
      }),
    }).then(r => r.json())
    setEnviando(false)
    if (res.ok) {
      setDomicilioId(res.domicilio?.id || null)
      const { data: prods } = await supabase
        .from('productos_tienda')
        .select('id, nombre, precio_venta, imagen_url, stock, categoria, descripcion')
        .eq('activo', true)
        .eq('mostrar_en_mercadito', true)
        .gt('stock', 0)
        .order('nombre', { ascending: true })
      setProductosUpsell(prods || [])
      setPaso(3)
    } else {
      setError(res.mensaje || 'No se pudo enviar tu solicitud.')
    }
  }

  const agregarMercadito = async () => {
    const items = Object.entries(carritoUpsell)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const p = productosUpsell.find(x => x.id === Number(id))
        return { producto_id: Number(id), nombre: p?.nombre, cantidad: qty, precio_unitario: p?.precio_venta }
      })
    if (!items.length) { setConfirmado(true); return }
    setEnviandoMercadito(true)
    setError('')
    try {
      const res = await fetch('/api/mercadito/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, cliente_id: cliente.id }),
      })
      const data = await res.json()
      if (!data.ok) setError(data.mensaje || 'El Mercadito no se pudo guardar, pero tu domicilio ya está confirmado.')
    } catch (e) {
      setError('Error de conexión. Tu domicilio ya está confirmado.')
    } finally {
      setEnviandoMercadito(false)
      setConfirmado(true)
    }
  }

  if (cargando) return (
    <TarjetaCliente>
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 14 }}>Cargando...</div>
      </div>
    </TarjetaCliente>
  )

  if (paso === 3 && confirmado) return (
    <TarjetaCliente>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '40px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#2a2118', marginBottom: 12, ...fk }}>¡Domicilio confirmado!</div>
        <div style={{ fontSize: 15, color: 'rgba(42,33,24,0.6)', lineHeight: 1.6, marginBottom: error ? 12 : 32, maxWidth: 340 }}>
          Te avisaremos por WhatsApp cuando tu pedido esté en camino.
        </div>
        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', color: '#c0392b', fontSize: 13, marginBottom: 20, maxWidth: 340, width: '100%' }}>{error}</div>}
        <button onClick={() => router.push('/cliente')}
          style={{ width: '100%', maxWidth: 340, background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 16, border: 'none', borderRadius: 16, padding: '17px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Volver al inicio
        </button>
      </div>
    </TarjetaCliente>
  )

  if (paso === 3) {
    const moneyU = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const totalUpsell = Object.entries(carritoUpsell).reduce((s, [id, qty]) => {
      const p = productosUpsell.find(x => x.id === Number(id))
      return s + (p?.precio_venta || 0) * qty
    }, 0)
    const categoriasUpsell = ['Todos', ...new Set(productosUpsell.map(p => p.categoria).filter(Boolean))]
    const productosFiltrados = productosUpsell.filter(p => {
      const matchCat = categoriaUpsell === 'Todos' || p.categoria === categoriaUpsell
      const matchBus = !busquedaUpsell.trim() || p.nombre.toLowerCase().includes(busquedaUpsell.trim().toLowerCase())
      return matchCat && matchBus
    })
    const itemsCarrito = Object.entries(carritoUpsell).filter(([, q]) => q > 0)

    // Vista de detalle de producto
    if (productoDetalle) {
      const qty = carritoUpsell[productoDetalle.id] || 0
      return (
        <TarjetaCliente>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <button onClick={() => setProductoDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 18, color: '#2a2118' }}>←</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#2a2118' }}>Mercadito</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 160 }}>
              {productoDetalle.imagen_url
                ? <img src={productoDetalle.imagen_url} alt={productoDetalle.nombre} style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: '100%', height: 200, background: 'rgba(193,85,58,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🛍️</div>
              }
              <div style={{ padding: '20px 20px 0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2a2118', marginBottom: 6, ...fk }}>{productoDetalle.nombre}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#c1553a', marginBottom: 12 }}>{moneyU(productoDetalle.precio_venta)}</div>
                {productoDetalle.descripcion && <div style={{ fontSize: 14, color: 'rgba(42,33,24,0.65)', lineHeight: 1.6 }}>{productoDetalle.descripcion}</div>}
                {productoDetalle.stock <= 3 && productoDetalle.stock > 0 && (
                  <div style={{ fontSize: 12, color: '#a3432b', fontWeight: 600, marginTop: 10 }}>⚠️ Solo quedan {productoDetalle.stock} en stock</div>
                )}
              </div>
            </div>
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid rgba(0,0,0,0.07)', padding: '14px 20px 24px', maxWidth: 430, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14 }}>
                <button onClick={() => setCarritoUpsell(c => ({ ...c, [productoDetalle.id]: Math.max(0, (c[productoDetalle.id] || 0) - 1) }))}
                  style={{ width: 44, height: 44, borderRadius: 22, border: `1.5px solid ${qty > 0 ? '#c1553a' : 'rgba(0,0,0,0.15)'}`, background: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer', color: qty > 0 ? '#c1553a' : 'rgba(0,0,0,0.3)', fontFamily: 'inherit' }}>−</button>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#2a2118', minWidth: 32, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => setCarritoUpsell(c => ({ ...c, [productoDetalle.id]: Math.min(productoDetalle.stock, (c[productoDetalle.id] || 0) + 1) }))}
                  style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: '#c1553a', fontSize: 22, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>+</button>
              </div>
              <button onClick={() => setProductoDetalle(null)}
                style={{ width: '100%', background: qty > 0 ? '#c1553a' : 'rgba(0,0,0,0.08)', color: qty > 0 ? '#fff' : 'rgba(42,33,24,0.45)', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 14, padding: '14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                {qty > 0 ? `Agregar ${qty} artículo${qty > 1 ? 's' : ''} · ${moneyU(qty * productoDetalle.precio_venta)}` : '← Regresar sin agregar'}
              </button>
            </div>
          </div>
        </TarjetaCliente>
      )
    }

    // Vista de grid principal
    return (
      <TarjetaCliente>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
          {/* Header */}
          <div style={{ padding: '20px 20px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2a2118', ...fk, marginBottom: 4 }}>🛍️ ¿Algo del Mercadito?</div>
            <div style={{ fontSize: 13.5, color: 'rgba(42,33,24,0.55)' }}>Agrégalo a tu entrega y lo llevamos junto con tu pedido.</div>
          </div>

          {/* Buscador */}
          <div style={{ padding: '0 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: '0 12px' }}>
              <span style={{ fontSize: 14, color: 'rgba(42,33,24,0.4)' }}>🔍</span>
              <input value={busquedaUpsell} onChange={e => setBusquedaUpsell(e.target.value)}
                placeholder="Buscar producto..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: '#2a2118', padding: '10px 0', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* Categorías */}
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            {categoriasUpsell.map(cat => (
              <button key={cat} onClick={() => setCategoriaUpsell(cat)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: categoriaUpsell === cat ? 'none' : '1.5px solid rgba(0,0,0,0.1)', background: categoriaUpsell === cat ? '#c1553a' : 'rgba(0,0,0,0.04)', color: categoriaUpsell === cat ? '#fff' : 'rgba(42,33,24,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {cat}
              </button>
            ))}
          </div>

          {/* Grid de productos */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', paddingBottom: 180 }}>
            {productosFiltrados.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 14 }}>No hay productos que coincidan.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {productosFiltrados.map(p => {
                  const qty = carritoUpsell[p.id] || 0
                  const agotado = p.stock <= 0
                  return (
                    <div key={p.id} onClick={() => !agotado && (qty === 0 ? setCarritoUpsell(c => ({ ...c, [p.id]: 1 })) : setProductoDetalle(p))}
                      style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${qty > 0 ? '#c1553a' : 'rgba(0,0,0,0.08)'}`, overflow: 'hidden', cursor: agotado ? 'default' : 'pointer', opacity: agotado ? 0.55 : 1, position: 'relative' }}>
                      <div style={{ position: 'relative' }}>
                        {p.imagen_url
                          ? <img src={p.imagen_url} alt={p.nombre} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: 130, background: 'rgba(193,85,58,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🛍️</div>
                        }
                        {qty > 0 && (
                          <div style={{ position: 'absolute', top: 8, right: 8, background: '#c1553a', borderRadius: 999, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{qty}</span>
                          </div>
                        )}
                        {agotado && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(42,33,24,0.5)' }}>Agotado</span>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '10px 10px 12px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2a2118', marginBottom: 6, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.nombre}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#c1553a' }}>{moneyU(p.precio_venta)}</span>
                          {!agotado && (
                            qty > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
                                <button onClick={e => { e.stopPropagation(); setCarritoUpsell(c => ({ ...c, [p.id]: Math.max(0, (c[p.id] || 0) - 1) })) }}
                                  style={{ width: 24, height: 24, borderRadius: 12, border: '1.5px solid #c1553a', background: '#fff', color: '#c1553a', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>−</button>
                                <span style={{ fontSize: 13, fontWeight: 800, color: '#2a2118', minWidth: 14, textAlign: 'center' }}>{qty}</span>
                                <button onClick={e => { e.stopPropagation(); setCarritoUpsell(c => ({ ...c, [p.id]: Math.min(p.stock, (c[p.id] || 0) + 1) })) }}
                                  style={{ width: 24, height: 24, borderRadius: 12, border: 'none', background: '#c1553a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); setCarritoUpsell(c => ({ ...c, [p.id]: 1 })) }}
                                style={{ width: 28, height: 28, borderRadius: 14, background: '#c1553a', border: 'none', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>+</button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Barra fija inferior */}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid rgba(0,0,0,0.07)', padding: '12px 20px 24px', maxWidth: 430, margin: '0 auto' }}>
            {totalUpsell > 0 && mostrarResumenUpsell && (
              <div style={{ background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
                {itemsCarrito.map(([id, qty]) => {
                  const p = productosUpsell.find(x => x.id === Number(id))
                  if (!p) return null
                  return (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: '#2a2118', flex: 1, lineHeight: 1.4 }}>{qty}× {p.nombre}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#c1553a', marginLeft: 10, flexShrink: 0 }}>{moneyU(qty * p.precio_venta)}</span>
                    </div>
                  )
                })}
                <div style={{ borderTop: '1px solid rgba(193,85,58,0.15)', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(42,33,24,0.55)' }}>Total Mercadito</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#c1553a' }}>{moneyU(totalUpsell)}</span>
                </div>
              </div>
            )}
            {totalUpsell > 0 && (
              <button onClick={() => setMostrarResumenUpsell(v => !v)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', border: 'none', borderRadius: 12, cursor: 'pointer', padding: '11px 14px', marginBottom: 10, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#2a2118' }}>🛍️ {mostrarResumenUpsell ? 'Ocultar resumen' : 'Ver mi selección'}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#c1553a' }}>{moneyU(totalUpsell)} {mostrarResumenUpsell ? '▴' : '▾'}</span>
              </button>
            )}
            {totalUpsell > 0 && (
              <button onClick={agregarMercadito} disabled={enviandoMercadito}
                style={{ width: '100%', background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 14, padding: '14px', cursor: enviandoMercadito ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 8, opacity: enviandoMercadito ? 0.7 : 1 }}>
                {enviandoMercadito ? 'Agregando...' : (() => {
                  const totalArt = Object.values(carritoUpsell).reduce((s, q) => s + q, 0)
                  return `Agregar: ${totalArt} artículo${totalArt > 1 ? 's' : ''} · ${moneyU(totalUpsell)}`
                })()}
              </button>
            )}
            <button onClick={() => setConfirmado(true)}
              style={{ width: '100%', background: '#fff', border: '1.5px solid rgba(0,0,0,0.12)', color: '#2a2118', fontWeight: 600, fontSize: 14, borderRadius: 14, padding: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              No por ahora
            </button>
          </div>
        </div>
      </TarjetaCliente>
    )
  }

  return (
    <TarjetaCliente>
      <div style={{ padding: '22px 20px 40px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <button onClick={() => paso === 1 ? router.push('/cliente') : setPaso(1)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ color: '#2a2118', fontSize: 20 }}>←</div>
            <div>
              <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>🚚 Pedir domicilio</div>
              <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12.5, marginTop: 1 }}>
                {paso === 1 ? 'Paso 1 de 3 · Selecciona tus entregas' : 'Paso 2 de 3 · Datos de entrega'}
              </div>
            </div>
          </button>
          <BotonCarrito />
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#c1553a' }} />
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: paso >= 2 ? '#c1553a' : 'rgba(0,0,0,0.1)' }} />
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: paso >= 3 ? '#c1553a' : 'rgba(0,0,0,0.1)' }} />
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
              <button onClick={() => { setMostrarFormNueva(true); setDirIdSeleccionada(null); setError(''); setForm({ ...FORM_VACIO, celular: perfilCliente.celular }) }}
                style={{ width: '100%', background: 'transparent', border: '1.5px dashed #c1553a', borderRadius: 14, padding: '14px 18px', color: '#c1553a', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 4, fontFamily: 'inherit' }}>
                + Agregar dirección
              </button>
            )}

            {/* Fecha */}
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginTop: 22, marginBottom: 10 }}>Fecha de entrega</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 18, scrollbarWidth: 'none' }}>
              {diasDisponibles.map(d => {
                const iso = isoFecha(d)
                const activo = fechaSeleccionada === iso
                return (
                  <div key={iso} onClick={() => setFechaSeleccionada(iso)}
                    style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: activo ? '#c1553a' : '#fff', border: activo ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '10px 14px', cursor: 'pointer', minWidth: 58 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: activo ? '#fff' : 'rgba(42,33,24,0.5)', textTransform: 'uppercase' }}>{DIAS_SEMANA[d.getDay()]}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: activo ? '#fff' : '#2a2118', margin: '2px 0' }}>{d.getDate()}</div>
                    <div style={{ fontSize: 11, color: activo ? '#fff' : 'rgba(42,33,24,0.5)' }}>{MESES_CORTO[d.getMonth()]}</div>
                  </div>
                )
              })}
            </div>

            {/* Horario */}
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Horario de entrega</div>
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
