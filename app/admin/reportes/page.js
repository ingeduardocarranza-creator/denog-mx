'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'

export default function Reportes() {
  const [seccion, setSeccion] = useState('entregas')
  const [periodoEntrega, setPeriodoEntrega] = useState('hoy')
  const [periodoTienda, setPeriodoTienda] = useState('hoy')

  const [entregas, setEntregas] = useState([])
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('')
  const [cargando, setCargando] = useState(false)

  // Datos entregas período
  const [metricasE, setMetricasE] = useState(null)
  const [porClienteE, setPorClienteE] = useState([])
  const [datosGraficaE, setDatosGraficaE] = useState([])

  // Datos estado de cuenta
  const [metricasEC, setMetricasEC] = useState(null)
  const [porClienteEC, setPorClienteEC] = useState([])

  // Datos tienda
  const [metricasT, setMetricasT] = useState(null)
  const [topProductos, setTopProductos] = useState([])
  const [datosGraficaT, setDatosGraficaT] = useState([])

  // Raw data para exportar Excel
  const [rawPedidos, setRawPedidos] = useState([])
  const [rawPagos, setRawPagos] = useState([])

  // Categorías
  const [categoriasReporte, setCategoriasReporte] = useState([])
  const [filtroCatReporte, setFiltroCatReporte] = useState('')

  const chartERef = useRef(null)
  const chartTRef = useRef(null)
  const chartEInstance = useRef(null)
  const chartTInstance = useRef(null)

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  const getRango = (periodo) => {
    const ahora = new Date()
    const hoy = ahora.toISOString().split('T')[0]
    if (periodo === 'hoy') return { desde: hoy, hasta: hoy }
    if (periodo === 'semana') {
      const d = new Date(ahora); d.setDate(d.getDate() - 7)
      return { desde: d.toISOString().split('T')[0], hasta: hoy }
    }
    if (periodo === 'mes') {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      return { desde: d.toISOString().split('T')[0], hasta: hoy }
    }
    return { desde: hoy, hasta: hoy }
  }

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => { if (d.ok) setEntregas(d.entregas) })
    fetch('/api/categorias').then(r => r.json()).then(d => { if (d.ok) setCategoriasReporte(d.categorias) })
  }, [])

  useEffect(() => {
    if (seccion === 'entregas' && periodoEntrega !== 'estado') cargarDatosEntregas()
  }, [periodoEntrega, seccion])

  useEffect(() => {
    if (seccion === 'tienda') cargarDatosTienda()
  }, [periodoTienda, seccion])

  useEffect(() => {
    if (entregaSeleccionada && periodoEntrega === 'estado') cargarEstadoCuenta()
  }, [entregaSeleccionada])

  const cargarDatosEntregas = async () => {
    setCargando(true)
    const { desde, hasta } = getRango(periodoEntrega)
    const [pedidosRes, pagosRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?desde=${desde}&hasta=${hasta}`).then(r => r.json()),
      fetch(`/api/reportes/pagos?desde=${desde}&hasta=${hasta}`).then(r => r.json())
    ])
    const peds = pedidosRes.ok ? pedidosRes.pedidos || [] : []
    const pays = pagosRes.ok ? pagosRes.pagos || [] : []
    setRawPedidos(peds)
    setRawPagos(pays)

    // Solo pedidos de encargos (con cliente_id)
    const pedsEncargos = peds.filter(p => p.cliente_id)
    const paysEncargos = pays.filter(p => p.cliente_id && p.tipo !== 'Venta Liquidación' || (p.cliente_id && p.tipo === 'Venta Liquidación'))

    const ventaTotal = pedsEncargos.reduce((s, p) => s + (p.precio_venta || 0), 0)
    const costoTotal = pedsEncargos.reduce((s, p) => s + (p.costo_mxn || 0), 0)
    const utilidadTotal = pedsEncargos.reduce((s, p) => s + (p.utilidad || 0), 0)
    const margen = ventaTotal > 0 ? (utilidadTotal / ventaTotal) * 100 : 0

    const anticipos = pays.filter(p => p.tipo?.toLowerCase() === 'anticipo')
    const liquidaciones = pays.filter(p => p.tipo === 'Venta Liquidación' && p.cliente_id)

    const totalAnticipos = anticipos.reduce((s, p) => s + (p.monto || 0), 0)
    const totalLiquidado = liquidaciones.reduce((s, p) => s + (p.monto || 0), 0)
    const cobradoTotal = totalAnticipos + totalLiquidado

    const anticiposEfectivo = anticipos.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
    const anticiposTransferencia = anticipos.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
    const anticiposTerminal = anticipos.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)
    const liquidEfectivo = liquidaciones.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
    const liquidTransferencia = liquidaciones.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
    const liquidTerminal = liquidaciones.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)

    const clientesUnicos = [...new Set(pedsEncargos.map(p => p.cliente_id))].length
    const ticketPromedio = clientesUnicos > 0 ? ventaTotal / clientesUnicos : 0

    const clientesPagaron = [...new Set(liquidaciones.map(p => p.cliente_id))].length
    const tasaCobranza = clientesUnicos > 0 ? (clientesPagaron / clientesUnicos) * 100 : 0

    const metodosTotal = [
      { nombre: 'Efectivo', monto: anticiposEfectivo + liquidEfectivo },
      { nombre: 'Transferencia', monto: anticiposTransferencia + liquidTransferencia },
      { nombre: 'Terminal', monto: anticiposTerminal + liquidTerminal }
    ]
    const topMetodo = metodosTotal.sort((a, b) => b.monto - a.monto)[0]?.nombre || 'N/A'

    // Clientes con deuda
    const porCliente = pedsEncargos.reduce((acc, p) => {
      if (!acc[p.cliente_id]) acc[p.cliente_id] = { nombre: p.clientes?.nombre || 'Sin nombre', venta: 0, costo: 0, utilidad: 0, cobrado: 0 }
      acc[p.cliente_id].venta += p.precio_venta || 0
      acc[p.cliente_id].costo += p.costo_mxn || 0
      acc[p.cliente_id].utilidad += p.utilidad || 0
      return acc
    }, {})
    liquidaciones.forEach(p => { if (porCliente[p.cliente_id]) porCliente[p.cliente_id].cobrado += p.monto || 0 })
    anticipos.forEach(p => { if (porCliente[p.cliente_id]) porCliente[p.cliente_id].cobrado += p.monto || 0 })

    const clientesConDeuda = Object.values(porCliente).filter(c => c.venta - c.cobrado > 0).length

    setMetricasE({
      ventaTotal, costoTotal, utilidadTotal, margen, cobradoTotal,
      pendiente: ventaTotal - cobradoTotal,
      totalAnticipos, totalLiquidado,
      anticiposEfectivo, anticiposTransferencia, anticiposTerminal,
      liquidEfectivo, liquidTransferencia, liquidTerminal,
      totalPedidos: pedsEncargos.length, clientesUnicos,
      ticketPromedio, tasaCobranza, topMetodo, clientesConDeuda,
      metodosTotal: metodosTotal.sort((a, b) => b.monto - a.monto)
    })
    setPorClienteE(Object.values(porCliente).sort((a, b) => (b.venta - b.cobrado) - (a.venta - a.cobrado)))
    setCargando(false)
  }

  const cargarEstadoCuenta = async () => {
    setCargando(true)
    const [pedidosRes, pagosRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?entrega_id=${entregaSeleccionada}`).then(r => r.json()),
      fetch(`/api/reportes/pagos?entrega_id=${entregaSeleccionada}`).then(r => r.json())
    ])
    const peds = pedidosRes.ok ? pedidosRes.pedidos || [] : []
    const pays = pagosRes.ok ? pagosRes.pagos || [] : []
    setRawPedidos(peds)
    setRawPagos(pays)

    const ventaTotal = peds.reduce((s, p) => s + (p.precio_venta || 0), 0)
    const costoTotal = peds.reduce((s, p) => s + (p.costo_mxn || 0), 0)
    const utilidadTotal = peds.reduce((s, p) => s + (p.utilidad || 0), 0)
    const margen = ventaTotal > 0 ? (utilidadTotal / ventaTotal) * 100 : 0
    const anticipos = pays.filter(p => p.tipo?.toLowerCase() === 'anticipo')
    const liquidaciones = pays.filter(p => p.tipo === 'Venta Liquidación')
    const totalAnticipos = anticipos.reduce((s, p) => s + (p.monto || 0), 0)
    const totalLiquidado = liquidaciones.reduce((s, p) => s + (p.monto || 0), 0)
    const cobradoTotal = totalAnticipos + totalLiquidado

    const porCliente = peds.reduce((acc, p) => {
      if (!acc[p.cliente_id]) acc[p.cliente_id] = { nombre: p.clientes?.nombre || 'Sin nombre', venta: 0, costo: 0, utilidad: 0, cobrado: 0 }
      acc[p.cliente_id].venta += p.precio_venta || 0
      acc[p.cliente_id].costo += p.costo_mxn || 0
      acc[p.cliente_id].utilidad += p.utilidad || 0
      return acc
    }, {})
    liquidaciones.forEach(p => { if (porCliente[p.cliente_id]) porCliente[p.cliente_id].cobrado += p.monto || 0 })
    anticipos.forEach(p => { if (porCliente[p.cliente_id]) porCliente[p.cliente_id].cobrado += p.monto || 0 })

    setMetricasEC({ ventaTotal, costoTotal, utilidadTotal, margen, cobradoTotal, pendiente: ventaTotal - cobradoTotal, totalAnticipos, totalPedidos: peds.length, clientesUnicos: [...new Set(peds.map(p => p.cliente_id))].length })
    setPorClienteEC(Object.values(porCliente).sort((a, b) => (b.venta - b.cobrado) - (a.venta - a.cobrado)))
    setCargando(false)
  }

  const cargarDatosTienda = async () => {
    setCargando(true)
    const { desde, hasta } = getRango(periodoTienda)
    const pagosRes = await fetch(`/api/reportes/pagos?desde=${desde}&hasta=${hasta}`).then(r => r.json())
    const pays = pagosRes.ok ? pagosRes.pagos || [] : []

    const ventasTienda = pays.filter(p => !p.cliente_id && p.tipo === 'Venta Liquidación')
    const totalVentas = ventasTienda.reduce((s, p) => s + (p.monto || 0), 0)
    const numTransacciones = ventasTienda.length
    const ticketPromedio = numTransacciones > 0 ? totalVentas / numTransacciones : 0

    const efectivo = ventasTienda.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
    const transferencia = ventasTienda.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
    const terminal = ventasTienda.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)

    const metodosTotal = [
      { nombre: 'Efectivo', monto: efectivo },
      { nombre: 'Transferencia', monto: transferencia },
      { nombre: 'Terminal', monto: terminal }
    ]
    const topMetodo = metodosTotal.sort((a, b) => b.monto - a.monto)[0]?.nombre || 'N/A'

    setMetricasT({ totalVentas, numTransacciones, ticketPromedio, efectivo, transferencia, terminal, topMetodo })
    setCargando(false)
  }

  const exportarExcel = () => {
    const ahora = new Date()
    const fechaStr = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}`
    const wb = XLSX.utils.book_new()

    // ── Hoja 1: Pedidos ───────────────────────────────────────────
    const filPedidos = rawPedidos.filter(p => p.cliente_id)
    const hojaPedidos = [
      ['Cliente','Descripción','Cantidad','Precio USD','Tipo de cambio','Impuesto %','Costo MXN','Precio venta','Utilidad','Estado','Entrega','Fecha captura'],
      ...filPedidos.map(p => [
        p.clientes?.nombre || '',
        p.descripcion || '',
        p.cantidad || 1,
        p.precio_usd || '',
        p.tc || '',
        p.impuesto != null ? `${p.impuesto}%` : '',
        p.costo_mxn || 0,
        p.precio_venta || 0,
        p.utilidad || 0,
        p.estado || '',
        p.entregas?.fecha_entrega || '',
        p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
      ])
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaPedidos), 'Pedidos')

    // ── Hoja 2: Pagos ─────────────────────────────────────────────
    const hojaPagos = [
      ['Cliente','Fecha','Monto','Método','Tipo','Entrega'],
      ...rawPagos.map(p => [
        p.clientes?.nombre || '(Tienda)',
        p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
        p.monto || 0,
        p.metodo || '',
        p.tipo || '',
        p.entrega_id || '',
      ])
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaPagos), 'Pagos')

    // ── Hoja 3: Resumen ───────────────────────────────────────────
    const m = metricasE || metricasEC
    const hojaResumen = m ? [
      ['Concepto','Valor'],
      ['Venta total', m.ventaTotal || 0],
      ['Costo total', m.costoTotal || 0],
      ['Utilidad total', m.utilidadTotal || 0],
      ['Margen %', m.margen ? `${m.margen.toFixed(1)}%` : ''],
      ['Total cobrado', m.cobradoTotal || 0],
      ['Anticipos', m.totalAnticipos || 0],
      ['Por cobrar', m.pendiente || 0],
      ['Efectivo', (m.anticiposEfectivo || 0) + (m.liquidEfectivo || 0)],
      ['Transferencia', (m.anticiposTransferencia || 0) + (m.liquidTransferencia || 0)],
      ['Terminal', (m.anticiposTerminal || 0) + (m.liquidTerminal || 0)],
    ] : [['Sin datos cargados']]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojaResumen), 'Resumen')

    XLSX.writeFile(wb, `Denog_Reporte_${fechaStr}.xlsx`)
  }

  const hayDatos = (metricasE || metricasEC) && rawPedidos.length > 0

  const TabBtn = ({ id, label, active, onClick }) => (
    <button onClick={onClick}
      style={{ background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '9px 22px', color: active ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
      {label}
    </button>
  )

  const PeriodBtn = ({ label, active, onClick }) => (
    <button onClick={onClick}
      style={{ background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '4px 12px', color: active ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
      {label}
    </button>
  )

  const MetricCard = ({ label, value, sub, color }) => (
    <div style={{ background: color ? `rgba(${color},0.08)` : 'rgba(255,255,255,0.03)', border: `1px solid ${color ? `rgba(${color},0.15)` : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: 14 }}>
      <div style={{ color: color ? `rgba(${color},0.7)` : 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ? `rgb(${color})` : 'white', fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: color ? `rgba(${color},0.5)` : 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const AlertItem = ({ texto, tipo }) => {
    const colores = { rojo: '#f87171', amarillo: '#f59e0b', verde: '#10b981' }
    const bgs = { rojo: 'rgba(239,68,68,0.08)', amarillo: 'rgba(245,158,11,0.08)', verde: 'rgba(16,185,129,0.08)' }
    const borders = { rojo: 'rgba(239,68,68,0.2)', amarillo: 'rgba(245,158,11,0.2)', verde: 'rgba(16,185,129,0.2)' }
    return (
      <div style={{ background: bgs[tipo], border: `1px solid ${borders[tipo]}`, borderRadius: 10, padding: '10px 14px', marginBottom: 6, fontSize: 12, color: colores[tipo] }}>
        {tipo === 'rojo' ? '🔴' : tipo === 'amarillo' ? '⚠️' : '✅'} {texto}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>📊 Reportes financieros</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>Por modelo de negocio</div>
          </div>
          {hayDatos && (
            <button onClick={exportarExcel}
              style={{ padding: '9px 18px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⬇️ Exportar Excel
            </button>
          )}
        </div>

        {/* Tabs principales */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <TabBtn label="📦 Entregas" active={seccion === 'entregas'} onClick={() => setSeccion('entregas')} />
          <TabBtn label="⚡ Tienda" active={seccion === 'tienda'} onClick={() => setSeccion('tienda')} />
        </div>

        {/* ===================== SECCIÓN ENTREGAS ===================== */}
        {seccion === 'entregas' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <PeriodBtn label="Hoy" active={periodoEntrega === 'hoy'} onClick={() => setPeriodoEntrega('hoy')} />
              <PeriodBtn label="Semana" active={periodoEntrega === 'semana'} onClick={() => setPeriodoEntrega('semana')} />
              <PeriodBtn label="Mes" active={periodoEntrega === 'mes'} onClick={() => setPeriodoEntrega('mes')} />
              <PeriodBtn label="📋 Estado de cuenta" active={periodoEntrega === 'estado'} onClick={() => setPeriodoEntrega('estado')} />
            </div>

            {cargando && <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {/* Filtro de categoría */}
            {!cargando && (metricasE || metricasEC) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Categoría:</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setFiltroCatReporte('')}
                    style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!filtroCatReporte ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`, background: !filtroCatReporte ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', color: !filtroCatReporte ? '#818cf8' : 'rgba(255,255,255,0.4)' }}>
                    Todas
                  </button>
                  {categoriasReporte.map(cat => (
                    <button key={cat.id} onClick={() => setFiltroCatReporte(cat.nombre)}
                      style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filtroCatReporte === cat.nombre ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`, background: filtroCatReporte === cat.nombre ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', color: filtroCatReporte === cat.nombre ? '#818cf8' : 'rgba(255,255,255,0.4)' }}>
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vista período */}
            {periodoEntrega !== 'estado' && !cargando && metricasE && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                  <MetricCard label="Venta total" value={fmt(metricasE.ventaTotal)} sub={`${metricasE.totalPedidos} pedidos · ${metricasE.clientesUnicos} clientes`} />
                  <MetricCard label="Utilidad" value={fmt(metricasE.utilidadTotal)} sub={`Margen ${metricasE.margen.toFixed(1)}%`} color="16,185,129" />
                  <MetricCard label="Total cobrado" value={fmt(metricasE.cobradoTotal)} sub={`Anticipos: ${fmt(metricasE.totalAnticipos)}`} />
                  <MetricCard label="Por cobrar" value={fmt(metricasE.pendiente)} sub={`${metricasE.clientesConDeuda} clientes pendientes`} color="239,68,68" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                  <MetricCard label="Tasa de cobranza" value={`${metricasE.tasaCobranza.toFixed(0)}%`} sub="Pagan el mismo día" />
                  <MetricCard label="Ticket promedio" value={fmt(metricasE.ticketPromedio)} sub="Por cliente" />
                  <MetricCard label="Método más usado" value={metricasE.topMetodo} sub="En cobros de este período" />
                </div>

                {/* Desglose cobranza separado */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Desglose de cobranza</div>

                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 8, fontWeight: 600 }}>Anticipos recibidos</div>
                  {[
                    { label: '💵 Efectivo', valor: metricasE.anticiposEfectivo },
                    { label: '📱 Transferencia', valor: metricasE.anticiposTransferencia },
                    { label: '💳 Terminal', valor: metricasE.anticiposTerminal },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{r.label}</span><span style={{ color: 'white', fontWeight: 600 }}>{fmt(r.valor)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 12px', fontSize: 13, color: '#a78bfa', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span>Total anticipos</span><span>{fmt(metricasE.totalAnticipos)}</span>
                  </div>

                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '12px 0 8px', fontWeight: 600 }}>Cobro en tienda (liquidación)</div>
                  {[
                    { label: '💵 Efectivo', valor: metricasE.liquidEfectivo },
                    { label: '📱 Transferencia', valor: metricasE.liquidTransferencia },
                    { label: '💳 Terminal', valor: metricasE.liquidTerminal },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{r.label}</span><span style={{ color: 'white', fontWeight: 600 }}>{fmt(r.valor)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 14, color: '#10b981', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4 }}>
                    <span>Total cobrado</span><span>{fmt(metricasE.cobradoTotal)}</span>
                  </div>
                </div>

                {/* Por cliente */}
                {porClienteE.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 13, fontWeight: 600 }}>Por cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', background: 'rgba(255,255,255,0.02)' }}>
                      {['Cliente','Venta','Utilidad','Estado'].map((h, i) => (
                        <span key={i} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                      ))}
                    </div>
                    {porClienteE.map((c, i) => {
                      const pendiente = c.venta - c.cobrado
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                          <span style={{ color: 'white', fontSize: 13 }}>{c.nombre}</span>
                          <span style={{ color: 'white', fontSize: 13, textAlign: 'right' }}>{fmt(c.venta)}</span>
                          <span style={{ color: '#10b981', fontSize: 13, textAlign: 'right' }}>{fmt(c.utilidad)}</span>
                          <div style={{ textAlign: 'right' }}>
                            {pendiente <= 0
                              ? <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px', color: '#4ade80', fontSize: 10 }}>✓ Liquidado</span>
                              : <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '2px 8px', color: '#f87171', fontSize: 10 }}>{fmt(pendiente)}</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Métricas filtradas por categoría */}
                {filtroCatReporte && (() => {
                  const pedsCat = rawPedidos.filter(p => p.cliente_id && p.categoria === filtroCatReporte)
                  const vCat = pedsCat.reduce((s, p) => s + (p.precio_venta || 0), 0)
                  const cCat = pedsCat.reduce((s, p) => s + (p.costo_mxn || 0), 0)
                  const uCat = pedsCat.reduce((s, p) => s + (p.utilidad || 0), 0)
                  const mCat = vCat > 0 ? (uCat / vCat) * 100 : 0
                  return (
                    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                      <div style={{ color: '#818cf8', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>📊 Categoría: {filtroCatReporte}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                        <MetricCard label="Venta" value={fmt(vCat)} sub={`${pedsCat.length} pedidos`} />
                        <MetricCard label="Costo" value={fmt(cCat)} />
                        <MetricCard label="Utilidad" value={fmt(uCat)} sub={`Margen ${mCat.toFixed(1)}%`} color="16,185,129" />
                        <MetricCard label="Pedidos" value={pedsCat.length} sub="En categoría" />
                      </div>
                    </div>
                  )
                })()}

                {/* Desglose por categoría */}
                {rawPedidos.filter(p => p.cliente_id && p.categoria).length > 0 && (() => {
                  const porCat = rawPedidos.filter(p => p.cliente_id).reduce((acc, p) => {
                    const cat = p.categoria || 'Sin categoría'
                    if (!acc[cat]) acc[cat] = { venta: 0, costo: 0, utilidad: 0, count: 0 }
                    acc[cat].venta += p.precio_venta || 0
                    acc[cat].costo += p.costo_mxn || 0
                    acc[cat].utilidad += p.utilidad || 0
                    acc[cat].count++
                    return acc
                  }, {})
                  const rows = Object.entries(porCat).sort((a, b) => b[1].venta - a[1].venta)
                  return (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 13, fontWeight: 600 }}>Por categoría</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', background: 'rgba(255,255,255,0.02)' }}>
                        {['Categoría', 'Venta', 'Utilidad', 'Pedidos'].map((h, i) => (
                          <span key={i} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                        ))}
                      </div>
                      {rows.map(([cat, d], i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '9px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                          <span style={{ color: 'white', fontSize: 13 }}>{cat}</span>
                          <span style={{ color: 'white', fontSize: 13, textAlign: 'right' }}>{fmt(d.venta)}</span>
                          <span style={{ color: '#10b981', fontSize: 13, textAlign: 'right' }}>{fmt(d.utilidad)}</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'right' }}>{d.count}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Alertas */}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Alertas</div>
                  {porClienteE.filter(c => c.venta - c.cobrado > 0).map((c, i) => (
                    <AlertItem key={i} tipo={c.venta - c.cobrado > 3000 ? 'rojo' : 'amarillo'} texto={`${c.nombre} — ${fmt(c.venta - c.cobrado)} pendiente`} />
                  ))}
                  {metricasE.cobradoTotal >= metricasE.ventaTotal && metricasE.ventaTotal > 0 && (
                    <AlertItem tipo="verde" texto="Todo liquidado en este período" />
                  )}
                  {porClienteE.filter(c => c.venta - c.cobrado > 0).length === 0 && metricasE.ventaTotal === 0 && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 10 }}>Sin datos en este período</div>
                  )}
                </div>
              </div>
            )}

            {/* Vista estado de cuenta */}
            {periodoEntrega === 'estado' && (
              <div>
                <select value={entregaSeleccionada} onChange={e => setEntregaSeleccionada(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 13, outline: 'none', marginBottom: 16 }}>
                  <option value="">— Selecciona estado de cuenta —</option>
                  {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}{e.nota ? ` · ${e.nota}` : ''}</option>)}
                </select>

                {!cargando && metricasEC && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                      <MetricCard label="Venta total" value={fmt(metricasEC.ventaTotal)} sub={`${metricasEC.totalPedidos} pedidos · ${metricasEC.clientesUnicos} clientes`} />
                      <MetricCard label="Utilidad" value={fmt(metricasEC.utilidadTotal)} sub={`Margen ${metricasEC.margen.toFixed(1)}%`} color="16,185,129" />
                      <MetricCard label="Total cobrado" value={fmt(metricasEC.cobradoTotal)} sub={`Anticipos: ${fmt(metricasEC.totalAnticipos)}`} />
                      <MetricCard label="Por cobrar" value={fmt(metricasEC.pendiente)} color="239,68,68" />
                    </div>

                    {/* Métricas filtradas por categoría (estado de cuenta) */}
                    {filtroCatReporte && (() => {
                      const pedsCat = rawPedidos.filter(p => p.categoria === filtroCatReporte)
                      const vCat = pedsCat.reduce((s, p) => s + (p.precio_venta || 0), 0)
                      const uCat = pedsCat.reduce((s, p) => s + (p.utilidad || 0), 0)
                      const mCat = vCat > 0 ? (uCat / vCat) * 100 : 0
                      return (
                        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                          <div style={{ color: '#818cf8', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>📊 Categoría: {filtroCatReporte} — {pedsCat.length} pedidos</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                            <MetricCard label="Venta" value={fmt(vCat)} />
                            <MetricCard label="Utilidad" value={fmt(uCat)} color="16,185,129" />
                            <MetricCard label="Margen" value={`${mCat.toFixed(1)}%`} />
                          </div>
                        </div>
                      )
                    })()}

                    {/* Desglose por categoría (estado de cuenta) */}
                    {rawPedidos.filter(p => p.categoria).length > 0 && (() => {
                      const porCat = rawPedidos.reduce((acc, p) => {
                        const cat = p.categoria || 'Sin categoría'
                        if (!acc[cat]) acc[cat] = { venta: 0, utilidad: 0, count: 0 }
                        acc[cat].venta += p.precio_venta || 0
                        acc[cat].utilidad += p.utilidad || 0
                        acc[cat].count++
                        return acc
                      }, {})
                      const rows = Object.entries(porCat).sort((a, b) => b[1].venta - a[1].venta)
                      return (
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 13, fontWeight: 600 }}>Por categoría</div>
                          {rows.map(([cat, d], i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '9px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ color: 'white', fontSize: 13 }}>{cat}</span>
                              <span style={{ color: 'white', fontSize: 13, textAlign: 'right' }}>{fmt(d.venta)}</span>
                              <span style={{ color: '#10b981', fontSize: 13, textAlign: 'right' }}>{fmt(d.utilidad)}</span>
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'right' }}>{d.count} ped.</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {porClienteEC.length > 0 && (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 13, fontWeight: 600 }}>Por cliente</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', background: 'rgba(255,255,255,0.02)' }}>
                          {['Cliente','Venta','Utilidad','Estado'].map((h, i) => (
                            <span key={i} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                          ))}
                        </div>
                        {porClienteEC.map((c, i) => {
                          const pendiente = c.venta - c.cobrado
                          return (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                              <span style={{ color: 'white', fontSize: 13 }}>{c.nombre}</span>
                              <span style={{ color: 'white', fontSize: 13, textAlign: 'right' }}>{fmt(c.venta)}</span>
                              <span style={{ color: '#10b981', fontSize: 13, textAlign: 'right' }}>{fmt(c.utilidad)}</span>
                              <div style={{ textAlign: 'right' }}>
                                {pendiente <= 0
                                  ? <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px', color: '#4ade80', fontSize: 10 }}>✓ Liquidado</span>
                                  : <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '2px 8px', color: '#f87171', fontSize: 10 }}>{fmt(pendiente)}</span>
                                }
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {!entregaSeleccionada && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                    Selecciona un estado de cuenta para ver sus números
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================== SECCIÓN TIENDA ===================== */}
        {seccion === 'tienda' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <PeriodBtn label="Hoy" active={periodoTienda === 'hoy'} onClick={() => setPeriodoTienda('hoy')} />
              <PeriodBtn label="Semana" active={periodoTienda === 'semana'} onClick={() => setPeriodoTienda('semana')} />
              <PeriodBtn label="Mes" active={periodoTienda === 'mes'} onClick={() => setPeriodoTienda('mes')} />
            </div>

            {cargando && <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {!cargando && metricasT && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                  <MetricCard label="Ventas tienda" value={fmt(metricasT.totalVentas)} sub={`${metricasT.numTransacciones} transacciones`} />
                  <MetricCard label="Ticket promedio" value={fmt(metricasT.ticketPromedio)} sub="Por venta" />
                  <MetricCard label="Método más usado" value={metricasT.topMetodo} sub="En ventas de tienda" />
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Desglose de cobranza — Tienda</div>
                  {[
                    { label: '💵 Efectivo', valor: metricasT.efectivo },
                    { label: '📱 Transferencia', valor: metricasT.transferencia },
                    { label: '💳 Terminal', valor: metricasT.terminal },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{r.label}</span><span style={{ color: 'white', fontWeight: 600 }}>{fmt(r.valor)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 14, color: '#10b981', fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8 }}>
                    <span>Total</span><span>{fmt(metricasT.totalVentas)}</span>
                  </div>
                </div>

                {metricasT.totalVentas === 0 && (
                  <AlertItem tipo="amarillo" texto="Sin ventas de tienda en este período" />
                )}
                {metricasT.totalVentas > 0 && (
                  <AlertItem tipo="verde" texto={`${metricasT.numTransacciones} ventas registradas en tienda este período`} />
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}