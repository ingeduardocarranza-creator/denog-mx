'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientePortal() {
  const [pedidos, setPedidos] = useState([])
  const [cliente, setCliente] = useState(null)
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)
    setCliente(c)
    fetch(`/api/cliente/pedidos?cliente_id=${c.id}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPedidos(d.pedidos); setCargando(false) })
  }, [])

  const porEntrega = pedidos.reduce((acc, p) => {
    const fecha = p.entregas?.fecha_entrega || 'Sin entrega'
    if (!acc[fecha]) acc[fecha] = []
    acc[fecha].push(p)
    return acc
  }, {})

  const totalPendiente = pedidos
    .filter(p => p.estado !== 'entregado')
    .reduce((s, p) => s + (p.precio_venta || 0), 0)

  const salir = () => { localStorage.removeItem('cliente'); router.push('/') }

  if (cargando) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400">Cargando...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="text-white text-xl font-semibold">Hola, {cliente?.nombre} 👋</div>
            <div className="text-gray-400 text-sm">Tu cuenta de encargos · Denog USA Compras</div>
          </div>
          <button onClick={salir} className="text-gray-500 text-sm hover:text-white">Salir</button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-gray-400 text-xs mb-1">Pedidos</div>
            <div className="text-white text-2xl font-semibold">{pedidos.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-gray-400 text-xs mb-1">Entregas</div>
            <div className="text-white text-2xl font-semibold">{Object.keys(porEntrega).length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-gray-400 text-xs mb-1">Saldo pendiente</div>
            <div className="text-red-400 text-2xl font-semibold">${totalPendiente.toLocaleString('es-MX')}</div>
          </div>
        </div>

        {Object.keys(porEntrega).length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500">
            No tienes pedidos registrados aún
          </div>
        ) : (
          Object.entries(porEntrega).map(([fecha, items]) => (
            <div key={fecha} className="bg-gray-900 border border-gray-800 rounded-2xl mb-4 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex justify-between items-center">
                <span className="text-blue-400 text-sm font-medium">Entrega {fecha}</span>
                <span className="text-gray-500 text-xs">{items.length} producto{items.length > 1 ? 's' : ''}</span>
              </div>
              {items.map(p => (
                <div key={p.id} className="px-5 py-4 border-b border-gray-800 last:border-0 flex justify-between items-start">
                  <div>
                    <div className="text-white text-sm font-medium">{p.descripcion}</div>
                    <div className="text-gray-500 text-xs mt-1">{p.lugar_compra} · {p.cantidad} pz · {p.fecha_compra}</div>
                    <div className="mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.estado === 'entregado' ? 'bg-green-900 text-green-400' :
                        p.estado === 'listo' ? 'bg-teal-900 text-teal-400' :
                        p.estado === 'camino' ? 'bg-yellow-900 text-yellow-400' :
                        'bg-blue-900 text-blue-400'
                      }`}>
                        {p.estado === 'comprado' ? '🛍️ Comprado' :
                         p.estado === 'camino' ? '🚚 En camino' :
                         p.estado === 'listo' ? '📦 Listo para entregar' : '✅ Entregado'}
                      </span>
                    </div>
                  </div>
                  <div className="text-white font-medium text-sm">${p.precio_venta?.toLocaleString('es-MX')}</div>
                </div>
              ))}
              <div className="px-5 py-3 bg-gray-800 flex justify-between text-sm font-medium">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">${items.reduce((s,p) => s + (p.precio_venta||0), 0).toLocaleString('es-MX')}</span>
              </div>
            </div>
          ))
        )}

        <div className="bg-gray-900 border border-blue-800 rounded-2xl p-4 text-center">
          <p className="text-gray-400 text-sm">¿Tienes dudas? Escríbenos por WhatsApp</p>
        </div>
      </div>
    </div>
  )
}