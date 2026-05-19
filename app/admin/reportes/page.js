'use client'
import { useState, useEffect } from 'react'

export default function Reportes() {
  const [entregas, setEntregas] = useState([])
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('')
  const [metricas, setMetricas] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    fetch('/api/entregas')
      .then(r => r.json())
      .then(d => { if (d.ok) setEntregas(d.entregas) })
  }, [])

  useEffect(() => {
    if (!entregaSeleccionada) return
    setCargando(true)
    Promise.all([
      fetch(`/api/reportes/pedidos?entrega_id=${entregaSeleccionada}`).then(r => r.json()),
      fetch(`/api/reportes/pagos?entrega_id=${entregaSeleccionada}`).then(r => r.json())
    ]).then(([pedidosData, pagosData]) => {
      if (pedidosData.ok) setPedidos(pedidosData.pedidos)
      if (pagosData.ok) setPagos(pagosData.pagos)
      calcularMetricas(pedidosData.pedidos || [], pagosData.pagos || [])
      setCargando(false)
    })
  }, [entregaSeleccionada])

  const calcularMetricas = (peds, pays) => {
    const ventaTotal = peds.reduce((s, p) => s + (p.precio_venta || 0), 0)
    const costoTotal = peds.reduce((s, p) => s + (p.costo_mxn || 0), 0)
    const utilidadTotal = peds.reduce((s, p) => s + (p.utilidad || 0), 0)
    const margen = ventaTotal > 0 ? (utilidadTotal / ventaTotal) * 100 : 0
    const cobrado = pays.reduce((s, p) => s + (p.monto || 0), 0)
    const pendiente = ventaTotal - cobrado
    const anticipos = pays.filter(p => p.tipo === 'anticipo').reduce((s, p) => s + (p.monto || 0), 0)

    const porEfectivo = pays.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
const porTransferencia = pays.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
const porTerminal = pays.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)

    setMetricas({
      ventaTotal, costoTotal, utilidadTotal, margen,
      cobrado, pendiente, anticipos,
      porEfectivo, porTransferencia, porTerminal,
      totalPedidos: peds.length,
      totalClientes: [...new Set(peds.map(p => p.cliente_id))].length
    })
  }

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const porCliente = pedidos.reduce((acc, p) => {
    const key = p.cliente_id
    if (!acc[key]) acc[key] = { nombre: p.clientes?.nombre || 'Sin nombre', pedidos: [], venta: 0, costo: 0, utilidad: 0, cobrado: 0 }
    acc[key].pedidos.push(p)
    acc[key].venta += p.precio_venta || 0
    acc[key].costo += p.costo_mxn || 0
    acc[key].utilidad += p.utilidad || 0
    return acc
  }, {})

  pagos.forEach(pago => {
    const cliente = Object.values(porCliente).find(c => 
      porCliente[pago.cliente_id] && pago.cliente_id in porCliente
    )
    if (porCliente[pago.cliente_id]) {
      porCliente[pago.cliente_id].cobrado += pago.monto || 0
    }
  })

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-white text-2xl font-semibold mb-6">Reportes financieros</div>

        {/* Selector de entrega */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
          <label className="text-gray-400 text-sm block mb-2">Selecciona una entrega para ver sus números</label>
          <select value={entregaSeleccionada} onChange={e => setEntregaSeleccionada(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
            <option value="">— Selecciona entrega —</option>
            {entregas.map(e => (
              <option key={e.id} value={e.id}>{e.fecha_entrega} {e.nota ? `· ${e.nota}` : ''}</option>
            ))}
          </select>
        </div>

        {cargando && (
          <div className="text-center text-gray-400 py-12">Cargando datos...</div>
        )}

        {metricas && !cargando && (
          <>
            {/* Métricas principales */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs mb-1">Venta total</div>
                <div className="text-white text-2xl font-semibold">{fmt(metricas.ventaTotal)}</div>
                <div className="text-gray-500 text-xs mt-1">{metricas.totalPedidos} pedidos · {metricas.totalClientes} clientes</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs mb-1">Costo total</div>
                <div className="text-white text-2xl font-semibold">{fmt(metricas.costoTotal)}</div>
                <div className="text-gray-500 text-xs mt-1">Lo que pagaste en EUA</div>
              </div>
              <div className="bg-gray-900 border border-green-900 rounded-2xl p-5">
                <div className="text-gray-400 text-xs mb-1">Utilidad neta</div>
                <div className="text-green-400 text-2xl font-semibold">{fmt(metricas.utilidadTotal)}</div>
                <div className="text-green-700 text-xs mt-1">Margen {metricas.margen.toFixed(1)}%</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="text-gray-400 text-xs mb-1">Por cobrar</div>
                <div className="text-red-400 text-2xl font-semibold">{fmt(metricas.pendiente)}</div>
                <div className="text-gray-500 text-xs mt-1">Cobrado: {fmt(metricas.cobrado)}</div>
              </div>
            </div>

            {/* Desglose de cobranza */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
              <div className="text-white font-medium mb-4">Desglose de cobranza</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Cobrado en efectivo</span>
                  <span className="text-white font-medium">{fmt(metricas.porEfectivo)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Cobrado por transferencia</span>
                  <span className="text-white font-medium">{fmt(metricas.porTransferencia)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Cobrado por terminal</span>
                  <span className="text-white font-medium">{fmt(metricas.porTerminal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Anticipos registrados</span>
                  <span className="text-purple-400 font-medium">-{fmt(metricas.anticipos)}</span>
                </div>
                <div className="border-t border-gray-800 pt-3 flex justify-between items-center">
                  <span className="text-white font-medium">Total cobrado</span>
                  <span className="text-white font-semibold text-lg">{fmt(metricas.cobrado)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-red-400 font-medium">Pendiente por cobrar</span>
                  <span className="text-red-400 font-semibold text-lg">{fmt(metricas.pendiente)}</span>
                </div>
              </div>
            </div>

            {/* Desglose por cliente */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="text-white font-medium">Desglose por cliente</div>
              </div>
              <div className="grid grid-cols-5 gap-3 px-5 py-3 text-gray-500 text-xs uppercase border-b border-gray-800">
                <span>Cliente</span>
                <span className="text-right">Venta</span>
                <span className="text-right">Costo</span>
                <span className="text-right">Utilidad</span>
                <span className="text-right">Estado</span>
              </div>
              {Object.values(porCliente)
                .sort((a, b) => (b.venta - b.cobrado) - (a.venta - a.cobrado))
                .map((c, i) => {
                  const pendiente = c.venta - c.cobrado
                  return (
                    <div key={i} className="grid grid-cols-5 gap-3 px-5 py-4 border-b border-gray-800 last:border-0 text-sm">
                      <div className="text-white font-medium">{c.nombre}</div>
                      <div className="text-right text-white">{fmt(c.venta)}</div>
                      <div className="text-right text-gray-400">{fmt(c.costo)}</div>
                      <div className="text-right text-green-400">{fmt(c.utilidad)}</div>
                      <div className="text-right">
                        {pendiente <= 0
                          ? <span className="text-xs px-2 py-1 rounded-full bg-green-900 text-green-400">Liquidado</span>
                          : <span className="text-xs px-2 py-1 rounded-full bg-red-900 text-red-400">{fmt(pendiente)}</span>
                        }
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Lista de pedidos */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <div className="text-white font-medium">Todos los pedidos</div>
              </div>
              <div className="grid grid-cols-4 gap-3 px-5 py-3 text-gray-500 text-xs uppercase border-b border-gray-800">
                <span>Producto</span>
                <span className="text-right">Costo MXN</span>
                <span className="text-right">Venta</span>
                <span className="text-right">Utilidad</span>
              </div>
              {pedidos.map((p, i) => (
                <div key={i} className="grid grid-cols-4 gap-3 px-5 py-4 border-b border-gray-800 last:border-0 text-sm">
                  <div>
                    <div className="text-white">{p.descripcion}</div>
                    <div className="text-gray-500 text-xs">{p.clientes?.nombre} · {p.cantidad} pz</div>
                  </div>
                  <div className="text-right text-gray-400">{fmt(p.costo_mxn)}</div>
                  <div className="text-right text-white">{fmt(p.precio_venta)}</div>
                  <div className={`text-right font-medium ${(p.utilidad || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(p.utilidad)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!entregaSeleccionada && !cargando && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center text-gray-500">
            Selecciona una entrega para ver sus reportes
          </div>
        )}
      </div>
    </div>
  )
}