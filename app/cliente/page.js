'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import TarjetaCliente from '../components/cliente/TarjetaCliente'
import BotonCarrito from '../components/mercadito/BotonCarrito'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`

const fk = { fontFamily: 'var(--font-baloo2)' } // encabezados

export default function ClienteInicio() {
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [pedidos, setPedidos] = useState([])
  const [domicilios, setDomicilios] = useState([])
  const [pagos, setPagos] = useState([])
  const [pedidosMercadito, setPedidosMercadito] = useState([])
  const [productosDestacados, setProductosDestacados] = useState([])
  const [domiciliosActivos, setDomiciliosActivos] = useState([])
  const [abiertosDom, setAbiertosDom] = useState({})
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
          setDomicilios(d.domicilios || [])
        }
        setCargando(false)
      })

    fetch(`/api/anticipos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPagos(d.anticipos || []) })

    fetch(`/api/cliente/mercadito?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidosMercadito(d.pedidos || []) })

    fetch(`/api/domicilios/listar?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setDomiciliosActivos((d.domicilios || []).filter(dom => ['pendiente','confirmado','en_camino'].includes(dom.estado)))
      })

    // Productos destacados del catálogo público del Mercadito (mismo criterio
    // que la tira de la portada) — no depende de que el cliente ya haya
    // comprado algo, así siempre hay algo que mostrar.
    supabase.from('productos_tienda').select('id, nombre, precio_venta, imagen_url')
      .eq('activo', true).eq('mostrar_en_mercadito', true).order('id', { ascending: false }).limit(8)
      .then(({ data }) => setProductosDestacados(data || []))
  }, [])

  // ---- Agrupar pedidos (Encargos) por entrega — misma lógica que ya existía ----
  const porEntrega = pedidos.reduce((acc, p) => {
    const fecha = p.entregas?.fecha_entrega || 'Sin entrega'
    if (!acc[fecha]) acc[fecha] = { items: [], estado: p.entregas?.estado || 'futura', entrega_id: p.entrega_id }
    acc[fecha].items.push(p)
    return acc
  }, {})

  const getAnticiposEntrega = (entrega_id) => pagos.filter(a => a.entrega_id === entrega_id && a.tipo?.toLowerCase() === 'anticipo')
  const getTotalPagado = (entrega_id) => pagos.filter(a => a.entrega_id === entrega_id).reduce((s, a) => s + (a.monto || 0), 0)
  const getDomicilioEntrega = (entrega_id) => {
    const d = domicilios.find(d => d.entrega_ids?.includes(entrega_id))
    if (!d) return null
    return d.entrega_ids?.[0] === entrega_id ? d : null
  }

  const entregasPendientes = Object.entries(porEntrega)
    .filter(([, { items }]) => !items.every(p => p.estado?.toLowerCase() === 'entregado'))
    .map(([fecha, info]) => ({ fecha, ...info }))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  const getPorPagarEntrega = (entrega) => {
    const domicilio = getDomicilioEntrega(entrega.entrega_id)
    const costoEnvio = domicilio?.costo_envio || 0
    const subtotal = entrega.items.reduce((s, p) => s + (p.precio_venta || 0), 0) + costoEnvio
    return Math.max(0, subtotal - getTotalPagado(entrega.entrega_id))
  }

  const totalEncargoPendiente = entregasPendientes.reduce((s, e) => s + getPorPagarEntrega(e), 0)

  // ---- Mercadito: pedidos ya confirmados/listos para recoger, aún no cobrados ----
  const mercaditoDebido = pedidosMercadito.filter(p => ['aprobado', 'agregado'].includes(p.estado))
  const totalMercaditoPedido = (p) => (p.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
  const totalMercadito = mercaditoDebido.reduce((s, p) => s + totalMercaditoPedido(p), 0)

  const totalAPagar = totalEncargoPendiente + totalMercadito

  const proximaEntrega = entregasPendientes[0] || null
  const diasFaltan = proximaEntrega ? Math.max(0, Math.ceil((new Date(proximaEntrega.fecha + 'T12:00:00') - new Date()) / 86400000)) : null

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} de ${meses[d.getMonth()]}`
  }

  const salir = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('cliente')
    router.push('/')
  }

  if (cargando) return (
    <TarjetaCliente>
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 14 }}>Cargando...</div>
      </div>
    </TarjetaCliente>
  )

  return (
    <TarjetaCliente>
      <div style={{ padding: '22px 20px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 20, ...fk }}>USA Compras</div>
            <div style={{ color: '#c1553a', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', marginTop: 2 }}>MY HAPPY SHOPPING</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BotonCarrito />
            <button onClick={salir} style={{ color: '#2a2118', fontSize: 13, fontWeight: 700, border: '1.5px solid rgba(0,0,0,0.2)', borderRadius: 12, padding: '9px 16px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
              Salir
            </button>
          </div>
        </div>

        {/* Saludo */}
        <div style={{ color: '#2a2118', fontSize: 15, marginBottom: 2 }}>Hola 👋</div>
        <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 24, marginBottom: 10, ...fk }}>{cliente?.nombre}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(193,85,58,0.1)', border: '1.5px solid rgba(193,85,58,0.4)', color: '#a3432b', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
          ● Happy Shopper
        </div>

        {/* Próxima entrega + total */}
        <div style={{ background: '#c1553a', borderRadius: 20, padding: 22, marginBottom: 22 }}>
          {proximaEntrega ? (
            <>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600 }}>🚚 Tu próxima entrega</div>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginTop: 6, ...fk }}>{formatearFecha(proximaEntrega.fecha)}</div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                {diasFaltan === 0 ? 'Es hoy' : diasFaltan === 1 ? 'Falta 1 día' : `Faltan ${diasFaltan} días`}
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600 }}>🚚 Tu próxima entrega</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 8 }}>No tienes entregas pendientes</div>
            </>
          )}
          <div style={{ borderTop: '1.5px solid rgba(255,255,255,0.25)', marginTop: 18, paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12.5, fontWeight: 600 }}>Total a pagar</div>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 2 }}>{money(totalAPagar)}</div>
            </div>
            <button onClick={() => router.push('/cliente/detalle')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)', border: '1.5px solid rgba(255,255,255,0.45)', borderRadius: 12, padding: '12px 16px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Ver detalle</div>
              <div style={{ color: '#fff', fontSize: 16 }}>→</div>
            </button>
          </div>
        </div>

        {/* Status domicilios activos */}
        {domiciliosActivos.map(dom => {
          const statusInfo = {
            pendiente:  { label: '⏳ Pendiente de confirmar', color: '#a3432b', bg: 'rgba(193,85,58,0.08)' },
            confirmado: { label: '✓ Confirmado',              color: '#2e7d4f', bg: 'rgba(46,125,79,0.08)' },
            en_camino:  { label: '🚚 En camino',              color: '#1a6fa0', bg: 'rgba(37,130,198,0.08)' },
          }[dom.estado] || { label: dom.estado, color: '#2a2118', bg: 'rgba(0,0,0,0.05)' }

          const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
          const fmtFecha = (f) => { const d = new Date(f+'T12:00:00'); return `${d.getDate()} ${meses[d.getMonth()]}` }

          // Agrupar productos por entrega
          const gruposEntrega = Object.values(
            (dom.productos_detalle || []).reduce((acc, p) => {
              const key = p.entrega_id
              if (!acc[key]) acc[key] = { entrega_id: key, fecha: p.entregas?.fecha_entrega, items: [], total: 0 }
              acc[key].items.push(p)
              acc[key].total += p.precio_venta || 0
              return acc
            }, {})
          ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

          const totalMerc = (dom.mercadito_detalle || []).reduce((s, mp) =>
            s + (mp.items || []).reduce((ss, it) => ss + (Number(it.precio_unitario)||0)*(Number(it.cantidad)||0), 0), 0)
          const totalProd = gruposEntrega.reduce((s, g) => s + g.total, 0)
          const totalAnticipo = (dom.anticipos_detalle || []).reduce((s, a) => s + (a.monto || 0), 0)
          const costoEnvio = dom.costo_envio || 0
          const subtotal = totalProd + totalMerc
          const total = subtotal + costoEnvio
          const porPagar = Math.max(0, total - totalAnticipo)

          const fechaStr = dom.fecha_preferida ? fmtFecha(dom.fecha_preferida) : null
          const toggleKey = (k) => setAbiertosDom(prev => ({ ...prev, [`${dom.id}_${k}`]: !prev[`${dom.id}_${k}`] }))
          const isOpen = (k) => !!abiertosDom[`${dom.id}_${k}`]

          return (
            <div key={dom.id} style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 18, padding: 18, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#2a2118' }}>🚚 Tu domicilio</div>
                <div style={{ background: statusInfo.bg, borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: statusInfo.color }}>{statusInfo.label}</div>
              </div>

              {fechaStr && (
                <div style={{ fontSize: 13, color: 'rgba(42,33,24,0.6)', fontWeight: 600, marginBottom: 10 }}>
                  {fechaStr}{dom.horario ? ` · ${dom.horario}` : ''}
                </div>
              )}

              {/* Estados de cuenta colapsables por entrega */}
              {gruposEntrega.map((g) => (
                <div key={g.entrega_id} style={{ marginBottom: 4 }}>
                  <button onClick={() => toggleKey(`e_${g.entrega_id}`)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>📦</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2118' }}>Estado de cuenta{g.fecha ? ` · ${fmtFecha(g.fecha)}` : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#2a2118' }}>{money(g.total)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(42,33,24,0.4)', transform: isOpen(`e_${g.entrega_id}`) ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                    </div>
                  </button>
                  {isOpen(`e_${g.entrega_id}`) && (
                    <div style={{ padding: '8px 12px 4px' }}>
                      {g.items.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ fontSize: 12.5, color: '#2a2118' }}>{p.cantidad}x {p.descripcion}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2a2118', flexShrink: 0, marginLeft: 8 }}>{money(p.precio_venta)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Mercadito colapsable */}
              {(dom.mercadito_detalle || []).length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <button onClick={() => toggleKey('merc')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12 }}>🛍️</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2a2118' }}>Mercadito</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#2a2118' }}>{money(totalMerc)}</span>
                      <span style={{ fontSize: 11, color: 'rgba(42,33,24,0.4)', transform: isOpen('merc') ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                    </div>
                  </button>
                  {isOpen('merc') && (
                    <div style={{ padding: '8px 12px 4px' }}>
                      {(dom.mercadito_detalle || []).map((mp, i) =>
                        (mp.items || []).map((it, j) => (
                          <div key={`${i}-${j}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ fontSize: 12.5, color: '#2a2118' }}>{it.cantidad}x {it.nombre}</div>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2a2118', flexShrink: 0, marginLeft: 8 }}>{money((it.precio_unitario||0)*(it.cantidad||0))}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ borderTop: '1.5px solid rgba(0,0,0,0.06)', marginTop: 10, paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, color: 'rgba(42,33,24,0.6)' }}>Subtotal</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2a2118' }}>{money(subtotal)}</div>
                </div>
                {costoEnvio > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, color: 'rgba(42,33,24,0.6)' }}>Costo de envío</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2a2118' }}>{money(costoEnvio)}</div>
                  </div>
                )}
                {totalAnticipo > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, color: 'rgba(42,33,24,0.6)' }}>Anticipo pagado</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2e7d4f' }}>− {money(totalAnticipo)}</div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#2a2118' }}>Total</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#c1553a' }}>{money(porPagar)}</div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Qué quieres hacer */}
        <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>¿Qué quieres hacer?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <button onClick={() => router.push('/cliente/domicilio')} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#c1553a', border: 'none', borderRadius: 16, padding: '16px 18px', minHeight: 52, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 24 }}>🚚</div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, flex: 1 }}>Pedir domicilio</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>›</div>
          </button>
          <button onClick={() => router.push('/cliente/historial')} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px 18px', minHeight: 52, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 24 }}>🧾</div>
            <div style={{ color: '#2a2118', fontSize: 16, fontWeight: 600, flex: 1 }}>Historial de compras</div>
            <div style={{ color: 'rgba(0,0,0,0.3)', fontSize: 18 }}>›</div>
          </button>
          <a href="https://wa.me/526625486432" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#25D366', borderRadius: 16, padding: '16px 18px', minHeight: 52, textDecoration: 'none' }}>
            <div style={{ fontSize: 24 }}>💬</div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, flex: 1 }}>Escríbenos por WhatsApp</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 18 }}>›</div>
          </a>
        </div>

        {/* Tu Mercadito */}
        {productosDestacados.length > 0 && (
          <>
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>🛍️ Tu Mercadito</div>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
              {productosDestacados.map((p) => (
                <button key={p.id} onClick={() => router.push(`/mercadito/producto/${p.id}`)} style={{ flex: 'none', width: 132, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: 12, background: p.imagen_url ? `center/cover no-repeat url(${p.imagen_url})` : 'rgba(193,85,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
                    {!p.imagen_url && '🛍️'}
                  </div>
                  <div style={{ color: '#2a2118', fontSize: 13, fontWeight: 600, marginTop: 9, lineHeight: 1.3 }}>{p.nombre}</div>
                  <div style={{ color: '#c1553a', fontSize: 14, fontWeight: 800, marginTop: 4 }}>{money(p.precio_venta)}</div>
                </button>
              ))}
            </div>
          </>
        )}
        <button onClick={() => router.push('/mercadito')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#c1553a', border: 'none', borderRadius: 14, padding: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Ver todo el Mercadito</div>
          <div style={{ color: '#fff', fontSize: 16 }}>→</div>
        </button>
      </div>
    </TarjetaCliente>
  )
}
