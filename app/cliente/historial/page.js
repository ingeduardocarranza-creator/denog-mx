'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'
import BotonCarrito from '../../components/mercadito/BotonCarrito'

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`
const fk = { fontFamily: 'var(--font-baloo2)' }

const badgeFragil = (
  <div style={{ background: 'rgba(250,204,21,0.18)', color: '#8a6d00', fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 }}>
    ⚠️ Frágil
  </div>
)

export default function HistorialCompras() {
  const [cargando, setCargando] = useState(true)
  const [pedidos, setPedidos] = useState([])
  const [pagos, setPagos] = useState([])
  const [pedidosMercadito, setPedidosMercadito] = useState([])
  const [abierto, setAbierto] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)

    fetch(`/api/cliente/pedidos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidos(d.pedidos); setCargando(false) })

    fetch(`/api/anticipos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPagos(d.anticipos || []) })

    fetch(`/api/cliente/mercadito?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidosMercadito(d.pedidos || []) })
  }, [])

  const formatearFecha = (fecha) => {
    if (!fecha) return ''
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    const d = new Date(fecha + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]}`
  }

  const getTotalPagado = (entrega_id) => pagos.filter(a => a.entrega_id === entrega_id).reduce((s, a) => s + (a.monto || 0), 0)

  const porEntrega = pedidos.reduce((acc, p) => {
    const fecha = p.entregas?.fecha_entrega || 'Sin entrega'
    if (!acc[fecha]) acc[fecha] = { fecha, items: [], entrega_id: p.entrega_id }
    acc[fecha].items.push(p)
    return acc
  }, {})

  const entregasEntregadas = Object.values(porEntrega)
    .filter(e => e.items.every(p => p.estado?.toLowerCase() === 'entregado'))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map(e => {
      const lugares = [...new Set(e.items.map(p => p.lugar_compra).filter(Boolean))]
      const total = e.items.reduce((s, p) => s + (p.precio_venta || 0), 0)
      return {
        key: 'encargo-' + e.fecha,
        tipo: 'encargo',
        nombre: lugares[0] ? `Pedido de ${lugares[0]}` : 'Tu pedido',
        fecha: e.fecha,
        total,
        pagado: getTotalPagado(e.entrega_id),
        items: e.items.map(p => ({ nombre: p.descripcion, cantidad: p.cantidad, precio: p.precio_venta, fragil: p.apartado_fragil })),
      }
    })

  const mercaditoEntregado = pedidosMercadito
    .filter(p => p.estado === 'entregado')
    .sort((a, b) => new Date(b.actualizado_en || b.creado_en) - new Date(a.actualizado_en || a.creado_en))
    .map(p => {
      const primerItem = p.items?.[0]?.nombre || 'Producto'
      const extra = (p.items?.length || 0) - 1
      const total = (p.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
      return {
        key: 'mercadito-' + p.id,
        tipo: 'mercadito',
        nombre: `Mercadito · ${primerItem}${extra > 0 ? ` +${extra} más` : ''}`,
        folio: p.folio,
        fecha: (p.actualizado_en || p.creado_en || '').slice(0, 10),
        total,
        items: (p.items || []).map(it => ({ nombre: it.nombre, cantidad: it.cantidad, precio: it.precio_unitario, fragil: it.apartado_fragil })),
      }
    })

  const historial = [...entregasEntregadas, ...mercaditoEntregado].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

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
            <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>Historial de compras</div>
          </button>
          <BotonCarrito />
        </div>

        {historial.length === 0 ? (
          <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 13 }}>
            Todavía no tienes compras completadas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {historial.map(h => {
              const expandido = abierto === h.key
              return (
                <div key={h.key} style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                  <button
                    onClick={() => setAbierto(expandido ? null : h.key)}
                    style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <div>
                      <div style={{ color: '#2a2118', fontSize: 14, fontWeight: 600 }}>{h.nombre}</div>
                      <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12, marginTop: 2 }}>
                        Entregado · {formatearFecha(h.fecha)}{h.folio ? ` · ${h.folio}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ color: '#2a2118', fontSize: 14, fontWeight: 800 }}>{money(h.total)}</div>
                      <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 12, transform: expandido ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</div>
                    </div>
                  </button>

                  {expandido && (
                    <div style={{ borderTop: '1.5px solid rgba(0,0,0,0.06)', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                        {h.items.map((it, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <div style={{ color: '#2a2118', fontSize: 13.5 }}>{it.cantidad}x {it.nombre}</div>
                              {it.fragil && badgeFragil}
                            </div>
                            <div style={{ color: '#2a2118', fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>{money(it.precio)}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: '1.5px solid rgba(0,0,0,0.06)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {h.tipo === 'encargo' && h.pagado > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 12.5 }}>Anticipo pagado</div>
                            <div style={{ color: '#2e7d4f', fontSize: 13, fontWeight: 700 }}>{money(h.pagado)}</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ color: '#2a2118', fontSize: 13.5, fontWeight: 700 }}>Total</div>
                          <div style={{ color: '#c1553a', fontSize: 15, fontWeight: 800 }}>{money(h.total)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </TarjetaCliente>
  )
}
