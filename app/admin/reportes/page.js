'use client'
import { useState, useEffect, useRef } from 'react'
import ExcelJS from 'exceljs'

export default function Reportes() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Hermosillo' })
  const [fechaReporte, setFechaReporte] = useState(hoy)

  const [seccion, setSeccion] = useState('entregas')
  const [entregas, setEntregas] = useState([])
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('')
  const [cargando, setCargando] = useState(false)

  // Datos entregas/tienda por fecha
  const [resumenClientesEntregas, setResumenClientesEntregas] = useState([])
  const [metricasDelDia, setMetricasDelDia] = useState({
    totalCobradoEntregas: 0,
    totalAnticipos: 0,
    totalTienda: 0,
    totalGeneral: 0,
    numClientesEntregas: 0,
    numTransaccionesTienda: 0
  })

  // Análisis de ventas de tienda (top productos / vendedores / categorías)
  const [analisisTienda, setAnalisisTienda] = useState({
    topProductos: [],
    porVendedor: [],
    porCategoria: [],
    totalVendido: 0,
    totalArticulos: 0,
    vendedorTop: '',
    restock: [],
    transacciones: [],
    utilidadConocida: 0,
    porConciliar: []
  })
  const [incluirPorConciliar, setIncluirPorConciliar] = useState(false)
  const [costoDraft, setCostoDraft] = useState({})
  const [guardandoCosto, setGuardandoCosto] = useState(null)

  // Datos estado de cuenta
  const [metricasEC, setMetricasEC] = useState(null)
  const [porClienteEC, setPorClienteEC] = useState([])

  // Raw data para exportar Excel
  const [rawPedidos, setRawPedidos] = useState([])
  const [rawPagos, setRawPagos] = useState([])

  // Categorías (usado en Estado de cuenta)
  const [categoriasReporte, setCategoriasReporte] = useState([])
  const [filtroCatReporte, setFiltroCatReporte] = useState('')

  const chartERef = useRef(null)
  const chartTRef = useRef(null)
  const chartEInstance = useRef(null)
  const chartTInstance = useRef(null)

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => { if (d.ok) setEntregas(d.entregas) })
    fetch('/api/categorias').then(r => r.json()).then(d => { if (d.ok) setCategoriasReporte(d.categorias) })
  }, [])

  useEffect(() => {
    cargarDatos()
    cargarAnalisisTienda()
  }, [fechaReporte])

  useEffect(() => {
    if (entregaSeleccionada && seccion === 'estado') cargarEstadoCuenta()
  }, [entregaSeleccionada])

  const cargarDatos = async () => {
    setCargando(true)

    // Traer TODOS los pagos del día (fuente principal de actividad de caja)
    const resPagos = await fetch(`/api/reportes/pagos?desde=${fechaReporte}&hasta=${fechaReporte}`)
    const datPagos = await resPagos.json()
    const pagosDelDia = datPagos.pagos || []

    // Separar pagos de entregas vs tienda
    const pagosEntregas = pagosDelDia.filter(p => p.cliente_id && p.tipo === 'Venta Liquidación')
    const pagosAnticipios = pagosDelDia.filter(p => p.cliente_id && p.tipo === 'Anticipo')
    const pagosTienda = pagosDelDia.filter(p => !p.cliente_id && p.tipo === 'Venta Liquidación')

    // Para entregas: agrupar por cliente
    const porCliente = {}
    pagosEntregas.forEach(p => {
      const nombre = p.clientes?.nombre || 'Sin nombre'
      if (!porCliente[p.cliente_id]) {
        porCliente[p.cliente_id] = {
          nombre,
          pagos: [],
          totalPagado: 0
        }
      }
      porCliente[p.cliente_id].pagos.push(p)
      porCliente[p.cliente_id].totalPagado += Number(p.monto) || 0
    })

    // Traer pedidos entregados de los clientes que pagaron hoy
    const clientesIds = Object.keys(porCliente)
    let pedidosPorCliente = {}
    if (clientesIds.length > 0) {
      const resPeds = await fetch(`/api/reportes/pedidos?cliente_id_in=${clientesIds.join(',')}`)
      const datPeds = await resPeds.json()
      ;(datPeds.pedidos || [])
        .filter(p => p.estado === 'Entregado')
        .forEach(p => {
          if (!pedidosPorCliente[p.cliente_id]) pedidosPorCliente[p.cliente_id] = []
          pedidosPorCliente[p.cliente_id].push(p)
        })
    }

    // Combinar en resumen por cliente
    const resumenClientes = Object.entries(porCliente).map(([id, d]) => ({
      cliente_id: id,
      nombre: d.nombre,
      totalPagado: d.totalPagado,
      metodos: [...new Set(d.pagos.map(p => p.metodo))].join(' + '),
      pedidos: pedidosPorCliente[id] || [],
      numArticulos: (pedidosPorCliente[id] || []).length
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    setResumenClientesEntregas(resumenClientes)

    // Totales entregas
    const totalCobradoEntregas = pagosEntregas.reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const totalAnticipos = pagosAnticipios.reduce((s, p) => s + (Number(p.monto) || 0), 0)

    // Totales tienda
    const totalTienda = pagosTienda.reduce((s, p) => s + (Number(p.monto) || 0), 0)

    setMetricasDelDia({
      totalCobradoEntregas,
      totalAnticipos,
      totalTienda,
      totalGeneral: totalCobradoEntregas + totalAnticipos + totalTienda,
      numClientesEntregas: resumenClientes.length,
      numTransaccionesTienda: pagosTienda.length
    })

    setRawPagos(pagosDelDia)
    setCargando(false)
  }

  const cargarAnalisisTienda = async () => {
    const res = await fetch(`/api/reportes/ventas-tienda?desde=${fechaReporte}&hasta=${fechaReporte}`)
    const data = await res.json()
    const ventas = data.ok ? data.ventas || [] : []

    // Agrupar por producto
    const porProducto = {}
    ventas.forEach(v => {
      const key = v.nombre_producto
      if (!porProducto[key]) porProducto[key] = { nombre: key, categoria: v.categoria, cantidad: 0, revenue: 0, stock: v.productos_tienda?.stock ?? null }
      porProducto[key].cantidad += v.cantidad
      porProducto[key].revenue += v.cantidad * v.precio_unitario
    })

    // Agrupar por vendedor
    const porVendedor = {}
    ventas.forEach(v => {
      const nombre = v.clientes?.nombre || 'Sin nombre'
      if (!porVendedor[nombre]) porVendedor[nombre] = { nombre, articulos: 0, total: 0 }
      porVendedor[nombre].articulos += v.cantidad
      porVendedor[nombre].total += v.cantidad * v.precio_unitario
    })

    // Agrupar por categoría
    const porCategoria = {}
    ventas.forEach(v => {
      const cat = v.categoria || 'Sin categoría'
      if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, cantidad: 0, revenue: 0 }
      porCategoria[cat].cantidad += v.cantidad
      porCategoria[cat].revenue += v.cantidad * v.precio_unitario
    })

    // Agrupar por transacción (mismo pago_id)
    const porTransaccion = {}
    ventas.forEach(v => {
      const pagoId = v.pago_id || v.id
      if (!porTransaccion[pagoId]) {
        porTransaccion[pagoId] = {
          pago_id: pagoId,
          vendedor: v.clientes?.nombre || 'Sin nombre',
          metodo: v.pagos?.metodo && v.pagos_2?.metodo ? `${v.pagos.metodo} + ${v.pagos_2.metodo}` : (v.pagos?.metodo || '—'),
          hora: new Date(v.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Hermosillo' }),
          articulos: [],
          total: 0
        }
      }
      porTransaccion[pagoId].articulos.push({
        nombre: v.nombre_producto,
        cantidad: v.cantidad,
        precio: v.precio_unitario
      })
      porTransaccion[pagoId].total += v.cantidad * v.precio_unitario
    })

    const topProductos = Object.values(porProducto).sort((a, b) => b.cantidad - a.cantidad)
    const porVendedorOrdenado = Object.values(porVendedor).sort((a, b) => b.total - a.total)

    // Utilidad exacta = solo líneas con costo_unitario conocido (ver README del
    // rediseño de Tienda). Las líneas manuales sin costo quedan "por conciliar"
    // hasta que el admin capture el costo real aquí mismo.
    const conCosto = ventas.filter(v => v.costo_unitario != null)
    const utilidadConocida = conCosto.reduce((s, v) => s + (v.precio_unitario - v.costo_unitario) * v.cantidad, 0)
    const porConciliar = ventas.filter(v => v.costo_unitario == null)

    setAnalisisTienda({
      topProductos,
      porVendedor: porVendedorOrdenado,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.revenue - a.revenue),
      totalVendido: ventas.reduce((s, v) => s + v.cantidad * v.precio_unitario, 0),
      totalArticulos: ventas.reduce((s, v) => s + v.cantidad, 0),
      vendedorTop: porVendedorOrdenado[0]?.nombre || '—',
      restock: topProductos.filter(p => p.stock != null && p.stock < 3),
      transacciones: Object.values(porTransaccion).sort((a, b) => b.hora.localeCompare(a.hora)),
      utilidadConocida,
      porConciliar
    })
  }

  const guardarCostoConciliacion = async (ventaId) => {
    const valor = parseFloat(costoDraft[ventaId])
    if (isNaN(valor) || valor < 0) return
    setGuardandoCosto(ventaId)
    try {
      const admin = JSON.parse(localStorage.getItem('cliente') || 'null')
      await fetch('/api/reportes/ventas-tienda', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ventaId, costo_unitario: valor, conciliado_por: admin?.id || null })
      })
      await cargarAnalisisTienda()
      setCostoDraft(prev => { const next = { ...prev }; delete next[ventaId]; return next })
    } finally {
      setGuardandoCosto(null)
    }
  }

  const cargarEstadoCuenta = async () => {
    setCargando(true)
    const [pedidosRes, pagosRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?entrega_id=${entregaSeleccionada}`).then(r => r.json()),
      fetch(`/api/reportes/pagos?entrega_id=${entregaSeleccionada}`).then(r => r.json())
    ])
    const peds = (pedidosRes.ok ? pedidosRes.pedidos || [] : []).filter(p => p.estado !== 'no_llego')
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

  const exportarExcel = async () => {
    const ahora = new Date()
    const fechaStr = `${ahora.getFullYear()}${String(ahora.getMonth()+1).padStart(2,'0')}${String(ahora.getDate()).padStart(2,'0')}`
    const wb = new ExcelJS.Workbook()

    const agregarHoja = (nombre, filas) => {
      const ws = wb.addWorksheet(nombre)
      filas.forEach(f => ws.addRow(f))
    }

    if (seccion === 'estado') {
      const filPedidos = rawPedidos.filter(p => p.cliente_id)
      agregarHoja('Pedidos', [
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
      ])

      agregarHoja('Pagos', [
        ['Cliente','Fecha','Monto','Método','Tipo','Entrega'],
        ...rawPagos.map(p => [
          p.clientes?.nombre || '(Tienda)',
          p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
          p.monto || 0,
          p.metodo || '',
          p.tipo || '',
          p.entrega_id || '',
        ])
      ])

      const m = metricasEC
      agregarHoja('Resumen', m ? [
        ['Concepto','Valor'],
        ['Venta total', m.ventaTotal || 0],
        ['Costo total', m.costoTotal || 0],
        ['Utilidad total', m.utilidadTotal || 0],
        ['Margen %', m.margen ? `${m.margen.toFixed(1)}%` : ''],
        ['Total cobrado', m.cobradoTotal || 0],
        ['Anticipos', m.totalAnticipos || 0],
        ['Por cobrar', m.pendiente || 0],
      ] : [['Sin datos cargados']])
    } else {
      agregarHoja('Pagos', [
        ['Cliente','Fecha','Monto','Método','Tipo','Entrega'],
        ...rawPagos.map(p => [
          p.clientes?.nombre || '(Tienda)',
          p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
          p.monto || 0,
          p.metodo || '',
          p.tipo || '',
          p.entrega_id || '',
        ])
      ])

      agregarHoja('Resumen clientes', [
        ['Cliente','Artículos','Método(s)','Total pagado'],
        ...resumenClientesEntregas.map(c => [c.nombre, c.numArticulos, c.metodos, c.totalPagado])
      ])

      agregarHoja('Totales', [
        ['Concepto','Valor'],
        ['Total cobrado entregas', metricasDelDia.totalCobradoEntregas],
        ['Anticipos recibidos', metricasDelDia.totalAnticipos],
        ['Ventas tienda', metricasDelDia.totalTienda],
        ['Total del día', metricasDelDia.totalGeneral],
      ])
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Denog_Reporte_${fechaStr}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hayDatos = seccion === 'estado'
    ? Boolean(metricasEC) && rawPedidos.length > 0
    : rawPagos.length > 0

  const TabBtn = ({ id, label, active, onClick }) => (
    <button onClick={onClick}
      style={{ background: active ? 'rgba(193,85,58,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(193,85,58,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '9px 22px', color: active ? '#dd8a6c' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
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

  // Utilidad "por conciliar" tratada como si costara $0 (aproximación optimista)
  // solo cuando el admin decide incluirla explícitamente en el total.
  const utilidadPorConciliarComoIngreso = analisisTienda.porConciliar.reduce((s, v) => s + v.precio_unitario * v.cantidad, 0)
  const utilidadMostrada = analisisTienda.utilidadConocida + (incluirPorConciliar ? utilidadPorConciliarComoIngreso : 0)

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
          <TabBtn label="📋 Estado de cuenta" active={seccion === 'estado'} onClick={() => setSeccion('estado')} />
        </div>

        {/* Selector de fecha (Entregas / Tienda) */}
        {(seccion === 'entregas' || seccion === 'tienda') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>📅 Fecha:</label>
            <input
              type="date"
              value={fechaReporte}
              onChange={e => setFechaReporte(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'white',
                padding: '6px 12px',
                fontSize: 14,
                cursor: 'pointer'
              }}
            />
            <button
              onClick={() => setFechaReporte(hoy)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.6)',
                padding: '6px 12px',
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Hoy
            </button>
          </div>
        )}

        {/* ===================== SECCIÓN ENTREGAS ===================== */}
        {seccion === 'entregas' && (
          <div>
            {cargando && <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {!cargando && (
              <div>
                {/* Tarjetas de resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Total cobrado entregas</div>
                    <div style={{ color: 'white', fontSize: 24, fontWeight: 700 }}>${metricasDelDia.totalCobradoEntregas.toLocaleString('es-MX')}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{metricasDelDia.numClientesEntregas} clientes</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Anticipos recibidos</div>
                    <div style={{ color: '#dd8a6c', fontSize: 24, fontWeight: 700 }}>${metricasDelDia.totalAnticipos.toLocaleString('es-MX')}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Ventas tienda</div>
                    <div style={{ color: '#34d399', fontSize: 24, fontWeight: 700 }}>${metricasDelDia.totalTienda.toLocaleString('es-MX')}</div>
                  </div>
                  <div style={{ background: 'rgba(193,85,58,0.2)', borderRadius: 12, padding: 20, border: '1px solid rgba(193,85,58,0.4)' }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Total del día</div>
                    <div style={{ color: '#dd8a6c', fontSize: 24, fontWeight: 700 }}>${metricasDelDia.totalGeneral.toLocaleString('es-MX')}</div>
                  </div>
                </div>

                {/* Tabla resumen por cliente */}
                {resumenClientesEntregas.length > 0 ? (
                  <div>
                    <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                      📦 Entregas del día ({resumenClientesEntregas.length} clientes)
                    </h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Cliente</th>
                          <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}>Artículos</th>
                          <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Método</th>
                          <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Total pagado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumenClientesEntregas.map((c, i) => (
                          <tr key={c.cliente_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ color: 'white', padding: '10px 8px', fontWeight: 600 }}>{c.nombre}</td>
                            <td style={{ color: 'rgba(255,255,255,0.6)', padding: '10px 8px', textAlign: 'center' }}>{c.numArticulos}</td>
                            <td style={{ color: 'rgba(255,255,255,0.6)', padding: '10px 8px' }}>{c.metodos}</td>
                            <td style={{ color: '#dd8a6c', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>${c.totalPagado.toLocaleString('es-MX')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                          <td style={{ color: 'rgba(255,255,255,0.5)', padding: '10px 8px', fontWeight: 700 }}>Total</td>
                          <td style={{ color: 'rgba(255,255,255,0.5)', padding: '10px 8px', textAlign: 'center' }}>
                            {resumenClientesEntregas.reduce((s, c) => s + c.numArticulos, 0)}
                          </td>
                          <td></td>
                          <td style={{ color: '#dd8a6c', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                            ${metricasDelDia.totalCobradoEntregas.toLocaleString('es-MX')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>
                    Sin entregas registradas para esta fecha
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================== SECCIÓN TIENDA ===================== */}
        {seccion === 'tienda' && (
          <div>
            {cargando && <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {!cargando && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Ventas tienda</div>
                  <div style={{ color: '#34d399', fontSize: 24, fontWeight: 700 }}>${metricasDelDia.totalTienda.toLocaleString('es-MX')}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{metricasDelDia.numTransaccionesTienda} transacciones</div>
                </div>
              </div>
            )}

            {/* ── Análisis de ventas de tienda (ventas_tienda) ───────────── */}
            <div>
              {/* Tarjetas resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Total vendido</div>
                  <div style={{ color: '#34d399', fontSize: 24, fontWeight: 700 }}>${analisisTienda.totalVendido.toLocaleString('es-MX')}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Artículos vendidos</div>
                  <div style={{ color: 'white', fontSize: 24, fontWeight: 700 }}>{analisisTienda.totalArticulos}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Vendedor más activo</div>
                  <div style={{ color: '#dd8a6c', fontSize: 24, fontWeight: 700 }}>{analisisTienda.vendedorTop || '—'}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Utilidad
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', marginLeft: 'auto' }}>
                      <input type="checkbox" checked={incluirPorConciliar} onChange={(e) => setIncluirPorConciliar(e.target.checked)} />
                      incluir por conciliar
                    </label>
                  </div>
                  <div style={{ color: '#facc15', fontSize: 24, fontWeight: 700 }}>${utilidadMostrada.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</div>
                  {analisisTienda.porConciliar.length > 0 && (
                    <div style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>⚠ {analisisTienda.porConciliar.length} línea(s) por conciliar {incluirPorConciliar ? '(no incluidas arriba)' : '(excluidas)'}</div>
                  )}
                </div>
              </div>

              {/* Ventas manuales por conciliar: sin costo_unitario al momento de cobrar */}
              {analisisTienda.porConciliar.length > 0 && (
                <div style={{ marginBottom: 24, background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 12, padding: 16 }}>
                  <h3 style={{ color: '#facc15', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>⚠ Ventas manuales por conciliar ({analisisTienda.porConciliar.length})</h3>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 12 }}>
                    Ventas rápidas por monto o producto sin catálogo — no tenían costo conocido al cobrar. Captura el costo real para que la utilidad quede exacta.
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Artículo</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}>Cant.</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Precio venta</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Costo unitario</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porConciliar.map((v) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px', color: 'white' }}>{v.nombre_producto}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>{v.cantidad}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>${Number(v.precio_unitario).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={costoDraft[v.id] ?? ''}
                              onChange={(e) => setCostoDraft(prev => ({ ...prev, [v.id]: e.target.value }))}
                              style={{ width: 90, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '6px 8px', color: 'white', fontSize: 12, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              disabled={!costoDraft[v.id] || guardandoCosto === v.id}
                              onClick={() => guardarCostoConciliacion(v.id)}
                              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: costoDraft[v.id] ? 'pointer' : 'not-allowed', opacity: costoDraft[v.id] ? 1 : 0.5 }}
                            >
                              {guardandoCosto === v.id ? 'Guardando…' : 'Guardar'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Top productos */}
              {analisisTienda.topProductos.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🏆 Top productos</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Producto</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Categoría</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}>Cantidad</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.topProductos.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ color: 'white', padding: '8px', fontWeight: 600 }}>{p.nombre}</td>
                          <td style={{ color: 'rgba(255,255,255,0.5)', padding: '8px' }}>{p.categoria || '—'}</td>
                          <td style={{ color: 'rgba(255,255,255,0.6)', padding: '8px', textAlign: 'center' }}>{p.cantidad}</td>
                          <td style={{ color: '#34d399', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${p.revenue.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Por vendedor */}
              {analisisTienda.porVendedor.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>👤 Por vendedor</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Vendedor</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}>Artículos</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porVendedor.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ color: 'white', padding: '8px', fontWeight: 600 }}>{v.nombre}</td>
                          <td style={{ color: 'rgba(255,255,255,0.6)', padding: '8px', textAlign: 'center' }}>{v.articulos}</td>
                          <td style={{ color: '#dd8a6c', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${v.total.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Por categoría */}
              {analisisTienda.porCategoria.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📂 Por categoría</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'left', padding: '8px' }}>Categoría</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '8px' }}>Cantidad</th>
                        <th style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '8px' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porCategoria.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ color: 'white', padding: '8px' }}>{c.categoria}</td>
                          <td style={{ color: 'rgba(255,255,255,0.6)', padding: '8px', textAlign: 'center' }}>{c.cantidad}</td>
                          <td style={{ color: '#f59e0b', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${c.revenue.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Alerta de restock */}
              {analisisTienda.restock.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <div style={{ color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>⚠️ Restock necesario (stock &lt; 3)</div>
                  {analisisTienda.restock.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: 'rgba(255,255,255,0.7)', borderBottom: i < analisisTienda.restock.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span>{p.nombre}</span>
                      <span style={{ color: '#f87171', fontWeight: 700 }}>{p.stock} en stock</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Transacciones del día */}
              {analisisTienda.transacciones?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'white', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                    🧾 Transacciones ({analisisTienda.transacciones.length})
                  </h3>
                  {analisisTienda.transacciones.map((t, i) => (
                    <div key={t.pago_id} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 10
                    }}>
                      {/* Header transacción */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>🕐 {t.hora}</span>
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>👤 {t.vendedor}</span>
                          <span style={{
                            background: 'rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 20
                          }}>
                            {t.metodo}
                          </span>
                        </div>
                        <span style={{ color: '#34d399', fontWeight: 700, fontSize: 15 }}>
                          ${t.total.toLocaleString('es-MX')}
                        </span>
                      </div>
                      {/* Artículos de la transacción */}
                      {t.articulos.map((a, j) => (
                        <div key={j} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                          fontSize: 13
                        }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {a.cantidad > 1 ? `x${a.cantidad} ` : ''}{a.nombre}
                          </span>
                          <span style={{ color: 'white', fontWeight: 600 }}>
                            ${(a.cantidad * a.precio).toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {analisisTienda.topProductos.length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>
                  Sin ventas de tienda para esta fecha
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== SECCIÓN ESTADO DE CUENTA ===================== */}
        {seccion === 'estado' && (
          <div>
            <select value={entregaSeleccionada} onChange={e => setEntregaSeleccionada(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: 'white', fontSize: 13, outline: 'none', marginBottom: 16 }}>
              <option value="">— Selecciona estado de cuenta —</option>
              {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}{e.nota ? ` · ${e.nota}` : ''}</option>)}
            </select>

            {cargando && <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {/* Filtro de categoría */}
            {!cargando && metricasEC && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Categoría:</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setFiltroCatReporte('')}
                    style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!filtroCatReporte ? 'rgba(193,85,58,0.5)' : 'rgba(255,255,255,0.1)'}`, background: !filtroCatReporte ? 'rgba(193,85,58,0.15)' : 'rgba(255,255,255,0.03)', color: !filtroCatReporte ? '#dd8a6c' : 'rgba(255,255,255,0.4)' }}>
                    Todas
                  </button>
                  {categoriasReporte.map(cat => (
                    <button key={cat.id} onClick={() => setFiltroCatReporte(cat.nombre)}
                      style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filtroCatReporte === cat.nombre ? 'rgba(193,85,58,0.5)' : 'rgba(255,255,255,0.1)'}`, background: filtroCatReporte === cat.nombre ? 'rgba(193,85,58,0.15)' : 'rgba(255,255,255,0.03)', color: filtroCatReporte === cat.nombre ? '#dd8a6c' : 'rgba(255,255,255,0.4)' }}>
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!cargando && metricasEC && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
                  <MetricCard label="Venta total" value={fmt(metricasEC.ventaTotal)} sub={`${metricasEC.totalPedidos} pedidos · ${metricasEC.clientesUnicos} clientes`} />
                  <MetricCard label="Utilidad" value={fmt(metricasEC.utilidadTotal)} sub={`Margen ${metricasEC.margen.toFixed(1)}%`} color="16,185,129" />
                  <MetricCard label="Total cobrado" value={fmt(metricasEC.cobradoTotal)} sub={`Anticipos: ${fmt(metricasEC.totalAnticipos)}`} />
                  <MetricCard label="Por cobrar" value={fmt(metricasEC.pendiente)} color="239,68,68" />
                </div>

                {/* Métricas filtradas por categoría */}
                {filtroCatReporte && (() => {
                  const pedsCat = rawPedidos.filter(p => p.categoria === filtroCatReporte)
                  const vCat = pedsCat.reduce((s, p) => s + (p.precio_venta || 0), 0)
                  const uCat = pedsCat.reduce((s, p) => s + (p.utilidad || 0), 0)
                  const mCat = vCat > 0 ? (uCat / vCat) * 100 : 0
                  return (
                    <div style={{ background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.18)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                      <div style={{ color: '#dd8a6c', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>📊 Categoría: {filtroCatReporte} — {pedsCat.length} pedidos</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                        <MetricCard label="Venta" value={fmt(vCat)} />
                        <MetricCard label="Utilidad" value={fmt(uCat)} color="16,185,129" />
                        <MetricCard label="Margen" value={`${mCat.toFixed(1)}%`} />
                      </div>
                    </div>
                  )
                })()}

                {/* Desglose por categoría */}
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
    </div>
  )
}
