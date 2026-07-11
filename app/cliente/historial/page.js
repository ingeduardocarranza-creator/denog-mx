'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TarjetaCliente from '../../components/cliente/TarjetaCliente'

const money = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`
const fk = { fontFamily: 'var(--font-baloo2)' }

export default function HistorialCompras() {
  const [cargando, setCargando] = useState(true)
  const [pedidos, setPedidos] = useState([])
  const [pedidosMercadito, setPedidosMercadito] = useState([])
  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)

    fetch(`/api/cliente/pedidos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidos(d.pedidos); setCargando(false) })

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

  const porEntrega = pedidos.reduce((acc, p) => {
    const fecha = p.entregas?.fecha_entrega || 'Sin entrega'
    if (!acc[fecha]) acc[fecha] = { fecha, items: [] }
    acc[fecha].items.push(p)
    return acc
  }, {})

  const entregasEntregadas = Object.values(porEntrega)
    .filter(e => e.items.every(p => p.estado?.toLowerCase() === 'entregado'))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map(e => {
      const lugares = [...new Set(e.items.map(p => p.lugar_compra).filter(Boolean))]
      return {
        key: 'encargo-' + e.fecha,
        nombre: lugares[0] ? `Pedido de ${lugares[0]}` : 'Tu pedido',
        fecha: e.fecha,
        total: e.items.reduce((s, p) => s + (p.precio_venta || 0), 0),
      }
    })

  const mercaditoEntregado = pedidosMercadito
    .filter(p => p.estado === 'agregado')
    .sort((a, b) => new Date(b.actualizado_en || b.creado_en) - new Date(a.actualizado_en || a.creado_en))
    .map(p => {
      const primerItem = p.items?.[0]?.nombre || 'Producto'
      const extra = (p.items?.length || 0) - 1
      const total = (p.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
      return {
        key: 'mercadito-' + p.id,
        nombre: `Mercadito · ${primerItem}${extra > 0 ? ` +${extra} más` : ''}`,
        fecha: (p.actualizado_en || p.creado_en || '').slice(0, 10),
        total,
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

        <button onClick={() => router.push('/cliente')} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          <div style={{ color: '#2a2118', fontSize: 20 }}>←</div>
          <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 19, ...fk }}>Historial de compras</div>
        </button>

        {historial.length === 0 ? (
          <div style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 13 }}>
            Todavía no tienes compras completadas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {historial.map(h => (
              <div key={h.key} style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#2a2118', fontSize: 14, fontWeight: 600 }}>{h.nombre}</div>
                  <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12, marginTop: 2 }}>Entregado · {formatearFecha(h.fecha)}</div>
                </div>
                <div style={{ color: '#2a2118', fontSize: 14, fontWeight: 800 }}>{money(h.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TarjetaCliente>
  )
}
