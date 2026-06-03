'use client'
import { useState, useEffect } from 'react'

const fmt = (n) => `$${(n || 0).toLocaleString('es-MX')}`

const getFechaRango = (periodo) => {
  const ahora = new Date()
  const hoy = ahora.toISOString().split('T')[0]
  if (periodo === 'hoy') return { desde: hoy, hasta: hoy }
  if (periodo === 'quincena') {
    const dia = ahora.getDate()
    const mes = ahora.getMonth()
    const anio = ahora.getFullYear()
    const desde = dia <= 15
      ? new Date(anio, mes, 1).toISOString().split('T')[0]
      : new Date(anio, mes, 16).toISOString().split('T')[0]
    return { desde, hasta: hoy }
  }
  if (periodo === 'mes') {
    const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().split('T')[0]
    return { desde, hasta: hoy }
  }
  if (periodo === 'anterior') {
    const primerDiaMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    const ultimoDiaMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0)
    return {
      desde: primerDiaMesAnterior.toISOString().split('T')[0],
      hasta: ultimoDiaMesAnterior.toISOString().split('T')[0]
    }
  }
  return { desde: hoy, hasta: hoy }
}

export default function Colaboradores() {
  const [periodo, setPeriodo] = useState('mes')
  const [cargando, setCargando] = useState(true)
  const [ranking, setRanking] = useState([])
  const [expandido, setExpandido] = useState(null)
  const [clientes, setClientes] = useState([])

  useEffect(() => { cargar() }, [periodo])

  const cargar = async () => {
    setCargando(true)
    const { desde, hasta } = getFechaRango(periodo)

    const [clientesRes, pedidosRes, pagosRes] = await Promise.all([
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch(`/api/reportes/pedidos?desde=${desde}&hasta=${hasta}`).then(r => r.json()),
      fetch(`/api/reportes/pagos?desde=${desde}&hasta=${hasta}`).then(r => r.json())
    ])

    if (!clientesRes.ok) { setCargando(false); return }

    const vendedores = clientesRes.clientes.filter(c => c.rol === 'admin' || c.rol === 'vendedor')
    setClientes(clientesRes.clientes)

    const pedidos = pedidosRes.ok ? (pedidosRes.pedidos || []) : []
    const pagos = pagosRes.ok ? (pagosRes.pagos || []) : []

    const rankingData = vendedores.map(v => {
      const pedidosVendedor = pedidos.filter(p => p.vendedor_id === v.id)
      const pagosVendedor = pagos.filter(p => p.vendedor_id === v.id)

      const totalVendido = pedidosVendedor.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const totalUtilidad = pedidosVendedor.reduce((s, p) => s + (p.utilidad || 0), 0)
      const margen = totalVendido > 0 ? (totalUtilidad / totalVendido) * 100 : 0

      const encargos = pedidosVendedor.filter(p => p.cliente_id)
      const tienda = pagosVendedor.filter(p => p.tipo === 'Venta Liquidación' && !p.cliente_id)

      return {
        ...v,
        totalVendido,
        totalUtilidad,
        margen,
        numVentas: pedidosVendedor.length,
        encargos,
        tienda,
        iniciales: v.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
      }
    }).sort((a, b) => b.totalVendido - a.totalVendido)

    setRanking(rankingData)
    setCargando(false)
  }

  const totalGeneral = ranking.reduce((s, v) => s + v.totalVendido, 0)
  const totalUtilidad = ranking.reduce((s, v) => s + v.totalUtilidad, 0)
  const totalVentas = ranking.reduce((s, v) => s + v.numVentas, 0)

  const colores = ['#f59e0b', 'rgba(255,255,255,0.6)', '#cd7c2f']
  const bgColores = ['rgba(245,158,11,0.15)', 'rgba(255,255,255,0.08)', 'rgba(205,124,47,0.15)']
  const borderColores = ['rgba(245,158,11,0.3)', 'rgba(255,255,255,0.1)', 'rgba(205,124,47,0.3)']
  const medallas = ['🥇', '🥈', '🥉']
  const periodos = [
    { id: 'hoy', label: 'Hoy' },
    { id: 'quincena', label: 'Quincena' },
    { id: 'mes', label: 'Mes' },
    { id: 'anterior', label: 'Anterior' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>🏆 Rendimiento de colaboradores</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>Ventas y utilidades por vendedor</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {periodos.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                style={{ background: periodo === p.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${periodo === p.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '5px 12px', color: periodo === p.id ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: periodo === p.id ? 600 : 400, cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 60 }}>Cargando...</div>
        ) : ranking.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 60 }}>No hay ventas registradas en este período</div>
        ) : (
          <>
            {/* Podio */}
            {ranking.length >= 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: ranking.length === 1 ? '1fr' : ranking.length === 2 ? '1fr 1.2fr' : '1fr 1.2fr 1fr', gap: 8, marginBottom: 20, alignItems: 'end' }}>
                {[ranking[1], ranking[0], ranking[2]].filter(Boolean).map((v, i) => {
                  const posReal = i === 0 ? 1 : i === 1 ? 0 : 2
                  const medalla = medallas[posReal]
                  const esTop = posReal === 0
                  return (
                    <div key={v.id} style={{ background: esTop ? bgColores[0] : 'rgba(255,255,255,0.03)', border: `1px solid ${esTop ? borderColores[0] : 'rgba(255,255,255,0.08)'}`, borderRadius: esTop ? 16 : 14, padding: esTop ? 16 : 14, textAlign: 'center' }}>
                      <div style={{ fontSize: esTop ? 28 : 22, marginBottom: 6 }}>{medalla}</div>
                      <div style={{ width: esTop ? 40 : 34, height: esTop ? 40 : 34, borderRadius: '50%', background: `rgba(${esTop ? '245,158,11' : '255,255,255'},0.15)`, border: `2px solid ${esTop ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: esTop ? 13 : 11, color: esTop ? '#f59e0b' : 'rgba(255,255,255,0.6)', fontWeight: 700, margin: '0 auto 8px' }}>
                        {v.iniciales}
                      </div>
                      <div style={{ color: 'white', fontSize: esTop ? 13 : 12, fontWeight: 700 }}>{v.nombre.split(' ')[0]} {v.nombre.split(' ')[1]}</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, margin: '2px 0 6px' }}>{v.numVentas} ventas</div>
                      <div style={{ color: esTop ? '#f59e0b' : 'white', fontSize: esTop ? 20 : 15, fontWeight: 800 }}>{fmt(v.totalVendido)}</div>
                      <div style={{ color: '#10b981', fontSize: esTop ? 12 : 10, marginTop: 2 }}>+{fmt(v.totalUtilidad)} utilidad</div>
                      {esTop && (
                        <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '2px 10px', display: 'inline-block', marginTop: 8 }}>
                          <span style={{ color: '#f59e0b', fontSize: 9, fontWeight: 700 }}>⭐ TOP VENDEDOR</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Lista expandible */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {ranking.map((v, idx) => (
                <div key={v.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${expandido === v.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div onClick={() => setExpandido(expandido === v.id ? null : v.id)}
                    style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: idx === 0 ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: idx === 0 ? '#f59e0b' : '#818cf8', fontWeight: 700 }}>
                        {v.iniciales}
                      </div>
                      <div>
                        <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{v.nombre}</div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{v.rol === 'admin' ? 'Admin' : 'Vendedor'} · {v.numVentas} ventas</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{fmt(v.totalVendido)}</div>
                        <div style={{ color: '#10b981', fontSize: 11 }}>+{fmt(v.totalUtilidad)} utilidad</div>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{expandido === v.id ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {expandido === v.id && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>

                      {/* Encargos */}
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📦 Encargos (pedidos)</div>
                      {v.encargos.length === 0 ? (
                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginBottom: 16, padding: '8px 0' }}>Sin encargos en este período</div>
                      ) : (
                        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '6px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Producto</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'center' }}>Cant.</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'right' }}>Precio</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'right' }}>Utilidad</span>
                          </div>
                          {v.encargos.map((p, i) => (
                            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '7px 12px', borderBottom: i < v.encargos.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{p.descripcion}</span>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>{p.cantidad}</span>
                              <span style={{ color: 'white', fontSize: 11, textAlign: 'right', fontWeight: 600 }}>{fmt(p.precio_venta)}</span>
                              <span style={{ color: '#10b981', fontSize: 11, textAlign: 'right', fontWeight: 600 }}>{fmt(p.utilidad)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Subtotal encargos</span>
                            <span></span>
                            <span style={{ color: 'white', fontSize: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(v.encargos.reduce((s, p) => s + (p.precio_venta || 0), 0))}</span>
                            <span style={{ color: '#10b981', fontSize: 12, textAlign: 'right', fontWeight: 700 }}>{fmt(v.encargos.reduce((s, p) => s + (p.utilidad || 0), 0))}</span>
                          </div>
                        </div>
                      )}

                      {/* Resumen del vendedor */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 3 }}>Total vendido</div>
                          <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{fmt(v.totalVendido)}</div>
                        </div>
                        <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(16,185,129,0.6)', fontSize: 10, marginBottom: 3 }}>Utilidad</div>
                          <div style={{ color: '#10b981', fontSize: 14, fontWeight: 700 }}>{fmt(v.totalUtilidad)}</div>
                        </div>
                        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ color: 'rgba(129,140,248,0.6)', fontSize: 10, marginBottom: 3 }}>Margen</div>
                          <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700 }}>{v.margen.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totales */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4 }}>Total ventas</div>
                <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>{totalVentas}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4 }}>Total vendido</div>
                <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>{fmt(totalGeneral)}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                <div style={{ color: 'rgba(16,185,129,0.6)', fontSize: 10, marginBottom: 4 }}>Total utilidad</div>
                <div style={{ color: '#10b981', fontSize: 22, fontWeight: 700 }}>{fmt(totalUtilidad)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}