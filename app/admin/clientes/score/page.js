'use client'
import { useState, useEffect } from 'react'

export default function ScoreClientes() {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarScores()
  }, [])

  const cargarScores = async () => {
    const [clientesRes, pedidosRes, pagosRes, entregasRes] = await Promise.all([
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/score/pedidos').then(r => r.json()),
      fetch('/api/score/pagos').then(r => r.json()),
      fetch('/api/entregas').then(r => r.json()),
    ])

    if (!clientesRes.ok) return

    const pedidos = pedidosRes.pedidos || []
    const pagos = pagosRes.pagos || []
    const entregas = entregasRes.entregas || []

    const clientesConScore = clientesRes.clientes.map(c => {
      const pedidosCliente = pedidos.filter(p => p.cliente_id === c.id)
      const pagosCliente = pagos.filter(p => p.cliente_id === c.id)
      const entregasCliente = [...new Set(pedidosCliente.map(p => p.entrega_id))].filter(Boolean)

      // Frecuencia (25 pts)
      const totalEntregas = entregas.length || 1
      const participacion = entregasCliente.length / totalEntregas
      const puntsFrecuencia = Math.min(25, Math.round(participacion * 25 + entregasCliente.length * 2))

      // Volumen (25 pts)
      const totalGastado = pedidosCliente.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const promedioEntrega = entregasCliente.length > 0 ? totalGastado / entregasCliente.length : 0
      const puntsVolumen = Math.min(25, Math.round((promedioEntrega / 2000) * 25))

      // Puntualidad (40 pts)
      const totalPagado = pagosCliente.reduce((s, p) => s + (p.monto || 0), 0)
      const totalDebe = pedidosCliente.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const porcentajePagado = totalDebe > 0 ? totalPagado / totalDebe : 1
      const puntsPuntualidad = Math.min(40, Math.round(porcentajePagado * 40))

      // Deudas (10 pts)
      const tieneDeuda = totalDebe > totalPagado
      const puntsDeuda = tieneDeuda ? Math.max(0, 10 - Math.round(((totalDebe - totalPagado) / totalDebe) * 10)) : 10

      const score = Math.min(100, puntsFrecuencia + puntsVolumen + puntsPuntualidad + puntsDeuda)

      let categoria = ''
      let color = ''
      let badge = ''
      if (score >= 80) { categoria = 'VIP'; color = '#f59e0b'; badge = '⭐' }
      else if (score >= 60) { categoria = 'Buen cliente'; color = '#4ade80'; badge = '✅' }
      else if (score >= 40) { categoria = 'Vigilar'; color = '#fb923c'; badge = '⚠️' }
      else { categoria = 'Riesgo'; color = '#f87171'; badge = '🔴' }

      return {
        ...c,
        score,
        categoria,
        color,
        badge,
        totalGastado,
        totalPagado,
        totalDebe,
        entregasCount: entregasCliente.length,
        detalles: {
          frecuencia: puntsFrecuencia,
          volumen: puntsVolumen,
          puntualidad: puntsPuntualidad,
          deuda: puntsDeuda
        }
      }
    })

    setClientes(clientesConScore.sort((a, b) => b.score - a.score))
    setCargando(false)
  }

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

  const [expandido, setExpandido] = useState(null)

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="text-white text-2xl font-semibold">Score de clientes</div>
          <div className="text-gray-400 text-sm mt-1">Calificación automática basada en historial de compras y pagos</div>
        </div>

        {/* Leyenda */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { badge: '⭐', label: 'VIP', rango: '80-100', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
            { badge: '✅', label: 'Buen cliente', rango: '60-79', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)' },
            { badge: '⚠️', label: 'Vigilar', rango: '40-59', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' },
            { badge: '🔴', label: 'Riesgo', rango: '0-39', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
          ].map((cat, i) => (
            <div key={i} style={{ background: cat.bg, border: `1px solid ${cat.border}` }} className="rounded-2xl p-3 text-center">
              <div className="text-lg mb-1">{cat.badge}</div>
              <div style={{ color: cat.color }} className="text-xs font-semibold">{cat.label}</div>
              <div className="text-gray-500 text-xs">{cat.rango} pts</div>
            </div>
          ))}
        </div>

        {cargando ? (
          <div className="text-center text-gray-400 py-12">Calculando scores...</div>
        ) : (
          <div className="space-y-3">
            {clientes.filter(c => c.rol !== 'admin').map((c, i) => (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-800 transition-colors"
                  onClick={() => setExpandido(expandido === c.id ? null : c.id)}
                >
                  {/* Posición */}
                  <div className="text-gray-600 text-sm w-5 text-center font-mono">#{i + 1}</div>

                  {/* Nombre y badge */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{c.nombre}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${c.color}20`, color: c.color }}>
                        {c.badge} {c.categoria}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">{c.usuario} · {c.entregasCount} entregas</div>
                  </div>

                  {/* Barra de score */}
                  <div className="w-32">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-gray-500">Score</span>
                      <span className="text-xs font-bold" style={{ color: c.color }}>{c.score}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${c.score}%`, background: c.color }}/>
                    </div>
                  </div>

                  {/* Flecha */}
                  <div className="text-gray-600 text-sm">{expandido === c.id ? '▲' : '▼'}</div>
                </div>

                {/* Detalle expandido */}
                {expandido === c.id && (
                  <div className="px-5 pb-5 border-t border-gray-800 pt-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-gray-500 text-xs mb-3">Desglose del score</div>
                        {[
                          { label: 'Puntualidad de pago', pts: c.detalles.puntualidad, max: 40 },
                          { label: 'Frecuencia de compra', pts: c.detalles.frecuencia, max: 25 },
                          { label: 'Volumen de compra', pts: c.detalles.volumen, max: 25 },
                          { label: 'Sin deudas vencidas', pts: c.detalles.deuda, max: 10 },
                        ].map((d, j) => (
                          <div key={j} className="mb-2">
                            <div className="flex justify-between mb-1">
                              <span className="text-gray-400 text-xs">{d.label}</span>
                              <span className="text-white text-xs font-medium">{d.pts}/{d.max}</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(d.pts / d.max) * 100}%`, background: c.color }}/>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs mb-3">Resumen financiero</div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-xs">Total comprado</span>
                            <span className="text-white text-xs font-medium">{fmt(c.totalDebe)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-xs">Total pagado</span>
                            <span className="text-green-400 text-xs font-medium">{fmt(c.totalPagado)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-800 pt-2">
                            <span className="text-gray-400 text-xs">Saldo pendiente</span>
                            <span className={`text-xs font-medium ${c.totalDebe - c.totalPagado > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {fmt(Math.max(0, c.totalDebe - c.totalPagado))}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-xs">Entregas activas</span>
                            <span className="text-white text-xs font-medium">{c.entregasCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}