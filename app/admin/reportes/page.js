'use client'
import { useState, useEffect, useRef } from 'react'
import ExcelJS from 'exceljs'

export default function Reportes() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Hermosillo' })
  const [fechaReporte, setFechaReporte] = useState(hoy)

  const [general, setGeneral] = useState(null)
  const [cargandoGeneral, setCargandoGeneral] = useState(false)
  // Un solo día no revela nada: un faltante de $50 un martes es ruido, pero
  // acumulado en el mes es una señal. Por eso el general va por rango.
  const [rango, setRango] = useState('hoy')
  const [rangoDesde, setRangoDesde] = useState(hoy)
  const [rangoHasta, setRangoHasta] = useState(hoy)
  const [visitaAbierta, setVisitaAbierta] = useState(null)
  // Un mes trae ~285 visitas. Se dibujan por tandas: la pantalla abre rápido y
  // quien busca algo viejo pide más.
  const [visitasVisibles, setVisitasVisibles] = useState(50)
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

  // Rango efectivo del reporte general.
  const rangoFechas = () => {
    if (rango === 'hoy') return [hoy, hoy]
    if (rango === 'dia') return [rangoDesde, rangoDesde]
    if (rango === 'rango') return [rangoDesde, rangoHasta]
    const d = new Date(hoy + 'T12:00:00')
    if (rango === '7') { const i = new Date(d); i.setDate(i.getDate() - 6); return [i.toLocaleDateString('en-CA'), hoy] }
    if (rango === 'mes') return [`${hoy.slice(0, 7)}-01`, hoy]
    return [hoy, hoy]
  }

  useEffect(() => {
    const [d, h] = rangoFechas()
    setCargandoGeneral(true)
    setVisitasVisibles(50)
    setVisitaAbierta(null)
    fetch(`/api/reportes/general?desde=${d}&hasta=${h}`)
      .then(r => r.json())
      .then(r => { if (r.ok) setGeneral(r); setCargandoGeneral(false) })
      .catch(() => setCargandoGeneral(false))
  }, [rango, rangoDesde, rangoHasta])

  const rotulo = { color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }
  const cifra = { color: 'var(--tinta)', fontSize: 19, fontWeight: 800, marginTop: 5, letterSpacing: -0.5 }
  const th = { color: 'var(--w40)', textAlign: 'left', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }
  const td = { padding: '11px 14px' }
  const campoR = { background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 9, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }

  // El signo va antes del peso: "-$11,859", no "$-11,859".
  const fmt = (n) => {
    const v = Number(n || 0)
    return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
  }

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => {
      // Más reciente primero: es la entrega que se consulta casi siempre.
      if (d.ok) setEntregas([...(d.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || '')))
    })
    fetch('/api/categorias').then(r => r.json()).then(d => { if (d.ok) setCategoriasReporte(d.categorias) })
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [fechaReporte])

  useEffect(() => {
    cargarAnalisisTienda()
  }, [rango, rangoDesde, rangoHasta])

  useEffect(() => {
    if (entregaSeleccionada) cargarEstadoCuenta()
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
      const resPeds = await fetch(`/api/reportes/pedidos?cliente_id_in=${clientesIds.join(',')}&fotos=no`)
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
    const [d, h] = rangoFechas()
    const res = await fetch(`/api/reportes/ventas-tienda?desde=${d}&hasta=${h}`)
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
      fetch(`/api/reportes/pedidos?entrega_id=${entregaSeleccionada}&fotos=no`).then(r => r.json()),
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

    // Si hay una entrega seleccionada, el Excel es el de esa entrega; si no,
    // el del periodo.
    if (entregaSeleccionada) {
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

  // Hay algo que exportar si el día trae pagos, o si hay un estado de cuenta
  // cargado. El botón se ajusta a lo que se está viendo.
  const hayDatos = rawPagos.length > 0 || (Boolean(metricasEC) && rawPedidos.length > 0)

  const MetricCard = ({ label, value, sub, color }) => (
    <div style={{ background: color ? `rgba(${color},0.08)` : 'var(--w03)', border: `1px solid ${color ? `rgba(${color},0.15)` : 'var(--w07)'}`, borderRadius: 12, padding: 14 }}>
      <div style={{ color: color ? `rgba(${color},0.7)` : 'var(--w40)', fontSize: 11, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ? `rgb(${color})` : 'white', fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: color ? `rgba(${color},0.5)` : 'var(--w30)', fontSize: 10, marginTop: 2 }}>{sub}</div>}
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
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Reportes</div>
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 3 }}>De dónde vino el dinero, por modelo de negocio</div>
          </div>
          {hayDatos && (
            <button onClick={exportarExcel}
              style={{ padding: '9px 18px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--verde)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Exportar a Excel
            </button>
          )}
        </div>

        {/* ===================== SECCIÓN GENERAL =====================
            Arriba el control (el cuadre y quién descuadra), luego el dinero.
            Ese orden es deliberado: lo primero que hay que saber al abrir un
            reporte de un negocio con efectivo es si el dinero cuadra. */}
        {(
          <div>
            {/* Rango */}
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
              {[['hoy', 'Hoy'], ['dia', 'Un día'], ['7', 'Últimos 7 días'], ['mes', 'Mes en curso'], ['rango', 'Entre fechas']].map(([v, t]) => (
                <button key={v} onClick={() => setRango(v)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${rango === v ? 'rgba(193,85,58,0.55)' : 'var(--w10)'}`,
                    background: rango === v ? 'rgba(193,85,58,0.14)' : 'transparent',
                    color: rango === v ? 'var(--marca-t)' : 'var(--w50)',
                    fontWeight: rango === v ? 700 : 500,
                  }}>{t}</button>
              ))}
              {rango === 'dia' && (
                <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={campoR} />
              )}
              {rango === 'rango' && (
                <>
                  <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={campoR} />
                  <span style={{ color: 'var(--w38)', fontSize: 12 }}>a</span>
                  <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} style={campoR} />
                </>
              )}
            </div>

            {cargandoGeneral && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando…</div>}

            {!cargandoGeneral && general && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* ── EL CUADRE ─────────────────────────────────────────── */}
                <div style={{
                  background: 'var(--sup)', borderRadius: 16, overflow: 'hidden',
                  border: `1px solid ${Math.abs(general.cuadre.diferencia) > 0.5 ? 'rgba(var(--rojo-rgb),0.35)' : 'var(--verde-borde)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                    <div>
                      <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>
                        Cuadre de efectivo
                      </div>
                      <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                        El sistema esperaba {fmt(general.cuadre.esperado)} · se contaron {fmt(general.cuadre.contado)}
                        {general.cuadre.cortes > 0 && ` · ${general.cuadre.cortes} cortes`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="monto" style={{
                        color: general.cuadre.diferencia < -0.5 ? 'var(--rojo-t)' : general.cuadre.diferencia > 0.5 ? 'var(--ambar)' : 'var(--verde)',
                        fontSize: 34, fontWeight: 900, letterSpacing: -1.2, lineHeight: 1,
                      }}>
                        {general.cuadre.diferencia > 0 ? '+' : ''}{fmt(general.cuadre.diferencia)}
                      </div>
                      <div style={{ color: 'var(--w38)', fontSize: 10.5, marginTop: 4 }}>
                        {general.cuadre.diferencia < -0.5 ? 'falta efectivo' : general.cuadre.diferencia > 0.5 ? 'sobra efectivo' : 'cuadra exacto'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Señales de control ────────────────────────────────── */}
                {(general.tienda.manuales > 0 || general.tienda.lineasSinCosto > 0 || general.comprobantesResueltos > 0 || general.cancelados.length > 0) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      general.tienda.manuales > 0 && [`${general.tienda.manuales} ventas por monto libre`, fmt(general.tienda.montoManual)],
                      general.tienda.lineasSinCosto > 0 && [`${general.tienda.lineasSinCosto} ventas sin costo`, fmt(general.tienda.ventaSinCosto)],
                      general.cancelados.length > 0 && [`${general.cancelados.length} pagos cancelados`, fmt(general.cancelados.reduce((s, c) => s + Number(c.monto || 0), 0))],
                    ].filter(Boolean).map(([et, v], i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--ambar-borde)', background: 'var(--ambar-suave)', borderRadius: 20, padding: '7px 14px' }}>
                        <span style={{ color: 'var(--w55)', fontSize: 12 }}>{et}</span>
                        <span className="monto" style={{ color: 'var(--ambar)', fontSize: 12.5, fontWeight: 800 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Dinero del periodo ────────────────────────────────── */}
                <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                    <div>
                      <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>
                        Entró en el periodo
                      </div>
                      <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                        {general.periodo.desde === general.periodo.hasta ? general.periodo.desde : `${general.periodo.desde} a ${general.periodo.hasta}`}
                      </div>
                    </div>
                    <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
                      {fmt(general.total)}
                    </div>
                  </div>

                  <div style={{ padding: '0 22px 20px' }}>
                    <Barra titulo="Por origen" total={general.total} partes={[
                      ['Entregas', general.ingresos.entregas, '#c1553a'],
                      ['Anticipos', general.ingresos.anticipos, '#2563eb'],
                      ['Tienda', general.ingresos.tienda, '#0f8a63'],
                      ['Otros', general.ingresos.otros, '#8a8178'],
                    ]} fmt={fmt} />
                    <div style={{ height: 20 }} />
                    <Desglose titulo="Por método de cobro" total={general.total} partes={[
                      ['Efectivo', general.porMetodo.Efectivo],
                      ['Transferencia', general.porMetodo.Transferencia],
                      ['Terminal', general.porMetodo.Terminal],
                      ['Otro', general.porMetodo.Otro],
                    ]} fmt={fmt} />
                  </div>

                  <div className="cifras-caja" style={{ borderTop: '1px solid var(--w06)' }}>
                    <div>
                      <div style={rotulo}>Utilidad de tienda</div>
                      <div className="monto" style={{ ...cifra, color: 'var(--verde)' }}>{fmt(general.tienda.utilidad)}</div>
                      <div style={{ color: 'var(--w35)', fontSize: 10, marginTop: 3 }}>
                        sobre {fmt(general.tienda.ventaConCosto)} con costo conocido
                      </div>
                    </div>
                    <div>
                      <div style={rotulo}>Margen de tienda</div>
                      <div className="monto" style={{ ...cifra, color: 'var(--verde)' }}>
                        {general.tienda.ventaConCosto > 0 ? `${((general.tienda.utilidad / general.tienda.ventaConCosto) * 100).toFixed(0)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div style={rotulo}>Artículos vendidos</div>
                      <div className="monto" style={cifra}>{general.tienda.articulos}</div>
                    </div>
                    <div>
                      <div style={rotulo}>Retiros de caja</div>
                      <div className="monto" style={{ ...cifra, color: general.retiros.length ? 'var(--ambar)' : 'var(--tinta)' }}>
                        {fmt(general.retiros.reduce((s, r) => s + Number(r.monto || 0), 0))}
                      </div>
                      <div style={{ color: 'var(--w35)', fontSize: 10, marginTop: 3 }}>{general.retiros.length} en el periodo</div>
                    </div>
                  </div>
                </div>

                {/* ── Visitas ───────────────────────────────────────────
                    Una visita = lo que pasó con una persona en un momento:
                    lo que recogió de su encargo, lo que se llevó de la tienda,
                    con qué métodos pagó y cuánto fue en total. En la base eso
                    vive como varios renglones sueltos; aquí vuelve a ser una
                    sola transacción, que es como ocurrió en el mostrador. */}
                {general.visitas?.length > 0 && (
                  <div>
                    <h3 style={{ ...rotulo, marginBottom: 4 }}>Transacciones del periodo</h3>
                    <p style={{ color: 'var(--w40)', fontSize: 12, marginBottom: 12 }}>
                      {general.visitas.length} {general.visitas.length === 1 ? 'visita' : 'visitas'}
                      {general.visitas.length > visitasVisibles && ` · mostrando las ${visitasVisibles} más recientes`}
                      {' · toca una para ver el detalle'}
                    </p>
                    <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                      {general.visitas.slice(0, visitasVisibles).map((v, i) => {
                        const abierta = visitaAbierta === i
                        const mixta = v.tienda > 0 && (v.entregas > 0 || v.anticipos > 0)
                        return (
                          <div key={i} style={{ borderBottom: i < general.visitas.length - 1 ? '1px solid var(--w05)' : 'none' }}>
                            <div onClick={() => setVisitaAbierta(abierta ? null : i)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', background: abierta ? 'var(--w03)' : 'transparent' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{v.nombre}</span>
                                  {mixta && (
                                    <span style={{ background: 'var(--marca)', color: 'var(--sup)', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, letterSpacing: 0.3 }}>
                                      ENCARGO + TIENDA
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: 'var(--w38)', fontSize: 11, marginTop: 3 }}>
                                  {new Date(v.desde).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                  {' · '}
                                  {[
                                    v.entregas > 0 && `encargo ${fmt(v.entregas)}`,
                                    v.tienda > 0 && `tienda ${fmt(v.tienda)}`,
                                    v.anticipos > 0 && `anticipo ${fmt(v.anticipos)}`,
                                    v.otros > 0 && `otros ${fmt(v.otros)}`,
                                  ].filter(Boolean).join(' + ')}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                  {Object.entries(v.metodos).map(([m, monto]) => (
                                    <span key={m} style={{ border: '1px solid var(--w10)', borderRadius: 20, padding: '2px 9px', fontSize: 10.5, color: 'var(--w50)' }}>
                                      {m} <b className="monto" style={{ color: 'var(--w70)' }}>{fmt(monto)}</b>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>{fmt(v.total)}</div>
                            </div>

                            {abierta && (
                              <div style={{ padding: '0 16px 15px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                                <div>
                                  <div style={{ ...rotulo, marginBottom: 7 }}>Recogió de su encargo</div>
                                  {v.recogio.length === 0
                                    ? <div style={{ color: 'var(--w30)', fontSize: 12 }}>Nada marcado como entregado</div>
                                    : v.recogio.map((a, j) => (
                                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0' }}>
                                        <span style={{ color: 'var(--w60)' }}>{a.cantidad > 1 ? `${a.cantidad}× ` : ''}{a.descripcion}</span>
                                        <span className="monto" style={{ color: 'var(--w45)', flexShrink: 0 }}>{fmt(a.precio)}</span>
                                      </div>
                                    ))}
                                </div>
                                <div>
                                  <div style={{ ...rotulo, marginBottom: 7 }}>Se llevó de la tienda</div>
                                  {v.articulos.length === 0
                                    ? <div style={{ color: 'var(--w30)', fontSize: 12 }}>Nada</div>
                                    : v.articulos.map((a, j) => (
                                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0' }}>
                                        <span style={{ color: 'var(--w60)' }}>
                                          {a.cantidad > 1 ? `${a.cantidad}× ` : ''}{a.nombre}
                                          {a.manual && <span style={{ color: 'var(--ambar)', fontSize: 10, marginLeft: 5 }}>monto libre</span>}
                                        </span>
                                        <span className="monto" style={{ color: 'var(--w45)', flexShrink: 0 }}>{fmt(a.importe)}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {general.visitas.length > visitasVisibles && (
                      <button onClick={() => setVisitasVisibles(n => n + 50)}
                        style={{
                          width: '100%', marginTop: 10, padding: '11px', borderRadius: 11, cursor: 'pointer',
                          border: '1px solid var(--w10)', background: 'transparent',
                          color: 'var(--marca-t)', fontSize: 12.5, fontWeight: 700,
                        }}>
                        Ver 50 más · quedan {general.visitas.length - visitasVisibles}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Por colaborador ───────────────────────────────────── */}
                {general.control.length > 0 && (
                  <div>
                    <h3 style={{ ...rotulo, marginBottom: 10 }}>Por colaborador</h3>
                    <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--w08)' }}>
                              <th style={th}>Persona</th>
                              <th style={{ ...th, textAlign: 'center' }}>Cortes</th>
                              <th style={{ ...th, textAlign: 'right' }}>Diferencia acumulada</th>
                              <th style={{ ...th, textAlign: 'right' }}>Peor corte</th>
                              <th style={{ ...th, textAlign: 'right' }}>Vendió</th>
                              <th style={{ ...th, textAlign: 'right' }}>Monto libre</th>
                              <th style={{ ...th, textAlign: 'right' }}>Descuentos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {general.control.map(c => (
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--w04)' }}>
                                <td style={{ ...td, fontWeight: 700, color: 'var(--tinta)' }}>{c.nombre}</td>
                                <td style={{ ...td, textAlign: 'center', color: 'var(--w45)' }}>{c.cortes || '—'}</td>
                                <td className="monto" style={{ ...td, textAlign: 'right', fontWeight: 800, color: c.diferencia < -0.5 ? 'var(--rojo-t)' : c.diferencia > 0.5 ? 'var(--ambar)' : 'var(--verde)' }}>
                                  {c.cortes ? `${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia)}` : '—'}
                                </td>
                                <td className="monto" style={{ ...td, textAlign: 'right', color: 'var(--w45)' }}>
                                  {c.peorDiferencia ? fmt(c.peorDiferencia) : '—'}
                                </td>
                                <td className="monto" style={{ ...td, textAlign: 'right', color: 'var(--w55)' }}>{fmt(c.montoVendido)}</td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                  {c.manuales > 0 ? (
                                    <span>
                                      <span className="monto" style={{ color: c.pctManual >= 20 ? 'var(--rojo-t)' : c.pctManual >= 10 ? 'var(--ambar)' : 'var(--w55)', fontWeight: 700 }}>
                                        {fmt(c.montoManual)}
                                      </span>
                                      <span style={{ color: 'var(--w35)', fontSize: 10.5, marginLeft: 5 }}>{c.pctManual}%</span>
                                    </span>
                                  ) : <span style={{ color: 'var(--w25)' }}>—</span>}
                                </td>
                                <td className="monto" style={{ ...td, textAlign: 'right', color: c.montoDescuento > 0 ? 'var(--ambar)' : 'var(--w25)' }}>
                                  {c.montoDescuento > 0 ? fmt(c.montoDescuento) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p style={{ color: 'var(--w38)', fontSize: 11, marginTop: 9, lineHeight: 1.5 }}>
                      La diferencia acumulada suma todos los cortes del periodo. Un faltante aislado casi
                      siempre es error de captura; lo que hay que mirar es el patrón — la misma persona
                      cerrando corto una y otra vez. "Monto libre" son ventas tecleadas sin producto del
                      catálogo: por encima del 20% de lo que vende alguien, vale la pena revisar.
                    </p>
                  </div>
                )}

                {/* ── Retiros y cancelaciones ───────────────────────────── */}
                {(general.retiros.length > 0 || general.cancelados.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    {general.retiros.length > 0 && (
                      <div>
                        <h3 style={{ ...rotulo, marginBottom: 10 }}>Retiros de caja</h3>
                        <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                          {general.retiros.map((r, i) => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < general.retiros.length - 1 ? '1px solid var(--w04)' : 'none' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 600 }}>{r.motivo || 'Sin motivo'}</div>
                                <div style={{ color: r.admin_id ? 'var(--w35)' : 'var(--rojo-t)', fontSize: 10.5 }}>
                                  {r.admin_id ? r.quien : 'sin responsable registrado'} · {String(r.creado_en).slice(0, 10)}
                                </div>
                              </div>
                              <span className="monto" style={{ color: 'var(--ambar)', fontWeight: 800, fontSize: 13 }}>{fmt(r.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {general.cancelados.length > 0 && (
                      <div>
                        <h3 style={{ ...rotulo, marginBottom: 10 }}>Pagos cancelados</h3>
                        <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                          {general.cancelados.map((c, i) => (
                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < general.cancelados.length - 1 ? '1px solid var(--w04)' : 'none' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 600 }}>{c.cliente}</div>
                                <div style={{ color: 'var(--w35)', fontSize: 10.5 }}>{c.cancelado_motivo} · {c.quien}</div>
                              </div>
                              <span className="monto" style={{ color: 'var(--rojo-t)', fontWeight: 800, fontSize: 13 }}>{fmt(c.monto)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* La tabla de entregas del día se retiró: las Transacciones del
            periodo muestran lo mismo y con más detalle. */}
        {false && (
          <div>
            {cargando && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {!cargando && (
              <div>
                {/* ── El día ──────────────────────────────────────────
                    Antes eran tres tarjetas iguales y el total en una cuarta,
                    más chica y desalineada. El total del día manda; el resto
                    explica de dónde salió. */}
                <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                    <div>
                      <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>
                        Total del día
                      </div>
                      <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                        {metricasDelDia.numClientesEntregas === 1
                          ? '1 cliente en entregas'
                          : `${metricasDelDia.numClientesEntregas} clientes en entregas`}
                        {metricasDelDia.numTransaccionesTienda > 0 && ` · ${metricasDelDia.numTransaccionesTienda} ventas en tienda`}
                      </div>
                    </div>
                    <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
                      {fmt(metricasDelDia.totalGeneral)}
                    </div>
                  </div>

                  {/* De dónde vino. Tres orígenes con etiqueta y cifra: el
                      color acompaña, nunca carga el dato solo. */}
                  {metricasDelDia.totalGeneral > 0 && (
                    <div style={{ padding: '0 22px 18px' }}>
                      <div style={{ display: 'flex', gap: 2, height: 12 }}>
                        {[
                          ['Entregas', metricasDelDia.totalCobradoEntregas, '#c1553a'],
                          ['Anticipos', metricasDelDia.totalAnticipos, '#2563eb'],
                          ['Tienda', metricasDelDia.totalTienda, '#0f8a63'],
                        ].filter(([, v]) => v > 0).map(([et, v, tono], i, arr) => (
                          <div key={et} title={`${et}: ${fmt(v)}`} style={{
                            width: `${(v / metricasDelDia.totalGeneral) * 100}%`,
                            background: tono,
                            borderTopLeftRadius: i === 0 ? 6 : 2, borderBottomLeftRadius: i === 0 ? 6 : 2,
                            borderTopRightRadius: i === arr.length - 1 ? 6 : 2, borderBottomRightRadius: i === arr.length - 1 ? 6 : 2,
                          }} />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 18, marginTop: 11, flexWrap: 'wrap' }}>
                        {[
                          ['Entregas', metricasDelDia.totalCobradoEntregas, '#c1553a'],
                          ['Anticipos', metricasDelDia.totalAnticipos, '#2563eb'],
                          ['Tienda', metricasDelDia.totalTienda, '#0f8a63'],
                        ].map(([et, v, tono]) => (
                          <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: tono, flexShrink: 0 }} />
                            <span style={{ color: 'var(--w42)', fontSize: 11.5 }}>{et}</span>
                            <span className="monto" style={{ color: 'var(--w80)', fontSize: 12, fontWeight: 700 }}>{fmt(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabla resumen por cliente */}
                {resumenClientesEntregas.length > 0 ? (
                  <div>
                    <h3 style={{ color: 'var(--w32)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 10 }}>
                      Entregas del día
                      <span style={{ color: 'var(--marca-t)', marginLeft: 8, fontWeight: 800 }}>
                        {resumenClientesEntregas.length} {resumenClientesEntregas.length === 1 ? 'cliente' : 'clientes'}
                      </span>
                    </h3>
                    <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                          <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '12px 14px' }}>Cliente</th>
                          <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}>Artículos</th>
                          <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Método</th>
                          <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Total pagado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumenClientesEntregas.map((c, i) => (
                          <tr key={c.cliente_id} style={{ borderBottom: '1px solid var(--w05)', background: i % 2 === 0 ? 'var(--w02)' : 'transparent' }}>
                            <td style={{ color: 'var(--tinta)', padding: '10px 8px', fontWeight: 600 }}>{c.nombre}</td>
                            <td style={{ color: 'var(--w60)', padding: '10px 8px', textAlign: 'center' }}>{c.numArticulos}</td>
                            <td style={{ color: 'var(--w60)', padding: '10px 8px' }}>{c.metodos}</td>
                            <td style={{ color: 'var(--marca-t)', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>${c.totalPagado.toLocaleString('es-MX')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '1px solid var(--w15)' }}>
                          <td style={{ color: 'var(--w50)', padding: '10px 8px', fontWeight: 700 }}>Total</td>
                          <td style={{ color: 'var(--w50)', padding: '10px 8px', textAlign: 'center' }}>
                            {resumenClientesEntregas.reduce((s, c) => s + c.numArticulos, 0)}
                          </td>
                          <td></td>
                          <td style={{ color: 'var(--marca-t)', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                            ${metricasDelDia.totalCobradoEntregas.toLocaleString('es-MX')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--w40)', textAlign: 'center', padding: 40 }}>
                    Sin entregas registradas para esta fecha
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================== ANÁLISIS DE TIENDA ===================== */}
        {(
          <div>
            {cargando && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {!cargando && (
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                  <div>
                    <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>
                      Ventas de tienda
                    </div>
                    <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                      {metricasDelDia.numTransaccionesTienda === 1 ? '1 transacción' : `${metricasDelDia.numTransaccionesTienda} transacciones`}
                      {analisisTienda.totalArticulos > 0 && ` · ${analisisTienda.totalArticulos} artículos`}
                    </div>
                  </div>
                  <div className="monto" style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
                    {fmt(metricasDelDia.totalTienda)}
                  </div>
                </div>

                <div className="cifras-caja" style={{ borderTop: '1px solid var(--w06)' }}>
                  <div>
                    <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Artículos</div>
                    <div className="monto" style={{ color: 'var(--tinta)', fontSize: 19, fontWeight: 800, marginTop: 5 }}>{analisisTienda.totalArticulos}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Vendedor más activo</div>
                    <div style={{ color: 'var(--marca-t)', fontSize: 15, fontWeight: 800, marginTop: 7 }}>{analisisTienda.vendedorTop || '—'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Utilidad</div>
                    <div className="monto" style={{ color: 'var(--ambar)', fontSize: 19, fontWeight: 800, marginTop: 5 }}>{fmt(utilidadMostrada)}</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--w40)', cursor: 'pointer', marginTop: 5 }}>
                      <input type="checkbox" checked={incluirPorConciliar} onChange={(e) => setIncluirPorConciliar(e.target.checked)} />
                      incluir por conciliar
                    </label>
                    {analisisTienda.porConciliar.length > 0 && (
                      <div style={{ color: 'var(--rojo-t)', fontSize: 10.5, marginTop: 4 }}>
                        {analisisTienda.porConciliar.length} sin costo capturado
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Análisis de ventas de tienda (ventas_tienda) ───────────── */}
            <div>

              {/* Ventas manuales por conciliar: sin costo_unitario al momento de cobrar */}
              {analisisTienda.porConciliar.length > 0 && (
                <div style={{ marginBottom: 24, background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 12, padding: 16 }}>
                  <h3 style={{ color: 'var(--ambar)', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>⚠ Ventas manuales por conciliar ({analisisTienda.porConciliar.length})</h3>
                  <p style={{ color: 'var(--w50)', fontSize: 12, marginBottom: 12 }}>
                    Ventas rápidas por monto o producto sin catálogo — no tenían costo conocido al cobrar. Captura el costo real para que la utilidad quede exacta.
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                        <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Artículo</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}>Cant.</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Precio venta</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Costo unitario</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porConciliar.map((v) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--w05)' }}>
                          <td style={{ padding: '8px', color: 'var(--tinta)' }}>{v.nombre_producto}</td>
                          <td style={{ padding: '8px', textAlign: 'center', color: 'var(--w70)' }}>{v.cantidad}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--w70)', fontFamily: 'monospace' }}>${Number(v.precio_unitario).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={costoDraft[v.id] ?? ''}
                              onChange={(e) => setCostoDraft(prev => ({ ...prev, [v.id]: e.target.value }))}
                              style={{ width: 90, background: 'var(--w05)', border: '1px solid var(--w15)', borderRadius: 8, padding: '6px 8px', color: 'var(--tinta)', fontSize: 12, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              disabled={!costoDraft[v.id] || guardandoCosto === v.id}
                              onClick={() => guardarCostoConciliacion(v.id)}
                              style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--verde)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: costoDraft[v.id] ? 'pointer' : 'not-allowed', opacity: costoDraft[v.id] ? 1 : 0.5 }}
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
                  <h3 style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🏆 Top productos</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                        <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Producto</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Categoría</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}>Cantidad</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.topProductos.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--w05)', background: i % 2 === 0 ? 'var(--w02)' : 'transparent' }}>
                          <td style={{ color: 'var(--tinta)', padding: '8px', fontWeight: 600 }}>{p.nombre}</td>
                          <td style={{ color: 'var(--w50)', padding: '8px' }}>{p.categoria || '—'}</td>
                          <td style={{ color: 'var(--w60)', padding: '8px', textAlign: 'center' }}>{p.cantidad}</td>
                          <td style={{ color: 'var(--verde)', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${p.revenue.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Por vendedor */}
              {analisisTienda.porVendedor.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>👤 Por vendedor</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                        <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Vendedor</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}>Artículos</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porVendedor.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--w05)' }}>
                          <td style={{ color: 'var(--tinta)', padding: '8px', fontWeight: 600 }}>{v.nombre}</td>
                          <td style={{ color: 'var(--w60)', padding: '8px', textAlign: 'center' }}>{v.articulos}</td>
                          <td style={{ color: 'var(--marca-t)', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${v.total.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Por categoría */}
              {analisisTienda.porCategoria.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📂 Por categoría</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                        <th style={{ color: 'var(--w50)', textAlign: 'left', padding: '8px' }}>Categoría</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'center', padding: '8px' }}>Cantidad</th>
                        <th style={{ color: 'var(--w50)', textAlign: 'right', padding: '8px' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisisTienda.porCategoria.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--w05)' }}>
                          <td style={{ color: 'var(--tinta)', padding: '8px' }}>{c.categoria}</td>
                          <td style={{ color: 'var(--w60)', padding: '8px', textAlign: 'center' }}>{c.cantidad}</td>
                          <td style={{ color: 'var(--ambar)', padding: '8px', textAlign: 'right', fontWeight: 700 }}>${c.revenue.toLocaleString('es-MX')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Alerta de restock */}
              {analisisTienda.restock.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <div style={{ color: 'var(--rojo-t)', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>⚠️ Restock necesario (stock &lt; 3)</div>
                  {analisisTienda.restock.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: 'var(--w70)', borderBottom: i < analisisTienda.restock.length - 1 ? '1px solid var(--w05)' : 'none' }}>
                      <span>{p.nombre}</span>
                      <span style={{ color: 'var(--rojo-t)', fontWeight: 700 }}>{p.stock} en stock</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Transacciones del día */}
              {analisisTienda.transacciones?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                    🧾 Transacciones ({analisisTienda.transacciones.length})
                  </h3>
                  {analisisTienda.transacciones.map((t, i) => (
                    <div key={t.pago_id} style={{
                      background: 'var(--w04)',
                      border: '1px solid var(--w08)',
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 10
                    }}>
                      {/* Header transacción */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span style={{ color: 'var(--w40)', fontSize: 12 }}>🕐 {t.hora}</span>
                          <span style={{ color: 'var(--w60)', fontSize: 12 }}>👤 {t.vendedor}</span>
                          <span style={{
                            background: 'var(--w08)',
                            color: 'var(--w60)',
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 20
                          }}>
                            {t.metodo}
                          </span>
                        </div>
                        <span style={{ color: 'var(--verde)', fontWeight: 700, fontSize: 15 }}>
                          ${t.total.toLocaleString('es-MX')}
                        </span>
                      </div>
                      {/* Artículos de la transacción */}
                      {t.articulos.map((a, j) => (
                        <div key={j} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderTop: '1px solid var(--w05)',
                          fontSize: 13
                        }}>
                          <span style={{ color: 'var(--w70)' }}>
                            {a.cantidad > 1 ? `x${a.cantidad} ` : ''}{a.nombre}
                          </span>
                          <span style={{ color: 'var(--tinta)', fontWeight: 600 }}>
                            ${(a.cantidad * a.precio).toLocaleString('es-MX')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {analisisTienda.topProductos.length === 0 && (
                <div style={{ color: 'var(--w40)', textAlign: 'center', padding: 40 }}>
                  Sin ventas de tienda para esta fecha
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== SECCIÓN ESTADO DE CUENTA ===================== */}
        {/* Estado de cuenta: vive dentro de Entregas porque es exactamente eso
            — quién debe de los encargos de una entrega. Antes era una pestaña
            aparte y obligaba a saltar entre dos pantallas del mismo tema. */}
        {(
          <div style={{ marginTop: 34, borderTop: '1px solid var(--w07)', paddingTop: 26 }}>
            <h3 style={{ ...rotulo, marginBottom: 4 }}>Rentabilidad por entrega</h3>
            <p style={{ color: 'var(--w40)', fontSize: 12, marginBottom: 14 }}>
              Una entrega no cabe en un rango de fechas: se cobra durante semanas. Aquí
              va completa — lo vendido, la utilidad y quién falta por pagar.
            </p>
            <select value={entregaSeleccionada} onChange={e => setEntregaSeleccionada(e.target.value)}
              style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 14px', color: 'var(--tinta)', fontSize: 13, outline: 'none', marginBottom: 16 }}>
              <option value="">— Selecciona estado de cuenta —</option>
              {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}{e.nota ? ` · ${e.nota}` : ''}</option>)}
            </select>

            {cargando && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando...</div>}

            {/* Filtro de categoría */}
            {!cargando && metricasEC && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ color: 'var(--w40)', fontSize: 11 }}>Categoría:</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setFiltroCatReporte('')}
                    style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${!filtroCatReporte ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: !filtroCatReporte ? 'rgba(193,85,58,0.15)' : 'var(--w03)', color: !filtroCatReporte ? 'var(--marca-t)' : 'var(--w40)' }}>
                    Todas
                  </button>
                  {categoriasReporte.map(cat => (
                    <button key={cat.id} onClick={() => setFiltroCatReporte(cat.nombre)}
                      style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filtroCatReporte === cat.nombre ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: filtroCatReporte === cat.nombre ? 'rgba(193,85,58,0.15)' : 'var(--w03)', color: filtroCatReporte === cat.nombre ? 'var(--marca-t)' : 'var(--w40)' }}>
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
                      <div style={{ color: 'var(--marca-t)', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>📊 Categoría: {filtroCatReporte} — {pedsCat.length} pedidos</div>
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
                    <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--w06)', color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>Por categoría</div>
                      {rows.map(([cat, d], i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '9px 16px', borderTop: '1px solid var(--w04)' }}>
                          <span style={{ color: 'var(--tinta)', fontSize: 13 }}>{cat}</span>
                          <span style={{ color: 'var(--tinta)', fontSize: 13, textAlign: 'right' }}>{fmt(d.venta)}</span>
                          <span style={{ color: 'var(--verde)', fontSize: 13, textAlign: 'right' }}>{fmt(d.utilidad)}</span>
                          <span style={{ color: 'var(--w50)', fontSize: 13, textAlign: 'right' }}>{d.count} ped.</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {porClienteEC.length > 0 && (
                  <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--w06)', color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>Por cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', background: 'var(--w02)' }}>
                      {['Cliente','Venta','Utilidad','Estado'].map((h, i) => (
                        <span key={i} style={{ color: 'var(--w30)', fontSize: 10, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                      ))}
                    </div>
                    {porClienteEC.map((c, i) => {
                      const pendiente = c.venta - c.cobrado
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid var(--w04)', alignItems: 'center' }}>
                          <span style={{ color: 'var(--tinta)', fontSize: 13 }}>{c.nombre}</span>
                          <span style={{ color: 'var(--tinta)', fontSize: 13, textAlign: 'right' }}>{fmt(c.venta)}</span>
                          <span style={{ color: 'var(--verde)', fontSize: 13, textAlign: 'right' }}>{fmt(c.utilidad)}</span>
                          <div style={{ textAlign: 'right' }}>
                            {pendiente <= 0
                              ? <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--verde)', fontSize: 10 }}>✓ Liquidado</span>
                              : <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--rojo-t)', fontSize: 10 }}>{fmt(pendiente)}</span>
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
              <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>
                Selecciona un estado de cuenta para ver sus números
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// Barra apilada de composición. Cada parte lleva etiqueta y monto: el color
// acompaña la lectura, nunca es el único portador del dato. Paleta validada
// para daltonismo en ese orden fijo (terracota, azul, verde, gris).
function Barra({ titulo, total, partes, fmt }) {
  const vivas = partes.filter(([, v]) => v > 0)
  if (!total || !vivas.length) return null
  return (
    <div>
      <div style={{ color: 'rgba(var(--base),0.55)', fontSize: 11.5, fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', gap: 2, height: 12 }}>
        {vivas.map(([et, v, tono], i) => (
          <div key={et} title={`${et}: ${fmt(v)}`} style={{
            width: `${(v / total) * 100}%`, background: tono,
            borderTopLeftRadius: i === 0 ? 6 : 2, borderBottomLeftRadius: i === 0 ? 6 : 2,
            borderTopRightRadius: i === vivas.length - 1 ? 6 : 2, borderBottomRightRadius: i === vivas.length - 1 ? 6 : 2,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        {vivas.map(([et, v, tono]) => (
          <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: tono, flexShrink: 0 }} />
            <span style={{ color: 'rgba(var(--base),0.45)', fontSize: 11.5 }}>{et}</span>
            <span className="monto" style={{ color: 'rgba(var(--base),0.8)', fontSize: 12, fontWeight: 700 }}>{fmt(v)}</span>
            <span style={{ color: 'rgba(var(--base),0.32)', fontSize: 10.5 }}>{((v / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Desglose por magnitud, sin color de identidad.
//
// Cuando en la misma pantalla hay dos desgloses distintos del mismo total
// (de dónde vino el dinero, y con qué se pagó), pintarlos con la misma paleta
// hace que el ojo los empareje: se lee "entregas = efectivo" aunque no tengan
// relación. Aquí sólo uno lleva color de identidad — el origen, donde importa
// distinguir negocios — y el otro se resuelve con longitud y un solo tono.
// Escala mejor además: si mañana hay seis métodos, siguen siendo seis
// renglones legibles y no seis colores nuevos que inventar.
function Desglose({ titulo, total, partes, fmt }) {
  const vivas = partes.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (!total || !vivas.length) return null
  const mayor = vivas[0][1]
  return (
    <div>
      <div style={{ color: 'rgba(var(--base),0.55)', fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {vivas.map(([et, v]) => (
          <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'rgba(var(--base),0.55)', fontSize: 12, width: 108, flexShrink: 0 }}>{et}</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(var(--base),0.06)', borderRadius: 5, overflow: 'hidden', minWidth: 40 }}>
              <div style={{ width: `${(v / mayor) * 100}%`, height: '100%', background: 'rgba(var(--base),0.34)', borderRadius: 5 }} />
            </div>
            <span className="monto" style={{ color: 'rgba(var(--base),0.8)', fontSize: 12.5, fontWeight: 700, width: 88, textAlign: 'right', flexShrink: 0 }}>{fmt(v)}</span>
            <span style={{ color: 'rgba(var(--base),0.32)', fontSize: 11, width: 34, textAlign: 'right', flexShrink: 0 }}>{((v / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
