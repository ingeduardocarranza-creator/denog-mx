'use client'
import { useState, useEffect } from 'react'
import ExcelJS from 'exceljs'

// ─────────────────────────────────────────────────────────────────────────────
// Reportes — cinco vistas, cada una responde UNA pregunta:
//   Resumen     ¿cuánto entró y de dónde?            (cuadre + total + origen)
//   Tienda      ¿qué se vendió en el mostrador?      (ventas_tienda)
//   Pedidos     ¿qué entró por encargos y anticipos? (visitas de clientes)
//   Por entrega ¿cómo le fue a UNA entrega completa? (venta, utilidad, saldo)
//   Control     ¿alguien descuadra o hay algo raro?  (cortes, colaboradores…)
// El periodo (hoy / 7 días / mes / fechas) manda en todas menos "Por entrega":
// una entrega se cobra durante semanas y no cabe en un rango de fechas.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'America/Hermosillo'

// El signo va antes del peso: "-$11,859", no "$-11,859".
const fmt = (n) => {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
}

const hora = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const diaCorto = (iso) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '')

// Estilos compartidos
const tarjeta = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }
const rotulo = { color: 'var(--w50)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }
const th = { color: 'var(--w55)', textAlign: 'left', padding: '11px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }
const td = { padding: '11px 14px' }
const campoR = { background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 9, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }

const VISTAS = [
  ['resumen', 'Resumen'],
  ['tienda', 'Tienda'],
  ['pedidos', 'Pedidos'],
  ['entrega', 'Por entrega'],
  ['control', 'Control'],
]

export default function Reportes() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [vista, setVista] = useState('resumen')

  // Periodo
  const [rango, setRango] = useState('hoy')
  const [rangoDesde, setRangoDesde] = useState(hoy)
  const [rangoHasta, setRangoHasta] = useState(hoy)

  // General (cuadre, ingresos, visitas, control…)
  const [general, setGeneral] = useState(null)
  const [cargandoGeneral, setCargandoGeneral] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState('')

  // Pagos del periodo (para Excel) y resumen por cliente
  const [resumenClientesEntregas, setResumenClientesEntregas] = useState([])
  const [metricasDelDia, setMetricasDelDia] = useState({ totalCobradoEntregas: 0, totalAnticipos: 0, totalTienda: 0, totalGeneral: 0 })
  const [rawPagosPeriodo, setRawPagosPeriodo] = useState([])

  // Tienda
  const [analisisTienda, setAnalisisTienda] = useState({
    topProductos: [], porVendedor: [], porCategoria: [], totalVendido: 0, totalArticulos: 0,
    vendedorTop: '', restock: [], transacciones: [], utilidadConocida: 0, porConciliar: [],
  })
  const [cargandoTienda, setCargandoTienda] = useState(false)
  const [incluirPorConciliar, setIncluirPorConciliar] = useState(false)
  const [costoDraft, setCostoDraft] = useState({})
  const [guardandoCosto, setGuardandoCosto] = useState(null)

  // Por entrega
  const [entregas, setEntregas] = useState([])
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('')
  const [cargandoEC, setCargandoEC] = useState(false)
  const [metricasEC, setMetricasEC] = useState(null)
  const [porClienteEC, setPorClienteEC] = useState([])
  const [rawPedidos, setRawPedidos] = useState([])
  const [rawPagosEntrega, setRawPagosEntrega] = useState([])
  const [categoriasReporte, setCategoriasReporte] = useState([])
  const [filtroCatReporte, setFiltroCatReporte] = useState('')

  // Rango efectivo
  const rangoFechas = () => {
    if (rango === 'hoy') return [hoy, hoy]
    if (rango === 'dia') return [rangoDesde, rangoDesde]
    if (rango === 'rango') return [rangoDesde, rangoHasta]
    const d = new Date(hoy + 'T12:00:00')
    if (rango === '7') { const i = new Date(d); i.setDate(i.getDate() - 6); return [i.toLocaleDateString('en-CA'), hoy] }
    if (rango === 'mes') return [`${hoy.slice(0, 7)}-01`, hoy]
    return [hoy, hoy]
  }

  const etiquetaPeriodo = () => {
    const [d, h] = rangoFechas()
    const larga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    const corta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
    if (d === h) return d === hoy ? `Hoy · ${larga(d)}` : larga(d)
    return `${corta(d)} → ${corta(h)}`
  }

  // ── Cargas ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const [d, h] = rangoFechas()
    setCargandoGeneral(true)
    fetch(`/api/reportes/general?desde=${d}&hasta=${h}`)
      .then(r => r.json())
      .then(r => {
        if (r.ok) { setGeneral(r); setErrorGeneral('') }
        // Callar un fallo en una pantalla de control es peor que enseñarlo feo.
        else setErrorGeneral(r.mensaje || 'No se pudo cargar el reporte')
        setCargandoGeneral(false)
      })
      .catch(() => { setErrorGeneral('No se pudo conectar con el servidor'); setCargandoGeneral(false) })
    cargarDatos()
    cargarAnalisisTienda()
  }, [rango, rangoDesde, rangoHasta])

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => {
      // Más reciente primero: es la entrega que se consulta casi siempre.
      if (d.ok) setEntregas([...(d.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || '')))
    })
    fetch('/api/categorias').then(r => r.json()).then(d => { if (d.ok) setCategoriasReporte(d.categorias) })
  }, [])

  // Al abrir "Por entrega" sin nada elegido, se abre la más reciente.
  useEffect(() => {
    if (vista === 'entrega' && !entregaSeleccionada && entregas.length > 0) setEntregaSeleccionada(entregas[0].id)
  }, [vista, entregas])

  useEffect(() => {
    if (entregaSeleccionada) cargarEstadoCuenta()
  }, [entregaSeleccionada])

  // Pagos del periodo: alimenta el Excel y el resumen por cliente.
  const cargarDatos = async () => {
    const [d, h] = rangoFechas()
    const resPagos = await fetch(`/api/reportes/pagos?desde=${d}&hasta=${h}`)
    const datPagos = await resPagos.json()
    const pagosDelDia = datPagos.pagos || []

    const pagosEntregas = pagosDelDia.filter(p => p.cliente_id && p.tipo === 'Venta Liquidación')
    const pagosAnticipos = pagosDelDia.filter(p => p.cliente_id && p.tipo === 'Anticipo')
    const pagosTienda = pagosDelDia.filter(p => !p.cliente_id && p.tipo === 'Venta Liquidación')

    const porCliente = {}
    pagosEntregas.forEach(p => {
      if (!porCliente[p.cliente_id]) porCliente[p.cliente_id] = { nombre: p.clientes?.nombre || 'Sin nombre', pagos: [], totalPagado: 0 }
      porCliente[p.cliente_id].pagos.push(p)
      porCliente[p.cliente_id].totalPagado += Number(p.monto) || 0
    })

    const clientesIds = Object.keys(porCliente)
    const pedidosPorCliente = {}
    if (clientesIds.length > 0) {
      const resPeds = await fetch(`/api/reportes/pedidos?cliente_id_in=${clientesIds.join(',')}&fotos=no`)
      const datPeds = await resPeds.json()
      ;(datPeds.pedidos || []).filter(p => p.estado === 'Entregado').forEach(p => {
        if (!pedidosPorCliente[p.cliente_id]) pedidosPorCliente[p.cliente_id] = []
        pedidosPorCliente[p.cliente_id].push(p)
      })
    }

    setResumenClientesEntregas(Object.entries(porCliente).map(([id, c]) => ({
      cliente_id: id,
      nombre: c.nombre,
      totalPagado: c.totalPagado,
      metodos: [...new Set(c.pagos.map(p => p.metodo))].join(' + '),
      numArticulos: (pedidosPorCliente[id] || []).length,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))

    const totalCobradoEntregas = pagosEntregas.reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const totalAnticipos = pagosAnticipos.reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const totalTienda = pagosTienda.reduce((s, p) => s + (Number(p.monto) || 0), 0)
    setMetricasDelDia({ totalCobradoEntregas, totalAnticipos, totalTienda, totalGeneral: totalCobradoEntregas + totalAnticipos + totalTienda })
    setRawPagosPeriodo(pagosDelDia)
  }

  const cargarAnalisisTienda = async () => {
    const [d, h] = rangoFechas()
    setCargandoTienda(true)
    const res = await fetch(`/api/reportes/ventas-tienda?desde=${d}&hasta=${h}`)
    const data = await res.json()
    const ventas = data.ok ? data.ventas || [] : []

    const porProducto = {}
    const porVendedor = {}
    const porCategoria = {}
    const porTransaccion = {}
    ventas.forEach(v => {
      const importe = v.cantidad * v.precio_unitario

      const k = v.nombre_producto
      if (!porProducto[k]) porProducto[k] = { nombre: k, categoria: v.categoria, cantidad: 0, revenue: 0, stock: v.productos_tienda?.stock ?? null }
      porProducto[k].cantidad += v.cantidad
      porProducto[k].revenue += importe

      const vend = v.clientes?.nombre || 'Sin nombre'
      if (!porVendedor[vend]) porVendedor[vend] = { nombre: vend, articulos: 0, total: 0 }
      porVendedor[vend].articulos += v.cantidad
      porVendedor[vend].total += importe

      const cat = v.categoria || 'Sin categoría'
      if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, cantidad: 0, revenue: 0 }
      porCategoria[cat].cantidad += v.cantidad
      porCategoria[cat].revenue += importe

      const pagoId = v.pago_id || v.id
      if (!porTransaccion[pagoId]) {
        porTransaccion[pagoId] = {
          pago_id: pagoId,
          vendedor: vend,
          metodo: v.pagos?.metodo && v.pagos_2?.metodo ? `${v.pagos.metodo} + ${v.pagos_2.metodo}` : (v.pagos?.metodo || '—'),
          creado_en: v.creado_en,
          articulos: [],
          total: 0,
        }
      }
      porTransaccion[pagoId].articulos.push({ nombre: v.nombre_producto, cantidad: v.cantidad, precio: v.precio_unitario })
      porTransaccion[pagoId].total += importe
    })

    const topProductos = Object.values(porProducto).sort((a, b) => b.revenue - a.revenue)
    const porVendedorOrdenado = Object.values(porVendedor).sort((a, b) => b.total - a.total)

    // Utilidad exacta = solo líneas con costo conocido. Las manuales sin costo
    // quedan "por conciliar" hasta que el admin capture el costo real.
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
      restock: [...topProductos].filter(p => p.stock != null && p.stock < 3).sort((a, b) => a.stock - b.stock),
      transacciones: Object.values(porTransaccion).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))),
      utilidadConocida,
      porConciliar,
    })
    setCargandoTienda(false)
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
        body: JSON.stringify({ id: ventaId, costo_unitario: valor, conciliado_por: admin?.id || null }),
      })
      await cargarAnalisisTienda()
      setCostoDraft(prev => { const next = { ...prev }; delete next[ventaId]; return next })
    } finally {
      setGuardandoCosto(null)
    }
  }

  const cargarEstadoCuenta = async () => {
    setCargandoEC(true)
    const [pedidosRes, pagosRes] = await Promise.all([
      fetch(`/api/reportes/pedidos?entrega_id=${entregaSeleccionada}&fotos=no`).then(r => r.json()),
      fetch(`/api/reportes/pagos?entrega_id=${entregaSeleccionada}`).then(r => r.json()),
    ])
    const peds = (pedidosRes.ok ? pedidosRes.pedidos || [] : []).filter(p => p.estado !== 'no_llego')
    const pays = pagosRes.ok ? pagosRes.pagos || [] : []
    setRawPedidos(peds)
    setRawPagosEntrega(pays)

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
    setCargandoEC(false)
  }

  // ── Excel: exporta lo que se está viendo ──────────────────────────────────
  const exportarExcel = async () => {
    const ahora = new Date()
    const fechaStr = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`
    const wb = new ExcelJS.Workbook()
    const agregarHoja = (nombre, filas) => {
      const ws = wb.addWorksheet(nombre)
      filas.forEach(f => ws.addRow(f))
    }
    const filaPago = (p) => [
      p.clientes?.nombre || '(Tienda)',
      p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
      p.monto || 0, p.metodo || '', p.tipo || '', p.entrega_id || '',
    ]

    if (vista === 'entrega') {
      agregarHoja('Pedidos', [
        ['Cliente', 'Descripción', 'Cantidad', 'Precio USD', 'Tipo de cambio', 'Impuesto %', 'Costo MXN', 'Precio venta', 'Utilidad', 'Estado', 'Entrega', 'Fecha captura'],
        ...rawPedidos.filter(p => p.cliente_id).map(p => [
          p.clientes?.nombre || '', p.descripcion || '', p.cantidad || 1, p.precio_usd || '', p.tc || '',
          p.impuesto != null ? `${p.impuesto}%` : '', p.costo_mxn || 0, p.precio_venta || 0, p.utilidad || 0,
          p.estado || '', p.entregas?.fecha_entrega || '',
          p.creado_en ? new Date(p.creado_en).toLocaleDateString('es-MX') : '',
        ]),
      ])
      agregarHoja('Pagos', [['Cliente', 'Fecha', 'Monto', 'Método', 'Tipo', 'Entrega'], ...rawPagosEntrega.map(filaPago)])
      const m = metricasEC
      agregarHoja('Resumen', m ? [
        ['Concepto', 'Valor'],
        ['Venta total', m.ventaTotal || 0], ['Costo total', m.costoTotal || 0], ['Utilidad total', m.utilidadTotal || 0],
        ['Margen %', m.margen ? `${m.margen.toFixed(1)}%` : ''], ['Total cobrado', m.cobradoTotal || 0],
        ['Anticipos', m.totalAnticipos || 0], ['Por cobrar', m.pendiente || 0],
      ] : [['Sin datos cargados']])
    } else {
      agregarHoja('Pagos', [['Cliente', 'Fecha', 'Monto', 'Método', 'Tipo', 'Entrega'], ...rawPagosPeriodo.map(filaPago)])
      agregarHoja('Resumen clientes', [
        ['Cliente', 'Artículos', 'Método(s)', 'Total pagado'],
        ...resumenClientesEntregas.map(c => [c.nombre, c.numArticulos, c.metodos, c.totalPagado]),
      ])
      agregarHoja('Totales', [
        ['Concepto', 'Valor'],
        ['Total cobrado entregas', metricasDelDia.totalCobradoEntregas],
        ['Anticipos recibidos', metricasDelDia.totalAnticipos],
        ['Ventas tienda', metricasDelDia.totalTienda],
        ['Total del periodo', metricasDelDia.totalGeneral],
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

  const hayDatos = vista === 'entrega' ? (Boolean(metricasEC) && rawPedidos.length > 0) : rawPagosPeriodo.length > 0

  // ── Derivados ─────────────────────────────────────────────────────────────
  const g = general
  const pedidosTotal = g ? g.ingresos.entregas + g.ingresos.anticipos + (g.ingresos.envios || 0) : 0
  const retirosTotal = g ? g.retiros.reduce((s, r) => s + Number(r.monto || 0), 0) : 0
  const canceladosTotal = g ? g.cancelados.reduce((s, c) => s + Number(c.monto || 0), 0) : 0
  const hayAlertaControl = g && (Math.abs(g.cuadre.diferencia) > 0.5 || g.alertaCortes?.descuadrados > 0)

  const utilidadPorConciliarComoIngreso = analisisTienda.porConciliar.reduce((s, v) => s + v.precio_unitario * v.cantidad, 0)
  const utilidadMostrada = analisisTienda.utilidadConocida + (incluirPorConciliar ? utilidadPorConciliarComoIngreso : 0)

  const claveLista = `${rango}-${rangoDesde}-${rangoHasta}`

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Reportes</div>
            <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 3 }}>
              {vista === 'entrega' ? 'Una entrega completa: lo vendido, la utilidad y quién falta por pagar' : etiquetaPeriodo()}
            </div>
          </div>
          {hayDatos && (
            <button onClick={exportarExcel}
              style={{ padding: '9px 18px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--verde)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Exportar a Excel
            </button>
          )}
        </div>

        {/* Pestañas y periodo */}
        <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--w04)', border: '1px solid var(--w06)', borderRadius: 14, overflowX: 'auto', marginBottom: 10 }}>
          {VISTAS.map(([k, t]) => {
            const activa = vista === k
            const montoTab = k === 'tienda' ? (cargandoTienda ? 0 : analisisTienda.totalVendido) : k === 'pedidos' && g && !cargandoGeneral ? pedidosTotal : 0
            return (
              <button key={k} onClick={() => setVista(k)}
                style={{
                  flex: '1 0 auto', padding: '10px 16px', borderRadius: 10, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                  border: 'none', background: activa ? 'var(--sup)' : 'transparent',
                  boxShadow: activa ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  color: activa ? 'var(--tinta)' : 'var(--w50)', fontWeight: activa ? 800 : 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                {t}
                {montoTab > 0 && <span className="monto" style={{ fontSize: 12, fontWeight: 700, color: activa ? 'var(--w50)' : 'var(--w35)' }}>{fmt(montoTab)}</span>}
                {k === 'control' && hayAlertaControl && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--rojo)' }} />}
              </button>
            )
          })}
        </div>

        {/* Periodo (no aplica a "Por entrega") */}
        {vista !== 'entrega' && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
            {[['hoy', 'Hoy'], ['dia', 'Un día'], ['7', 'Últimos 7 días'], ['mes', 'Mes en curso'], ['rango', 'Entre fechas']].map(([v, t]) => (
              <button key={v} onClick={() => setRango(v)}
                style={{
                  padding: '7px 13px', borderRadius: 10, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${rango === v ? 'rgba(193,85,58,0.55)' : 'var(--w10)'}`,
                  background: rango === v ? 'rgba(193,85,58,0.14)' : 'transparent',
                  color: rango === v ? 'var(--marca-t)' : 'var(--w50)',
                  fontWeight: rango === v ? 700 : 500,
                }}>{t}</button>
            ))}
            {rango === 'dia' && <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={campoR} />}
            {rango === 'rango' && (
              <>
                <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={campoR} />
                <span style={{ color: 'var(--w50)', fontSize: 12 }}>a</span>
                <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} style={campoR} />
              </>
            )}
          </div>
        )}

        </div>

        {/* Error / carga de las vistas que dependen de "general" */}
        {['resumen', 'pedidos', 'control'].includes(vista) && (
          <>
            {cargandoGeneral && <div style={{ color: 'var(--w50)', textAlign: 'center', padding: 40 }}>Cargando…</div>}
            {!cargandoGeneral && errorGeneral && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 17 }}>🔴</span>
                <div>
                  <div style={{ color: 'var(--rojo-t)', fontSize: 13.5, fontWeight: 700 }}>El reporte no se pudo armar</div>
                  <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 4 }}>{errorGeneral}</div>
                  <div style={{ color: 'var(--w50)', fontSize: 12.5, marginTop: 6, maxWidth: '58ch' }}>
                    Se muestra el error en vez de una pantalla vacía a propósito: en una pantalla de control, media verdad es peor que ninguna.
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════ RESUMEN ═══════════════════ */}
        {vista === 'resumen' && !cargandoGeneral && g && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <CuadreCard g={g} compacto onVer={() => setVista('control')} />

            {/* Entró en el periodo */}
            <div style={tarjeta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                <div>
                  <div style={rotulo}>Entró en el periodo</div>
                  <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>Todo el dinero cobrado, tienda y pedidos juntos</div>
                </div>
                <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(g.total)}</div>
              </div>

              {/* Los dos negocios, lado a lado: tocar uno abre su vista */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, padding: '0 22px 20px' }}>
                <Pilar
                  tono="#0f8a63" titulo="Tienda" monto={g.ingresos.tienda} total={g.total}
                  lineas={[
                    `${g.tienda.articulos} ${g.tienda.articulos === 1 ? 'artículo' : 'artículos'}`,
                    g.tienda.ventaConCosto > 0 ? `utilidad ${fmt(g.tienda.utilidad)} (${((g.tienda.utilidad / g.tienda.ventaConCosto) * 100).toFixed(0)}%)` : 'utilidad sin calcular',
                  ]}
                  onClick={() => setVista('tienda')} />
                <Pilar
                  tono="#c1553a" titulo="Pedidos" monto={pedidosTotal} total={g.total}
                  lineas={[
                    `entregas ${fmt(g.ingresos.entregas)} · anticipos ${fmt(g.ingresos.anticipos)}`,
                    g.ingresos.envios > 0 ? `envíos ${fmt(g.ingresos.envios)}` : null,
                  ].filter(Boolean)}
                  onClick={() => setVista('pedidos')} />
              </div>

              <div style={{ padding: '18px 22px 20px', borderTop: '1px solid var(--w06)' }}>
                <Desglose titulo="Por método de cobro" total={g.total} partes={[
                  ['Efectivo', g.porMetodo.Efectivo],
                  ['Transferencia', g.porMetodo.Transferencia],
                  ['Terminal', g.porMetodo.Terminal],
                  ['Otro', g.porMetodo.Otro],
                ]} fmt={fmt} />
              </div>
            </div>

            <Senales g={g} fmt={fmt} onVer={() => setVista('control')} />
          </div>
        )}

        {/* ═══════════════════ TIENDA ═══════════════════ */}
        {vista === 'tienda' && (
          cargandoTienda ? <div style={{ color: 'var(--w50)', textAlign: 'center', padding: 40 }}>Cargando…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              <div style={tarjeta}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                  <div>
                    <div style={rotulo}>Vendido en tienda</div>
                    <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>
                      {analisisTienda.transacciones.length} {analisisTienda.transacciones.length === 1 ? 'venta' : 'ventas'} · {analisisTienda.totalArticulos} {analisisTienda.totalArticulos === 1 ? 'artículo' : 'artículos'}
                    </div>
                  </div>
                  <div className="monto" style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(analisisTienda.totalVendido)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--w06)' }}>
                  <Celda rotulo="Utilidad" valor={fmt(utilidadMostrada)} color="var(--verde)"
                    sub={analisisTienda.totalVendido > 0 ? `margen ${((utilidadMostrada / analisisTienda.totalVendido) * 100).toFixed(0)}%` : null}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--w55)', cursor: 'pointer', marginTop: 5 }}>
                      <input type="checkbox" checked={incluirPorConciliar} onChange={(e) => setIncluirPorConciliar(e.target.checked)} />
                      incluir por conciliar
                    </label>
                  </Celda>
                  <Celda rotulo="Ticket promedio"
                    valor={analisisTienda.transacciones.length ? fmt(analisisTienda.totalVendido / analisisTienda.transacciones.length) : '—'} />
                  <Celda rotulo="Artículos" valor={analisisTienda.totalArticulos} />
                  <Celda rotulo="Vendedor top" valor={analisisTienda.vendedorTop || '—'} chico
                    sub={analisisTienda.porVendedor[0] ? fmt(analisisTienda.porVendedor[0].total) : null} />
                </div>
              </div>

              {analisisTienda.transacciones.length === 0 && (
                <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w50)', fontSize: 13 }}>
                  No hubo ventas de tienda en este periodo
                </div>
              )}

              {/* Pendientes: lo que requiere acción, arriba */}
              {analisisTienda.restock.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 16, padding: '14px 18px' }}>
                  <div style={{ color: 'var(--rojo-t)', fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>⚠️ Por resurtir · quedan menos de 3</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {analisisTienda.restock.map((p, i) => (
                      <span key={i} style={{ border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20, padding: '4px 11px', fontSize: 12, color: 'var(--w70)' }}>
                        {p.nombre} <b style={{ color: 'var(--rojo-t)' }}>{p.stock}</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analisisTienda.porConciliar.length > 0 && (
                <PorConciliar filas={analisisTienda.porConciliar} costoDraft={costoDraft} setCostoDraft={setCostoDraft}
                  guardando={guardandoCosto} onGuardar={guardarCostoConciliacion} />
              )}

              {analisisTienda.topProductos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 18, alignItems: 'start' }}>
                  <Bloque titulo="Lo que más se vende" nota="por importe">
                    <Ranking tono="var(--verde)" limite={8} filas={analisisTienda.topProductos.map(p => ({
                      clave: p.nombre, etiqueta: p.nombre, sub: `${p.cantidad} ${p.cantidad === 1 ? 'pieza' : 'piezas'}${p.categoria ? ' · ' + p.categoria : ''}`,
                      valor: p.revenue, texto: fmt(p.revenue),
                    }))} />
                  </Bloque>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Bloque titulo="Por categoría" nota="por importe">
                      <Ranking tono="var(--ambar)" limite={6} filas={analisisTienda.porCategoria.map(c => ({
                        clave: c.categoria, etiqueta: c.categoria, sub: `${c.cantidad} ${c.cantidad === 1 ? 'pieza' : 'piezas'}`,
                        valor: c.revenue, texto: fmt(c.revenue),
                        pct: analisisTienda.totalVendido > 0 ? Math.round((c.revenue / analisisTienda.totalVendido) * 100) : null,
                      }))} />
                    </Bloque>
                    <Bloque titulo="Por vendedor">
                      <Ranking tono="var(--marca)" filas={analisisTienda.porVendedor.map(v => ({
                        clave: v.nombre, etiqueta: v.nombre, sub: `${v.articulos} ${v.articulos === 1 ? 'artículo' : 'artículos'}`,
                        valor: v.total, texto: fmt(v.total),
                      }))} />
                    </Bloque>
                  </div>
                </div>
              )}

              {analisisTienda.transacciones.length > 0 && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Tickets de venta</div>
                    <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 2 }}>{analisisTienda.transacciones.length} {analisisTienda.transacciones.length === 1 ? 'venta' : 'ventas'} en el mostrador, cada una con sus artículos y cómo se pagó</div>
                  </div>
                  <ListaTickets key={claveLista} tickets={analisisTienda.transacciones.map(ticketDeVentaTienda)} />
                </div>
              )}
            </div>
          )
        )}

        {/* ═══════════════════ PEDIDOS ═══════════════════ */}
        {vista === 'pedidos' && !cargandoGeneral && g && (
          <PedidosVista g={g} claveLista={claveLista} pedidosTotal={pedidosTotal} />
        )}

        {/* ═══════════════════ POR ENTREGA ═══════════════════ */}
        {vista === 'entrega' && (
          <div>
            <select value={entregaSeleccionada} onChange={e => { setEntregaSeleccionada(e.target.value); setFiltroCatReporte('') }}
              style={{ width: '100%', background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 12, padding: '12px 14px', color: 'var(--tinta)', fontSize: 14, fontWeight: 600, outline: 'none', marginBottom: 16 }}>
              <option value="">— Elige una entrega —</option>
              {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}{e.nota ? ` · ${e.nota}` : ''}</option>)}
            </select>

            {cargandoEC && <div style={{ color: 'var(--w50)', textAlign: 'center', padding: 40 }}>Cargando…</div>}

            {!cargandoEC && metricasEC && (
              <EntregaVista
                m={metricasEC} peds={rawPedidos} porCliente={porClienteEC}
                categorias={categoriasReporte} filtroCat={filtroCatReporte} setFiltroCat={setFiltroCatReporte} />
            )}

            {!entregaSeleccionada && !cargandoEC && (
              <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w50)', fontSize: 13 }}>
                Elige una entrega para ver sus números
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ CONTROL ═══════════════════ */}
        {vista === 'control' && !cargandoGeneral && g && <ControlVista g={g} />}

      </div>
    </div>
  )
}

// ═════════════════════════════ Piezas de la pantalla ═════════════════════════════

// Cuadre de efectivo. Compacto (Resumen) o completo (Control).
function CuadreCard({ g, compacto, onVer }) {
  const d = g.cuadre.diferencia
  const mal = Math.abs(d) > 0.5
  return (
    <div style={{ ...tarjeta, border: `1px solid ${mal ? 'rgba(var(--rojo-rgb),0.35)' : 'var(--verde-borde)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: compacto ? '16px 22px' : '20px 22px', flexWrap: 'wrap' }}>
        <div>
          <div style={rotulo}>Cuadre de efectivo</div>
          <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>
            El sistema esperaba {fmt(g.cuadre.esperado)} · se contaron {fmt(g.cuadre.contado)}
            {g.cuadre.cortes > 0 && ` · ${g.cuadre.cortes} ${g.cuadre.cortes === 1 ? 'corte' : 'cortes'}`}
          </div>
          {compacto && onVer && (
            <button onClick={onVer} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, color: 'var(--marca-t)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Ver detalle en Control →
            </button>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="monto" style={{
            color: d < -0.5 ? 'var(--rojo-t)' : d > 0.5 ? 'var(--ambar)' : 'var(--verde)',
            fontSize: compacto ? 30 : 34, fontWeight: 900, letterSpacing: -1.2, lineHeight: 1,
          }}>
            {d > 0 ? '+' : ''}{fmt(d)}
          </div>
          <div style={{ color: 'var(--w50)', fontSize: 11.5, marginTop: 4 }}>
            {d < -0.5 ? 'falta efectivo' : d > 0.5 ? 'sobra efectivo' : 'cuadra exacto'}
          </div>
        </div>
      </div>
      {compacto && g.alertaCortes?.descuadrados > 0 && (
        <button onClick={onVer} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', borderTop: '1px solid rgba(var(--rojo-rgb),0.25)', background: 'rgba(var(--rojo-rgb),0.08)', padding: '11px 22px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>🔴</span>
          <span style={{ color: 'var(--rojo-t)', fontSize: 12.5, fontWeight: 700 }}>
            {g.alertaCortes.descuadrados} {g.alertaCortes.descuadrados === 1 ? 'corte no cuadra' : 'cortes no cuadran'} contra lo registrado · {fmt(g.alertaCortes.monto)}
          </span>
          <span style={{ color: 'var(--rojo-t)', fontSize: 12, fontWeight: 700, marginLeft: 'auto' }}>Ver →</span>
        </button>
      )}
      {g.cuadre.sin_verificar > 0 && (
        <div style={{ padding: '10px 22px', borderTop: '1px solid var(--w07)', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ color: 'var(--ambar-t)', fontSize: 12, fontWeight: 600 }}>
            {g.cuadre.sin_verificar} {g.cuadre.sin_verificar === 1 ? 'corte se cerró' : 'cortes se cerraron'} sin poder calcular sus totales por método — revísalos a mano contra los pagos.
          </span>
        </div>
      )}
    </div>
  )
}

// Señales de control: avisos ámbar de una línea.
function Senales({ g, fmt, onVer }) {
  const items = [
    g.tienda.manuales > 0 && [`${g.tienda.manuales} ventas por monto libre`, fmt(g.tienda.montoManual)],
    g.tienda.lineasSinCosto > 0 && [`${g.tienda.lineasSinCosto} ventas sin costo`, fmt(g.tienda.ventaSinCosto)],
    g.cancelados.length > 0 && [`${g.cancelados.length} pagos cancelados`, fmt(g.cancelados.reduce((s, c) => s + Number(c.monto || 0), 0))],
    g.retiros.length > 0 && [`${g.retiros.length} ${g.retiros.length === 1 ? 'retiro' : 'retiros'} de caja`, fmt(g.retiros.reduce((s, r) => s + Number(r.monto || 0), 0))],
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map(([et, v], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--ambar-borde)', background: 'var(--ambar-suave)', borderRadius: 20, padding: '7px 14px' }}>
          <span style={{ color: 'var(--w55)', fontSize: 12 }}>{et}</span>
          <span className="monto" style={{ color: 'var(--ambar)', fontSize: 12.5, fontWeight: 800 }}>{v}</span>
        </div>
      ))}
      {onVer && (
        <button onClick={onVer} style={{ background: 'none', border: 'none', color: 'var(--marca-t)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Revisar en Control →
        </button>
      )}
    </div>
  )
}

// Tarjeta de un negocio dentro del Resumen. El color acompaña, no carga el dato.
function Pilar({ tono, titulo, monto, total, lineas, onClick }) {
  const pct = total > 0 ? Math.round((monto / total) * 100) : 0
  return (
    <button onClick={onClick}
      style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: 'var(--tinta)', fontSize: 13.5, fontWeight: 800 }}>{titulo}</span>
        <span style={{ color: 'var(--w50)', fontSize: 12 }}>{pct}% del total</span>
      </div>
      <div className="monto" style={{ color: 'var(--tinta)', fontSize: 26, fontWeight: 900, letterSpacing: -0.8, margin: '6px 0 10px' }}>{fmt(monto)}</div>
      <div style={{ height: 6, background: 'var(--w06)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${Math.max(pct, monto > 0 ? 2 : 0)}%`, height: '100%', background: tono, borderRadius: 3 }} />
      </div>
      {lineas.map((l, i) => <div key={i} style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 2 }}>{l}</div>)}
      <div style={{ color: 'var(--marca-t)', fontSize: 12.5, fontWeight: 700, marginTop: 'auto', paddingTop: 10 }}>Ver detalle →</div>
    </button>
  )
}

// Celda de cifra dentro de una tarjeta.
function Celda({ rotulo: r, valor, sub, color, chico, children }) {
  return (
    <div style={{ padding: '14px 18px', borderRight: '1px solid var(--w05)', borderBottom: '1px solid var(--w05)' }}>
      <div style={rotulo}>{r}</div>
      <div className="monto" style={{ color: color || 'var(--tinta)', fontSize: chico ? 15 : 20, fontWeight: 800, marginTop: chico ? 8 : 5, letterSpacing: -0.5 }}>{valor}</div>
      {sub && <div style={{ color: 'var(--w50)', fontSize: 11.5, marginTop: 3 }}>{sub}</div>}
      {children}
    </div>
  )
}

// Bloque con título para agrupar un listado.
function Bloque({ titulo, nota, children }) {
  return (
    <div style={tarjeta}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--w06)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ color: 'var(--tinta)', fontSize: 13.5, fontWeight: 800 }}>{titulo}</span>
        {nota && <span style={{ color: 'var(--w50)', fontSize: 11.5 }}>{nota}</span>}
      </div>
      <div style={{ padding: '6px 18px 10px' }}>{children}</div>
    </div>
  )
}

// Listado con barra de magnitud: orden + longitud + cifra. Un solo tono por
// listado; el nombre y la cifra cargan el dato, la barra solo compara.
function Ranking({ filas, tono = 'var(--marca)', limite = 0, extraTitulo }) {
  const [todos, setTodos] = useState(false)
  if (!filas.length) return <div style={{ color: 'var(--w50)', fontSize: 12, padding: '14px 0' }}>Sin datos</div>
  const visibles = limite && !todos ? filas.slice(0, limite) : filas
  const mayor = Math.max(...filas.map(f => Math.abs(f.valor)), 1)
  return (
    <div>
      {visibles.map((f, i) => (
        <div key={f.clave + i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--w04)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: 'var(--w50)', fontSize: 12, width: 16, flexShrink: 0, fontWeight: 700, paddingTop: 2 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.etiqueta}</div>
              {f.sub && <div style={{ color: 'var(--w50)', fontSize: 11.5, marginTop: 2 }}>{f.sub}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="monto" style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 800 }}>{f.texto}</div>
              {f.pct != null && <div style={{ color: 'var(--w50)', fontSize: 11.5, marginTop: 2 }}>{f.pct}%</div>}
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--w06)', borderRadius: 2, overflow: 'hidden', marginTop: 7, marginLeft: 26 }}>
            <div style={{ width: `${Math.max(2, (Math.abs(f.valor) / mayor) * 100)}%`, height: '100%', background: tono, opacity: 0.6, borderRadius: 2 }} />
          </div>
        </div>
      ))}
      {limite > 0 && filas.length > limite && (
        <button onClick={() => setTodos(t => !t)}
          style={{ width: '100%', marginTop: 6, padding: '8px', background: 'none', border: 'none', borderTop: '1px solid var(--w05)', color: 'var(--marca-t)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {todos ? 'Ver menos' : `Ver los ${filas.length}`}
        </button>
      )}
    </div>
  )
}

// Columnas en orden cronológico: para ver cómo se repartió la venta en el tiempo.
function Columnas({ datos }) {
  if (!datos.length) return <div style={{ color: 'var(--w50)', fontSize: 12, padding: '14px 0' }}>Sin datos</div>
  const mayor = Math.max(...datos.map(d => d.valor), 1)
  const corto = (n) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : fmt(n)
  const alto = 120
  return (
    <div style={{ overflowX: 'auto', padding: '10px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minWidth: datos.length * 52 }}>
        {datos.map(d => (
          <div key={d.clave} title={`${d.etiqueta}: ${d.texto} · ${d.sub}`} style={{ flex: 1, minWidth: 44, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="monto" style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{corto(d.valor)}</div>
            <div style={{ width: '100%', maxWidth: 46, height: Math.max(4, (d.valor / mayor) * alto), background: 'var(--ambar)', opacity: 0.65, borderRadius: '5px 5px 2px 2px' }} />
            <div style={{ color: 'var(--w55)', fontSize: 11.5, marginTop: 7, whiteSpace: 'nowrap' }}>{d.etiqueta}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Ventas por conciliar: ventas sin costo conocido. Pueden ser muchas; se
// muestran de 5 en 5 para que no tapen el resto de la pantalla.
function PorConciliar({ filas, costoDraft, setCostoDraft, guardando, onGuardar }) {
  const [abierto, setAbierto] = useState(false)
  const [todas, setTodas] = useState(false)
  const visibles = todas ? filas : filas.slice(0, 5)
  return (
    <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 16, overflow: 'hidden' }}>
      <button onClick={() => setAbierto(a => !a)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--ambar)', fontSize: 13.5, fontWeight: 800 }}>⚠ {filas.length} {filas.length === 1 ? 'venta' : 'ventas'} sin costo por conciliar</div>
          <div style={{ color: 'var(--w55)', fontSize: 12, marginTop: 3 }}>Captura el costo real para que la utilidad quede exacta.</div>
        </div>
        <span style={{ color: 'var(--ambar)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{abierto ? 'Ocultar' : 'Capturar costos'}</span>
      </button>
      {abierto && (
        <div style={{ padding: '0 18px 14px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--w10)' }}>
                <th style={{ ...th, padding: '8px' }}>Artículo</th>
                <th style={{ ...th, padding: '8px', textAlign: 'center' }}>Cant.</th>
                <th style={{ ...th, padding: '8px', textAlign: 'right' }}>Precio</th>
                <th style={{ ...th, padding: '8px', textAlign: 'right' }}>Costo unitario</th>
                <th style={{ ...th, padding: '8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--w05)' }}>
                  <td style={{ padding: '8px', color: 'var(--tinta)' }}>{v.nombre_producto}</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: 'var(--w70)' }}>{v.cantidad}</td>
                  <td className="monto" style={{ padding: '8px', textAlign: 'right', color: 'var(--w70)' }}>${Number(v.precio_unitario).toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <input type="number" step="0.01" placeholder="0.00" value={costoDraft[v.id] ?? ''}
                      onChange={(e) => setCostoDraft(prev => ({ ...prev, [v.id]: e.target.value }))}
                      style={{ width: 90, background: 'var(--w05)', border: '1px solid var(--w15)', borderRadius: 8, padding: '6px 8px', color: 'var(--tinta)', fontSize: 12, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button type="button" disabled={!costoDraft[v.id] || guardando === v.id} onClick={() => onGuardar(v.id)}
                      style={{ background: 'rgba(52,211,153,0.15)', color: 'var(--verde)', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: costoDraft[v.id] ? 'pointer' : 'not-allowed', opacity: costoDraft[v.id] ? 1 : 0.5 }}>
                      {guardando === v.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > 5 && (
            <button onClick={() => setTodas(t => !t)}
              style={{ width: '100%', marginTop: 8, padding: 8, background: 'none', border: 'none', color: 'var(--marca-t)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {todas ? 'Ver menos' : `Ver las ${filas.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tickets ─────────────────────────────────────────────────────────────────
// Un ticket = una transacción, como el recibo del mostrador: qué fue, quién,
// qué se llevó, cuánto se cobró y con qué. Todo visible, sin abrir nada.
const C_TIENDA = '#0f8a63'
const C_ENCARGO = '#c1553a'
const C_ANTICIPO = '#2563eb'
const C_GRIS = '#8a8178'

const ticketDeVentaTienda = (t) => ({
  clave: t.pago_id,
  fecha: t.creado_en,
  acento: C_TIENDA,
  etiqueta: 'Tienda',
  titulo: 'Venta en mostrador',
  quien: t.vendedor ? `Atendió ${t.vendedor}` : '',
  grupos: [{
    nombre: 'Artículos',
    items: t.articulos.map(a => ({ txt: `${a.cantidad > 1 ? a.cantidad + '× ' : ''}${a.nombre}`, importe: a.cantidad * a.precio })),
  }],
  total: t.total,
  pagos: [[t.metodo, String(t.metodo).includes('+') ? null : t.total]],
})

const ticketDeVisita = (v, i) => {
  let etiqueta, acento
  if (v.sinCobro) { etiqueta = 'Ya estaba pagado'; acento = C_GRIS }
  else if (v.entregas > 0 && v.tienda > 0) { etiqueta = 'Encargo + tienda'; acento = C_ENCARGO }
  else if (v.entregas > 0) { etiqueta = 'Entrega de encargo'; acento = C_ENCARGO }
  else if (v.anticipos > 0 && !(v.tienda > 0)) { etiqueta = 'Anticipo'; acento = C_ANTICIPO }
  else if (v.tienda > 0) { etiqueta = 'Tienda'; acento = C_TIENDA }
  else { etiqueta = 'Otro cobro'; acento = C_GRIS }

  const grupos = []
  const recogio = v.recogio || []
  // Solo si de verdad recogió o se le cobró el encargo: en una visita de puro
  // anticipo, la lista de lo entregado en esa entrega sería engañosa.
  if (recogio.length && (v.sinCobro || v.entregas > 0)) {
    grupos.push({
      nombre: 'Se llevó de su encargo',
      nota: v.sinCobro ? `valor ${fmt(v.valorRecogido)}` : null,
      items: recogio.map(a => ({ txt: `${a.cantidad > 1 ? a.cantidad + '× ' : ''}${a.descripcion}`, importe: a.precio })),
    })
  } else if (v.entregas > 0) {
    grupos.push({ nombre: 'Encargo', items: [{ txt: 'Cobro de su encargo', importe: v.entregas }] })
  }
  if (v.articulos?.length) {
    grupos.push({
      nombre: 'Compró en tienda',
      items: v.articulos.map(a => ({ txt: `${a.cantidad > 1 ? a.cantidad + '× ' : ''}${a.nombre}`, importe: a.importe, aviso: a.manual ? 'monto libre' : null })),
    })
  }
  if (v.anticipos > 0) grupos.push({ nombre: 'Anticipo', items: [{ txt: 'Abono a su cuenta', importe: v.anticipos }] })

  const sumaRecogio = recogio.reduce((s, a) => s + Number(a.precio || 0), 0)
  return {
    clave: `${v.cliente_id || 'x'}-${v.desde}-${i}`,
    fecha: v.desde,
    acento, etiqueta,
    titulo: v.nombre,
    quien: '',
    grupos,
    cobros: [['Encargo', v.entregas], ['Tienda', v.tienda], ['Anticipo', v.anticipos], ['Otros', v.otros]].filter(([, m]) => m > 0),
    total: v.total,
    pagos: Object.entries(v.metodos || {}),
    sinCobro: !!v.sinCobro,
    nota: !v.sinCobro && v.entregas > 0 && sumaRecogio > v.entregas + 0.5
      ? `Lo recogido vale ${fmt(sumaRecogio)}; el resto ya estaba abonado de antes.`
      : null,
  }
}

function Ticket({ t }) {
  const [abiertos, setAbiertos] = useState({})
  const LIM = 4
  return (
    <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderTop: `4px solid ${t.acento}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 2px rgba(42,33,24,0.04)' }}>

      {/* Qué fue, cuándo, quién */}
      <div style={{ padding: '12px 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ background: `${t.acento}1f`, color: t.acento, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 6 }}>{t.etiqueta}</span>
          <span style={{ color: 'var(--w60)', fontSize: 12.5, fontWeight: 600 }}>{hora(t.fecha)}</span>
        </div>
        <div style={{ color: 'var(--tinta)', fontSize: 16.5, fontWeight: 800, marginTop: 10, letterSpacing: -0.2, lineHeight: 1.25 }}>{t.titulo}</div>
        {t.quien && <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 3 }}>{t.quien}</div>}
      </div>

      {/* Qué se llevó */}
      {t.grupos.length > 0 && (
        <div style={{ borderTop: '1px dashed var(--w18)', padding: '11px 16px 10px' }}>
          {t.grupos.map((g, gi) => {
            const todos = abiertos[gi]
            const vis = todos ? g.items : g.items.slice(0, LIM)
            return (
              <div key={gi} style={{ marginTop: gi ? 12 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--w50)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 }}>
                  <span>{g.nombre}</span>
                  {g.nota && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{g.nota}</span>}
                </div>
                {vis.map((it, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '3px 0' }}>
                    <span style={{ color: 'var(--w80)', fontSize: 13, lineHeight: 1.35, minWidth: 0 }}>
                      {it.txt}
                      {it.aviso && <span style={{ color: 'var(--ambar)', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>{it.aviso}</span>}
                    </span>
                    <span className="monto" style={{ color: 'var(--w60)', fontSize: 13, flexShrink: 0 }}>{fmt(it.importe)}</span>
                  </div>
                ))}
                {g.items.length > LIM && (
                  <button onClick={() => setAbiertos(a => ({ ...a, [gi]: !a[gi] }))}
                    style={{ background: 'none', border: 'none', padding: '4px 0 0', color: 'var(--marca-t)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {todos ? 'Ver menos' : `+ ${g.items.length - LIM} más`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Cuánto se cobró y con qué */}
      <div style={{ borderTop: '1px dashed var(--w18)', padding: '11px 16px 14px', marginTop: 'auto', background: 'var(--w02)' }}>
        {t.cobros?.length > 1 && t.cobros.map(([et, m]) => (
          <div key={et} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w55)', fontSize: 12.5, padding: '1px 0' }}>
            <span>{et}</span><span className="monto">{fmt(m)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: t.cobros?.length > 1 ? 6 : 0 }}>
          <span style={{ color: 'var(--w60)', fontSize: 12.5, fontWeight: 700 }}>{t.sinCobro ? 'Cobrado' : 'Total cobrado'}</span>
          <span className="monto" style={{ color: t.sinCobro ? 'var(--w50)' : 'var(--tinta)', fontSize: 21, fontWeight: 900, letterSpacing: -0.6 }}>{fmt(t.total)}</span>
        </div>
        {t.sinCobro ? (
          <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>No se cobró nada: ya estaba pagado antes de este periodo.</div>
        ) : t.pagos?.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {t.pagos.map(([m, monto]) => (
              <span key={m} style={{ border: '1px solid var(--w12)', background: 'var(--sup)', borderRadius: 20, padding: '3px 10px', fontSize: 12, color: 'var(--w60)', fontWeight: 600 }}>
                {m}{monto != null && <b className="monto" style={{ color: 'var(--tinta)', marginLeft: 6 }}>{fmt(monto)}</b>}
              </span>
            ))}
          </div>
        )}
        {t.nota && <div style={{ color: 'var(--w55)', fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>{t.nota}</div>}
      </div>
    </div>
  )
}

// Los tickets, agrupados por día cuando el periodo abarca varios.
function ListaTickets({ tickets }) {
  const [visibles, setVisibles] = useState(24)
  if (!tickets.length) {
    return <div style={{ ...tarjeta, padding: 24, textAlign: 'center', color: 'var(--w50)', fontSize: 13 }}>Nada en este segmento durante el periodo</div>
  }
  const dia = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const dias = [...new Set(tickets.map(t => dia(t.fecha)))]
  const variosDias = dias.length > 1
  const totalDia = {}
  const cuentaDia = {}
  tickets.forEach(t => { const d = dia(t.fecha); totalDia[d] = (totalDia[d] || 0) + Number(t.total || 0); cuentaDia[d] = (cuentaDia[d] || 0) + 1 })

  const grupos = []
  tickets.slice(0, visibles).forEach(t => {
    const d = dia(t.fecha)
    let g = grupos[grupos.length - 1]
    if (!g || g.dia !== d) { g = { dia: d, items: [] }; grupos.push(g) }
    g.items.push(t)
  })
  const larga = (d) => {
    const x = new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    return (d === hoyStr ? 'Hoy · ' : '') + x.charAt(0).toUpperCase() + x.slice(1)
  }

  return (
    <div>
      {grupos.map(g => (
        <div key={g.dia} style={{ marginBottom: 22 }}>
          {variosDias && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '0 2px 9px', marginBottom: 12, borderBottom: '1px solid var(--w08)' }}>
              <span style={{ color: 'var(--tinta)', fontSize: 14.5, fontWeight: 800 }}>{larga(g.dia)}</span>
              <span style={{ color: 'var(--w55)', fontSize: 12.5 }}>
                {cuentaDia[g.dia]} {cuentaDia[g.dia] === 1 ? 'ticket' : 'tickets'} · <b className="monto" style={{ color: 'var(--tinta)' }}>{fmt(totalDia[g.dia])}</b>
              </span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {g.items.map(t => <Ticket key={t.clave} t={t} />)}
          </div>
        </div>
      ))}
      {tickets.length > visibles && (
        <button onClick={() => setVisibles(n => n + 24)}
          style={{ width: '100%', padding: 12, borderRadius: 11, cursor: 'pointer', border: '1px solid var(--w10)', background: 'var(--sup)', color: 'var(--marca-t)', fontSize: 13, fontWeight: 700 }}>
          Ver 24 más · quedan {tickets.length - visibles}
        </button>
      )}
    </div>
  )
}

// ── Control ─────────────────────────────────────────────────────────────────
// Responde: ¿hay algo raro? Primero el estado general, luego el detalle:
// cortes de caja, personas, y el dinero que salió (retiros y cancelaciones).
function ControlVista({ g }) {
  const [seg, setSeg] = useState(null)
  const [visibles, setVisibles] = useState(12)

  const cortes = g.cuadreCortes || []
  const malos = cortes.filter(c => c.conciliable && Math.abs(c.descuadre) > 0.5)
  const buenos = cortes.filter(c => c.conciliable && Math.abs(c.descuadre) <= 0.5)
  const sinPeriodo = cortes.filter(c => !c.conciliable)
  const activo = seg ?? (malos.length ? 'mal' : 'todos')
  const lista = activo === 'mal' ? malos : activo === 'bien' ? buenos : cortes

  const d = g.cuadre.diferencia
  const retirosTotal = g.retiros.reduce((s, r) => s + Number(r.monto || 0), 0)
  const canceladosTotal = g.cancelados.reduce((s, c) => s + Number(c.monto || 0), 0)
  const personasMonto = g.control.filter(c => c.pctManual >= 20)

  // Lo que sí hay que mirar. Los retiros son operación normal: no cuentan.
  const pendientes = [
    Math.abs(d) > 0.5 && 'el efectivo no cuadra',
    malos.length > 0 && `${malos.length} ${malos.length === 1 ? 'corte descuadrado' : 'cortes descuadrados'}`,
    g.cancelados.length > 0 && `${g.cancelados.length} ${g.cancelados.length === 1 ? 'pago cancelado' : 'pagos cancelados'}`,
    personasMonto.length > 0 && `monto libre alto (${personasMonto.map(c => c.nombre.split(' ')[0]).join(', ')})`,
  ].filter(Boolean)
  const enOrden = pendientes.length === 0

  const colorDif = (v) => v < -0.5 ? 'var(--rojo-t)' : v > 0.5 ? 'var(--ambar)' : 'var(--verde)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Estado general */}
      <div style={{ ...tarjeta, border: `1px solid ${enOrden ? 'var(--verde-borde)' : 'rgba(var(--rojo-rgb),0.3)'}` }}>
        <div style={{ padding: '18px 22px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{enOrden ? '✅' : '🔴'}</span>
          <div>
            <div style={{ color: enOrden ? 'var(--verde)' : 'var(--rojo-t)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>
              {enOrden ? 'Todo en orden en este periodo' : 'Hay cosas por revisar'}
            </div>
            <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 3 }}>
              {enOrden ? 'El efectivo cuadra y no hay cortes descuadrados ni pagos cancelados.' : `Revisa: ${pendientes.join(' · ')}.`}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--w06)' }}>
          <Celda rotulo="Cuadre de efectivo" valor={`${d > 0 ? '+' : ''}${fmt(d)}`} color={colorDif(d)}
            sub={`esperado ${fmt(g.cuadre.esperado)} · contado ${fmt(g.cuadre.contado)}`} />
          <Celda rotulo="Cortes que no cuadran" valor={`${malos.length} de ${malos.length + buenos.length}`}
            color={malos.length ? 'var(--rojo-t)' : 'var(--verde)'} sub={malos.length ? fmt(g.alertaCortes?.monto) : 'todos coinciden'} />
          <Celda rotulo="Pagos cancelados" valor={fmt(canceladosTotal)} color={g.cancelados.length ? 'var(--rojo-t)' : undefined}
            sub={`${g.cancelados.length} en el periodo`} />
          <Celda rotulo="Retiros de caja" valor={fmt(retirosTotal)} sub={`${g.retiros.length} en el periodo`} />
          <Celda rotulo="Ventas por monto libre" valor={fmt(g.tienda.montoManual)} sub={`${g.tienda.manuales} ${g.tienda.manuales === 1 ? 'venta' : 'ventas'} sin producto del catálogo`} />
        </div>
        {g.cuadre.sin_verificar > 0 && (
          <div style={{ padding: '10px 22px', borderTop: '1px solid var(--w07)', background: 'rgba(245,158,11,0.08)', color: 'var(--ambar-t)', fontSize: 12.5, fontWeight: 600 }}>
            ⚠️ {g.cuadre.sin_verificar} {g.cuadre.sin_verificar === 1 ? 'corte se cerró' : 'cortes se cerraron'} sin poder calcular sus totales por método — revísalos a mano contra los pagos.
          </div>
        )}
      </div>

      {/* Cortes de caja */}
      {cortes.length > 0 && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Cortes de caja</div>
            <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 2, maxWidth: 640, lineHeight: 1.45 }}>
              Compara lo que la persona anotó al cerrar contra lo que sigue registrado en ese mismo periodo. Si no coinciden, hay que revisar qué pasó.
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {[['mal', 'No cuadran', malos.length], ['bien', 'Cuadran', buenos.length], ['todos', 'Todos', cortes.length]].map(([k, t, n]) => {
              const act = activo === k
              const rojo = k === 'mal' && n > 0
              return (
                <button key={k} onClick={() => { setSeg(k); setVisibles(12) }}
                  style={{ cursor: 'pointer', border: `1px solid ${act ? (rojo ? 'var(--rojo)' : 'var(--marca)') : 'var(--w10)'}`, background: act ? (rojo ? 'rgba(var(--rojo-rgb),0.1)' : 'rgba(193,85,58,0.1)') : 'var(--w03)', color: act ? (rojo ? 'var(--rojo-t)' : 'var(--marca-t)') : 'var(--w55)', borderRadius: 20, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, display: 'flex', gap: 6 }}>
                  {t}<span style={{ fontWeight: 800 }}>{n}</span>
                </button>
              )
            })}
          </div>

          {lista.length === 0 ? (
            <div style={{ ...tarjeta, padding: 28, textAlign: 'center', color: 'var(--w55)', fontSize: 13 }}>
              {activo === 'mal' ? '✅ Ningún corte descuadrado en este periodo' : 'Nada en este grupo'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
              {lista.slice(0, visibles).map(c => <CorteCard key={c.id} c={c} />)}
            </div>
          )}
          {lista.length > visibles && (
            <button onClick={() => setVisibles(n => n + 12)}
              style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 11, cursor: 'pointer', border: '1px solid var(--w10)', background: 'var(--sup)', color: 'var(--marca-t)', fontSize: 13, fontWeight: 700 }}>
              Ver 12 más · quedan {lista.length - visibles}
            </button>
          )}
          {sinPeriodo.length > 0 && activo !== 'mal' && activo !== 'bien' && (
            <div style={{ color: 'var(--w50)', fontSize: 12.5, marginTop: 10 }}>
              {sinPeriodo.length} {sinPeriodo.length === 1 ? 'corte no se puede' : 'cortes no se pueden'} comparar porque no guardaron el periodo que cubren.
            </div>
          )}
        </div>
      )}

      {/* Por colaborador */}
      {g.control.length > 0 && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Por colaborador</div>
            <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 2, maxWidth: 680, lineHeight: 1.45 }}>
              Un faltante aislado casi siempre es error de captura; lo que importa es el patrón: la misma persona cerrando corto una y otra vez.
              "Monto libre" son ventas tecleadas sin producto del catálogo; arriba del 20% de lo que vende alguien, conviene revisar.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
            {g.control.map(c => {
              const colorManual = c.pctManual >= 20 ? 'var(--rojo-t)' : c.pctManual >= 10 ? 'var(--ambar)' : 'var(--tinta)'
              return (
                <div key={c.id} style={{ ...tarjeta, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 19, background: 'var(--w06)', color: 'var(--tinta)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                      {String(c.nombre || '?').charAt(0).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--tinta)', fontSize: 14.5, fontWeight: 800, lineHeight: 1.25 }}>{c.nombre}</div>
                      <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 2 }}>{c.cortes ? `${c.cortes} ${c.cortes === 1 ? 'corte' : 'cortes'} de caja` : 'sin cortes en el periodo'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                    <Dato rotulo="Vendió" valor={fmt(c.montoVendido)} />
                    <Dato rotulo="Diferencia acumulada" valor={c.cortes ? `${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia)}` : '—'} color={c.cortes ? colorDif(c.diferencia) : undefined} />
                    <Dato rotulo="Monto libre" valor={c.manuales > 0 ? fmt(c.montoManual) : '—'} color={c.manuales > 0 ? colorManual : undefined}
                      sub={c.manuales > 0 ? `${c.pctManual}% de lo que vendió` : null} />
                    <Dato rotulo="Peor corte" valor={c.peorDiferencia ? fmt(c.peorDiferencia) : '—'} />
                    {c.montoDescuento > 0 && <Dato rotulo="Descuentos" valor={fmt(c.montoDescuento)} color="var(--ambar)" />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dinero que salió */}
      {(g.retiros.length > 0 || g.cancelados.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
          {g.retiros.length > 0 && (
            <Bloque titulo="Retiros de caja" nota={`${g.retiros.length} · ${fmt(retirosTotal)}`}>
              {g.retiros.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--w05)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--tinta)', fontSize: 13.5, fontWeight: 700 }}>{r.motivo || 'Sin motivo'}</div>
                    <div style={{ color: r.admin_id ? 'var(--w55)' : 'var(--rojo-t)', fontSize: 12.5, marginTop: 2 }}>
                      {r.admin_id ? r.quien : 'sin responsable registrado'} · {diaCorto(r.creado_en)}
                    </div>
                  </div>
                  <span className="monto" style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{fmt(r.monto)}</span>
                </div>
              ))}
            </Bloque>
          )}
          {g.cancelados.length > 0 && (
            <Bloque titulo="Pagos cancelados" nota={`${g.cancelados.length} · ${fmt(canceladosTotal)}`}>
              {g.cancelados.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--w05)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--tinta)', fontSize: 13.5, fontWeight: 700 }}>{c.cliente && c.cliente !== '—' ? c.cliente : 'Venta sin cliente'}</div>
                    <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 2 }}>{c.cancelado_motivo} · {c.quien}</div>
                  </div>
                  <span className="monto" style={{ color: 'var(--rojo-t)', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{fmt(c.monto)}</span>
                </div>
              ))}
            </Bloque>
          )}
        </div>
      )}
    </div>
  )
}

// Un corte de caja como ticket: quién, cuándo, y si coincide o no.
function CorteCard({ c }) {
  const cuando = `${diaCorto(c.creado_en)} · ${hora(c.creado_en)}`
  if (!c.conciliable) {
    return (
      <div style={{ ...tarjeta, borderTop: `4px solid ${C_GRIS}`, padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ background: `${C_GRIS}1f`, color: C_GRIS, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 6 }}>Sin comparar</span>
          <span style={{ color: 'var(--w60)', fontSize: 12.5, fontWeight: 600 }}>{cuando}</span>
        </div>
        <div style={{ color: 'var(--tinta)', fontSize: 15.5, fontWeight: 800, marginTop: 10 }}>{c.quien}</div>
        <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6, lineHeight: 1.4 }}>{c.motivo || 'No se puede comparar este corte.'}</div>
      </div>
    )
  }
  const mal = Math.abs(c.descuadre) > 0.5
  const acento = mal ? '#c0392b' : C_TIENDA
  return (
    <div style={{ ...tarjeta, borderTop: `4px solid ${acento}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ background: `${acento}1f`, color: acento, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', padding: '3px 9px', borderRadius: 6 }}>{mal ? 'No cuadra' : 'Cuadra'}</span>
          <span style={{ color: 'var(--w60)', fontSize: 12.5, fontWeight: 600 }}>{cuando}</span>
        </div>
        <div style={{ color: 'var(--tinta)', fontSize: 15.5, fontWeight: 800, marginTop: 10, lineHeight: 1.25 }}>{c.quien}</div>
      </div>

      {mal ? (
        <>
          <div style={{ borderTop: '1px dashed var(--w18)', padding: '10px 16px' }}>
            {c.metodos.filter(m => Math.abs(m.diferencia) > 0.5).map(m => (
              <div key={m.metodo} style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--tinta)', fontWeight: 700 }}>{m.metodo}</span>
                  <span className="monto" style={{ color: 'var(--rojo-t)', fontWeight: 800 }}>{m.diferencia > 0 ? '+' : ''}{fmt(m.diferencia)}</span>
                </div>
                <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 1 }}>
                  El corte anotó <b className="monto">{fmt(m.anoto)}</b> · hay registrado <b className="monto">{fmt(m.hay)}</b>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px dashed var(--w18)', padding: '11px 16px 13px', background: 'rgba(var(--rojo-rgb),0.06)', marginTop: 'auto' }}>
            <div className="monto" style={{ color: 'var(--rojo-t)', fontSize: 19, fontWeight: 900, letterSpacing: -0.4 }}>
              {c.descuadre > 0 ? `Faltan ${fmt(c.descuadre)}` : `Sobran ${fmt(-c.descuadre)}`}
            </div>
            <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 2, lineHeight: 1.4 }}>
              {c.descuadre > 0 ? 'El corte contó más de lo que hay registrado.' : 'Hay más registrado de lo que el corte contó.'}
            </div>
          </div>
        </>
      ) : (
        <div style={{ borderTop: '1px dashed var(--w18)', padding: '10px 16px 12px', background: 'var(--w02)', color: 'var(--w55)', fontSize: 12.5, marginTop: 'auto' }}>
          Lo que anotó el corte coincide con lo registrado.
        </div>
      )}
    </div>
  )
}

// Un dato suelto: rótulo chico arriba, cifra abajo.
function Dato({ rotulo: r, valor, sub, color }) {
  return (
    <div>
      <div style={{ color: 'var(--w50)', fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{r}</div>
      <div className="monto" style={{ color: color || 'var(--tinta)', fontSize: 17, fontWeight: 800, marginTop: 3, letterSpacing: -0.3 }}>{valor}</div>
      {sub && <div style={{ color: 'var(--w55)', fontSize: 11.5, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

// ── Pedidos: lo que entró por encargos y anticipos ───────────────────────────
// Una visita = lo que pasó con una persona en un momento. En la base son varios
// renglones sueltos; aquí vuelve a ser una sola transacción, como en el mostrador.
function PedidosVista({ g, claveLista, pedidosTotal }) {
  const [seg, setSeg] = useState('todas')
  const esPedido = (v) => v.entregas > 0 || v.anticipos > 0 || v.sinCobro || (v.recogio && v.recogio.length > 0)
  const delSeg = (v, s) => {
    if (s === 'recogieron') return v.entregas > 0 || v.sinCobro || (v.recogio && v.recogio.length > 0)
    if (s === 'anticipos') return v.anticipos > 0
    if (s === 'pagado') return v.sinCobro
    return true
  }
  const pedidos = (g.visitas || []).filter(esPedido)
  const SEGS = [['todas', 'Todas'], ['recogieron', 'Recogieron su encargo'], ['anticipos', 'Anticipos'], ['pagado', 'Ya estaba pagado']]
  const filtradas = pedidos.filter(v => delSeg(v, seg))
  const valorYaPagado = pedidos.filter(v => v.sinCobro).reduce((s, v) => s + Number(v.valorRecogido || 0), 0)
  const clientesRecogieron = pedidos.filter(v => delSeg(v, 'recogieron')).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
          <div>
            <div style={rotulo}>Cobrado por pedidos</div>
            <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>Entregas + anticipos{g.ingresos.envios > 0 ? ' + envíos' : ''}</div>
          </div>
          <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(pedidosTotal)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--w06)' }}>
          <Celda rotulo="Entregas cobradas" valor={fmt(g.ingresos.entregas)} sub={`${clientesRecogieron} ${clientesRecogieron === 1 ? 'visita' : 'visitas'} a recoger`} />
          <Celda rotulo="Anticipos" valor={fmt(g.ingresos.anticipos)} />
          {g.ingresos.envios > 0 && <Celda rotulo="Envíos" valor={fmt(g.ingresos.envios)} />}
          <Celda rotulo="Ya estaba pagado" valor={fmt(valorYaPagado)} sub="mercancía entregada sin cobro" />
        </div>
      </div>

      {pedidos.length === 0 ? (
        <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w50)', fontSize: 13 }}>
          No hubo entregas ni anticipos en este periodo
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {SEGS.map(([k, t]) => {
              const activo = seg === k
              const n = pedidos.filter(v => delSeg(v, k)).length
              return (
                <button key={k} onClick={() => setSeg(k)}
                  style={{ cursor: 'pointer', border: `1px solid ${activo ? 'var(--marca)' : 'var(--w10)'}`, background: activo ? 'rgba(193,85,58,0.1)' : 'var(--w03)', color: activo ? 'var(--marca-t)' : 'var(--w45)', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t}<span style={{ color: activo ? 'var(--marca-t)' : 'var(--w30)', fontWeight: 800 }}>{n}</span>
                </button>
              )
            })}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Tickets de pedidos</div>
            <div style={{ color: 'var(--w55)', fontSize: 13, marginTop: 2 }}>{filtradas.length} {filtradas.length === 1 ? 'ticket' : 'tickets'} · cada uno muestra qué se llevó la persona y cuánto pagó</div>
          </div>
          <ListaTickets key={`${claveLista}-${seg}`} tickets={filtradas.map(ticketDeVisita)} />
        </div>
      )}
    </div>
  )
}

// ── Por entrega ──────────────────────────────────────────────────────────────
function EntregaVista({ m, peds, porCliente, categorias, filtroCat, setFiltroCat }) {
  const [segCliente, setSegCliente] = useState('todos')
  const [todosClientes, setTodosClientes] = useState(false)
  const [buscar, setBuscar] = useState('')

  const agrupar = (campo, vacio) => {
    const acc = {}
    peds.forEach(p => {
      const k = p[campo] || vacio
      if (!acc[k]) acc[k] = { venta: 0, utilidad: 0, count: 0 }
      acc[k].venta += p.precio_venta || 0
      acc[k].utilidad += p.utilidad || 0
      acc[k].count++
    })
    return Object.entries(acc)
  }
  const filasDe = (entradas, orden) => entradas.sort(orden).map(([k, d]) => ({
    clave: k, etiqueta: k, valor: d.venta, texto: fmt(d.venta),
    sub: `util. ${fmt(d.utilidad)} · ${d.count} ped.`,
  }))
  const porCat = filasDe(agrupar('categoria', 'Sin categoría'), (a, b) => b[1].venta - a[1].venta)
  const porTienda = filasDe(agrupar('lugar_compra', 'Sin tienda'), (a, b) => b[1].venta - a[1].venta)
  const etiquetaDia = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(k + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '') : k
  const porDia = agrupar('fecha_compra', 'Sin fecha').sort((a, b) => a[0].localeCompare(b[0])).map(([k, d]) => ({
    clave: k, etiqueta: etiquetaDia(k), valor: d.venta, texto: fmt(d.venta), sub: `util. ${fmt(d.utilidad)} · ${d.count} ped.`,
  }))

  const pctCobrado = m.ventaTotal > 0 ? Math.min(100, Math.max(0, (m.cobradoTotal / m.ventaTotal) * 100)) : 0
  const conSaldo = porCliente.filter(c => c.venta - c.cobrado > 0)
  const liquidados = porCliente.filter(c => c.venta - c.cobrado <= 0)
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const base = segCliente === 'saldo' ? conSaldo : segCliente === 'liquidados' ? liquidados : porCliente
  const clientesVis = buscar.trim() ? base.filter(c => norm(c.nombre).includes(norm(buscar))) : base
  const clientesMostrados = todosClientes || buscar.trim() ? clientesVis : clientesVis.slice(0, 12)

  const pedsCat = filtroCat ? peds.filter(p => p.categoria === filtroCat) : []
  const vCat = pedsCat.reduce((s, p) => s + (p.precio_venta || 0), 0)
  const uCat = pedsCat.reduce((s, p) => s + (p.utilidad || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Lo vendido y cuánto ya se cobró */}
      <div style={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
          <div>
            <div style={rotulo}>Vendido en esta entrega</div>
            <div style={{ color: 'var(--w55)', fontSize: 12.5, marginTop: 6 }}>{m.totalPedidos} pedidos · {m.clientesUnicos} clientes</div>
          </div>
          <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(m.ventaTotal)}</div>
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 7 }}>
            <span style={{ color: 'var(--w50)' }}>Cobrado <b className="monto" style={{ color: 'var(--tinta)' }}>{fmt(m.cobradoTotal)}</b></span>
            <span style={{ color: m.pendiente > 0 ? 'var(--rojo-t)' : 'var(--verde)', fontWeight: 700 }}>
              {m.pendiente > 0 ? `faltan ${fmt(m.pendiente)}` : 'liquidada'}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--w06)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pctCobrado}%`, height: '100%', background: 'var(--verde)', borderRadius: 6 }} />
          </div>
          <div style={{ color: 'var(--w50)', fontSize: 11.5, marginTop: 6 }}>{pctCobrado.toFixed(0)}% cobrado · anticipos {fmt(m.totalAnticipos)}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--w06)' }}>
          <Celda rotulo="Utilidad" valor={fmt(m.utilidadTotal)} color="var(--verde)" sub={`margen ${m.margen.toFixed(1)}%`} />
          <Celda rotulo="Costo" valor={fmt(m.costoTotal)} />
          <Celda rotulo="Cobrado" valor={fmt(m.cobradoTotal)} />
          <Celda rotulo="Por cobrar" valor={fmt(Math.max(0, m.pendiente))} color={m.pendiente > 0 ? 'var(--rojo-t)' : 'var(--verde)'} sub={`${conSaldo.length} ${conSaldo.length === 1 ? 'cliente' : 'clientes'} con saldo`} />
        </div>
      </div>

      {/* Filtro de categoría */}
      {categorias.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--w55)', fontSize: 12 }}>Mirar solo una categoría:</span>
            {[['', 'Todas'], ...categorias.map(c => [c.nombre, c.nombre])].map(([val, t]) => {
              const act = filtroCat === val
              return (
                <button key={val || 'todas'} onClick={() => setFiltroCat(val)}
                  style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${act ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: act ? 'rgba(193,85,58,0.15)' : 'var(--w03)', color: act ? 'var(--marca-t)' : 'var(--w40)' }}>{t}</button>
              )
            })}
          </div>
          {filtroCat && (
            <div style={{ ...tarjeta, marginTop: 10, background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.18)' }}>
              <div style={{ padding: '10px 18px', color: 'var(--marca-t)', fontSize: 12, fontWeight: 700 }}>{filtroCat} · {pedsCat.length} pedidos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--w06)' }}>
                <Celda rotulo="Venta" valor={fmt(vCat)} />
                <Celda rotulo="Utilidad" valor={fmt(uCat)} color="var(--verde)" />
                <Celda rotulo="Margen" valor={vCat > 0 ? `${((uCat / vCat) * 100).toFixed(1)}%` : '—'} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ¿En qué? ¿Dónde? ¿Cuándo? */}
      {peds.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
          <Bloque titulo="Por categoría" nota="venta"><Ranking tono="var(--marca)" limite={6} filas={porCat} /></Bloque>
          <Bloque titulo="Por tienda de compra" nota="venta"><Ranking tono="var(--azul)" limite={6} filas={porTienda} /></Bloque>
          <div style={{ gridColumn: '1 / -1' }}>
            <Bloque titulo="Por día de compra" nota="venta · pasa el cursor para ver la utilidad"><Columnas datos={porDia} /></Bloque>
          </div>
        </div>
      )}

      {/* Por cliente */}
      {porCliente.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{ ...rotulo, margin: 0 }}>Por cliente</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['todos', 'Todos', porCliente.length], ['saldo', 'Con saldo', conSaldo.length], ['liquidados', 'Liquidados', liquidados.length]].map(([k, t, n]) => {
                const act = segCliente === k
                return (
                  <button key={k} onClick={() => { setSegCliente(k); setTodosClientes(false); setBuscar('') }}
                    style={{ cursor: 'pointer', border: `1px solid ${act ? 'var(--marca)' : 'var(--w10)'}`, background: act ? 'rgba(193,85,58,0.1)' : 'var(--w03)', color: act ? 'var(--marca-t)' : 'var(--w45)', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}>
                    {t} <span style={{ fontWeight: 800 }}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente…"
            style={{ ...campoR, width: '100%', fontSize: 13, padding: '10px 14px', borderRadius: 12, marginBottom: 10, background: 'var(--sup)' }} />
          <div style={tarjeta}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 520 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '9px 16px', background: 'var(--w02)' }}>
                  {['Cliente', 'Venta', 'Cobrado', 'Utilidad', 'Estado'].map((h, i) => (
                    <span key={i} style={{ ...rotulo, fontSize: 11, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {clientesMostrados.map((c, i) => {
                  const pendiente = c.venta - c.cobrado
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', padding: '10px 16px', borderTop: '1px solid var(--w04)', alignItems: 'center' }}>
                      <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{c.nombre}</span>
                      <span className="monto" style={{ color: 'var(--tinta)', fontSize: 13, textAlign: 'right' }}>{fmt(c.venta)}</span>
                      <span className="monto" style={{ color: c.cobrado > 0 ? 'var(--w70)' : 'var(--w28)', fontSize: 13, textAlign: 'right' }}>{c.cobrado > 0 ? fmt(c.cobrado) : '—'}</span>
                      <span className="monto" style={{ color: 'var(--verde)', fontSize: 13, textAlign: 'right' }}>{fmt(c.utilidad)}</span>
                      <div style={{ textAlign: 'right' }}>
                        {pendiente <= 0
                          ? <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--verde)', fontSize: 11.5 }}>✓ Liquidado</span>
                          : <span className="monto" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--rojo-t)', fontSize: 11.5, fontWeight: 700 }}>debe {fmt(pendiente)}</span>}
                      </div>
                    </div>
                  )
                })}
                {clientesVis.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--w50)', fontSize: 12 }}>Nadie en este grupo</div>}
              </div>
            </div>
          </div>
          {clientesVis.length > 12 && !buscar.trim() && (
            <button onClick={() => setTodosClientes(t => !t)}
              style={{ width: '100%', marginTop: 10, padding: 11, borderRadius: 11, cursor: 'pointer', border: '1px solid var(--w10)', background: 'transparent', color: 'var(--marca-t)', fontSize: 12.5, fontWeight: 700 }}>
              {todosClientes ? 'Ver menos' : `Ver los ${clientesVis.length} clientes`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Desglose por magnitud, sin color de identidad. En una misma pantalla solo un
// desglose lleva paleta categórica (el origen); los demás se resuelven con
// longitud y un solo tono, para que el ojo no empareje lo que no tiene relación.
function Desglose({ titulo, total, partes, fmt }) {
  const vivas = partes.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  if (!total || !vivas.length) return null
  const mayor = vivas[0][1]
  return (
    <div>
      <div style={{ color: 'rgba(var(--base),0.7)', fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {vivas.map(([et, v]) => (
          <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'rgba(var(--base),0.7)', fontSize: 12, width: 108, flexShrink: 0 }}>{et}</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(var(--base),0.06)', borderRadius: 5, overflow: 'hidden', minWidth: 40 }}>
              <div style={{ width: `${(v / mayor) * 100}%`, height: '100%', background: 'rgba(var(--base),0.34)', borderRadius: 5 }} />
            </div>
            <span className="monto" style={{ color: 'rgba(var(--base),0.8)', fontSize: 12.5, fontWeight: 700, width: 88, textAlign: 'right', flexShrink: 0 }}>{fmt(v)}</span>
            <span style={{ color: 'rgba(var(--base),0.5)', fontSize: 12, width: 34, textAlign: 'right', flexShrink: 0 }}>{((v / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
