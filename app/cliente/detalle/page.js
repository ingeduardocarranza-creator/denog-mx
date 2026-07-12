'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'
import BotonCarrito from '../../components/mercadito/BotonCarrito'

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`
const fk = { fontFamily: 'var(--font-baloo2)' }

const badgeFragil = (
  <div style={{ background: 'rgba(250,204,21,0.18)', color: '#8a6d00', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
    ⚠️ Frágil
  </div>
)

export default function DetalleCuenta() {
  const [cargando, setCargando] = useState(true)
  const [pedidos, setPedidos] = useState([])
  const [domicilios, setDomicilios] = useState([])
  const [pagos, setPagos] = useState([])
  const [pedidosMercadito, setPedidosMercadito] = useState([])
  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)

    fetch(`/api/cliente/pedidos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setPedidos(d.pedidos); setDomicilios(d.domicilios || []) }
        setCargando(false)
      })

    fetch(`/api/anticipos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPagos(d.anticipos || []) })

    fetch(`/api/cliente/mercadito?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidosMercadito(d.pedidos || []) })
  }, [])

  const porEntrega = pedidos.reduce((acc, p) => {
    const fecha = p.entregas?.fecha_entrega || 'Sin entrega'
    if (!acc[fecha]) acc[fecha] = { items: [], estado: p.entregas?.estado || 'futura', entrega_id: p.entrega_id }
    acc[fecha].items.push(p)
    return acc
  }, {})

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

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]}`
  }

  const estadoPill = (entrega) => {
    if (entrega.estado === 'en_tienda') return { label: 'En tienda', bg: 'rgba(46,125,79,0.12)', color: '#2e7d4f' }
    return { label: 'En camino', bg: 'rgba(193,85,58,0.1)', color: '#a3432b' }
  }

  const mercaditoDebido = pedidosMercadito.filter(p => ['aprobado', 'agregado'].includes(p.estado))
  const totalMercaditoPedido = (p) => (p.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
  const itemsMercadito = mercaditoDebido.flatMap(p => p.items || [])
  const totalMercadito = mercaditoDebido.reduce((s, p) => s + totalMercaditoPedido(p), 0)

  let totalEncargoPendiente = 0

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <button onClick={() => router.push('/cliente')} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            <div style={{ color: '#2a2118', fontSize: 20 }}>←</div>
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>Detalle de mi cuenta</div>
          </button>
          <BotonCarrito />
        </div>

        {entregasPendientes.length === 0 && itemsMercadito.length === 0 && (
          <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(42,33,24,0.5)', fontSize: 14 }}>
            No tienes saldos pendientes. 🎉
          </div>
        )}

        {entregasPendientes.map((entrega) => {
          const subtotalItems = entrega.items.reduce((s, p) => s + (p.precio_venta || 0), 0)
          const domicilio = getDomicilioEntrega(entrega.entrega_id)
          const costoEnvio = domicilio?.costo_envio || 0
          const subtotal = subtotalItems + costoEnvio
          const pagado = getTotalPagado(entrega.entrega_id)
          const saldoPendiente = Math.max(0, subtotal - pagado)
          totalEncargoPendiente += saldoPendiente
          const pill = estadoPill(entrega)
          const hayFragil = entrega.items.some(p => p.apartado_fragil)

          return (
            <div key={entrega.fecha}>
              <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>📦 Tu pedido de EE. UU.</div>
              <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 13, fontWeight: 600 }}>Pedido · llega {formatearFecha(entrega.fecha)}</div>
                  <div style={{ background: pill.bg, color: pill.color, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 10px' }}>{pill.label}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {entrega.items.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ color: '#2a2118', fontSize: 14.5 }}>{p.cantidad}x {p.descripcion}</div>
                        {p.apartado_fragil && badgeFragil}
                      </div>
                      <div style={{ color: '#2a2118', fontSize: 14.5, fontWeight: 700, flexShrink: 0 }}>{money(p.precio_venta)}</div>
                    </div>
                  ))}
                  {costoEnvio > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ color: '#2a2118', fontSize: 14.5 }}>Envío y servicio</div>
                      <div style={{ color: '#2a2118', fontSize: 14.5, fontWeight: 700 }}>{money(costoEnvio)}</div>
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1.5px solid rgba(0,0,0,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: hayFragil ? 10 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13.5 }}>Total del pedido</div>
                    <div style={{ color: '#2a2118', fontSize: 14.5, fontWeight: 700 }}>{money(subtotal)}</div>
                  </div>
                  {pagado > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13.5 }}>Anticipo pagado</div>
                      <div style={{ color: '#2e7d4f', fontSize: 14.5, fontWeight: 700 }}>{money(pagado)}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ color: '#2a2118', fontSize: 15, fontWeight: 700 }}>Saldo pendiente</div>
                    <div style={{ color: '#c1553a', fontSize: 18, fontWeight: 800 }}>{money(saldoPendiente)}</div>
                  </div>
                </div>
                {hayFragil && (
                  <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 11.5, lineHeight: 1.5 }}>⚠️ Los artículos frágiles se entregan por separado, en su propio empaque.</div>
                )}
              </div>
            </div>
          )
        })}

        {itemsMercadito.length > 0 && (
          <>
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>🛍️ Tu Mercadito</div>
            <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Comprado directo del catálogo · disponible para recoger en tienda</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {itemsMercadito.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ color: '#2a2118', fontSize: 14.5 }}>{it.cantidad}x {it.nombre}</div>
                      {it.apartado_fragil && badgeFragil}
                    </div>
                    <div style={{ color: '#2a2118', fontSize: 14.5, fontWeight: 700, flexShrink: 0 }}>{money((it.precio_unitario || 0) * (it.cantidad || 1))}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1.5px solid rgba(0,0,0,0.08)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: itemsMercadito.some(it => it.apartado_fragil) ? 10 : 0 }}>
                <div style={{ color: '#2a2118', fontSize: 15, fontWeight: 700 }}>Total Mercadito</div>
                <div style={{ color: '#2a2118', fontSize: 18, fontWeight: 800 }}>{money(totalMercadito)}</div>
              </div>
              {itemsMercadito.some(it => it.apartado_fragil) && (
                <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 11.5, lineHeight: 1.5 }}>⚠️ Los artículos frágiles se entregan por separado, en su propio empaque.</div>
              )}
            </div>
          </>
        )}

        {(entregasPendientes.length > 0 || itemsMercadito.length > 0) && (
          <div style={{ background: '#2a2118', borderRadius: 20, padding: '20px 22px' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Resumen — todo lo que debes hoy</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>Saldo pendiente del encargo</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{money(totalEncargoPendiente)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>+ Tu Mercadito</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{money(totalMercadito)}</div>
            </div>
            <div style={{ borderTop: '1.5px solid rgba(255,255,255,0.2)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Total a pagar</div>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>{money(totalEncargoPendiente + totalMercadito)}</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>El encargo se cobra cuando llegue tu entrega; el Mercadito ya está listo para recoger en tienda.</div>
          </div>
        )}
      </div>
    </TarjetaCliente>
  )
}
