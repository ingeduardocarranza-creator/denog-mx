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
const rotulo = { color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }
const th = { color: 'var(--w40)', textAlign: 'left', padding: '11px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }
const td = { padding: '11px 14px' }
const campoR = { background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 9, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }

const VISTAS = [
  ['resumen', 'Resumen'],
  ['tienda', '🏪 Tienda'],
  ['pedidos', '📦 Pedidos'],
  ['entrega', '🚚 Por entrega'],
  ['control', '🔎 Control'],
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
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 3 }}>
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

        {/* Vistas */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--w04)', border: '1px solid var(--w06)', borderRadius: 14, overflowX: 'auto', marginBottom: 14 }}>
          {VISTAS.map(([k, t]) => {
            const activa = vista === k
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
                {k === 'control' && hayAlertaControl && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--rojo)' }} />}
              </button>
            )
          })}
        </div>

        {/* Periodo (no aplica a "Por entrega") */}
        {vista !== 'entrega' && (
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
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
                <span style={{ color: 'var(--w38)', fontSize: 12 }}>a</span>
                <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} style={campoR} />
              </>
            )}
          </div>
        )}

        {/* Error / carga de las vistas que dependen de "general" */}
        {['resumen', 'pedidos', 'control'].includes(vista) && (
          <>
            {cargandoGeneral && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando…</div>}
            {!cargandoGeneral && errorGeneral && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 17 }}>🔴</span>
                <div>
                  <div style={{ color: 'var(--rojo-t)', fontSize: 13.5, fontWeight: 700 }}>El reporte no se pudo armar</div>
                  <div style={{ color: 'var(--w45)', fontSize: 12.5, marginTop: 4 }}>{errorGeneral}</div>
                  <div style={{ color: 'var(--w35)', fontSize: 11.5, marginTop: 6, maxWidth: '58ch' }}>
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
                  <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>Todo el dinero cobrado, tienda y pedidos juntos</div>
                </div>
                <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(g.total)}</div>
              </div>

              {/* Los dos negocios, lado a lado: tocar uno abre su vista */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, padding: '0 22px 20px' }}>
                <Pilar
                  tono="#0f8a63" titulo="🏪 Tienda" monto={g.ingresos.tienda} total={g.total}
                  lineas={[
                    `${g.tienda.articulos} ${g.tienda.articulos === 1 ? 'artículo' : 'artículos'}`,
                    g.tienda.ventaConCosto > 0 ? `utilidad ${fmt(g.tienda.utilidad)} (${((g.tienda.utilidad / g.tienda.ventaConCosto) * 100).toFixed(0)}%)` : 'utilidad sin calcular',
                  ]}
                  onClick={() => setVista('tienda')} />
                <Pilar
                  tono="#c1553a" titulo="📦 Pedidos" monto={pedidosTotal} total={g.total}
                  lineas={[
                    `entregas ${fmt(g.ingresos.entregas)} · anticipos ${fmt(g.ingresos.anticipos)}`,
                    g.ingresos.envios > 0 ? `envíos ${fmt(g.ingresos.envios)}` : null,
                  ].filter(Boolean)}
                  onClick={() => setVista('pedidos')} />
              </div>

              <div style={{ padding: '0 22px 20px', borderTop: '1px solid var(--w06)', paddingTop: 18 }}>
                <Barra titulo="Por origen" total={g.total} partes={[
                  ['Entregas', g.ingresos.entregas, '#c1553a'],
                  ['Anticipos', g.ingresos.anticipos, '#2563eb'],
                  ['Tienda', g.ingresos.tienda, '#0f8a63'],
                  ['Envíos', g.ingresos.envios || 0, '#a06d14'],
                  ['Otros', g.ingresos.otros, '#8a8178'],
                ]} fmt={fmt} />
                <div style={{ height: 20 }} />
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
          cargandoTienda ? <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              <div style={tarjeta}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
                  <div>
                    <div style={rotulo}>Vendido en tienda</div>
                    <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                      {analisisTienda.transacciones.length} {analisisTienda.transacciones.length === 1 ? 'venta' : 'ventas'} · {analisisTienda.totalArticulos} {analisisTienda.totalArticulos === 1 ? 'artículo' : 'artículos'}
                    </div>
                  </div>
                  <div className="monto" style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(analisisTienda.totalVendido)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', borderTop: '1px solid var(--w06)' }}>
                  <Celda rotulo="Utilidad" valor={fmt(utilidadMostrada)} color="var(--verde)"
                    sub={analisisTienda.totalVendido > 0 ? `margen ${((utilidadMostrada / analisisTienda.totalVendido) * 100).toFixed(0)}%` : null}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--w40)', cursor: 'pointer', marginTop: 5 }}>
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
                <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w35)', fontSize: 13 }}>
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
                  <Bloque titulo="🏆 Lo que más se vende" nota="por importe">
                    <Ranking tono="var(--verde)" limite={8} filas={analisisTienda.topProductos.map(p => ({
                      clave: p.nombre, etiqueta: p.nombre, sub: `${p.cantidad} ${p.cantidad === 1 ? 'pieza' : 'piezas'}${p.categoria ? ' · ' + p.categoria : ''}`,
                      valor: p.revenue, texto: fmt(p.revenue),
                    }))} />
                  </Bloque>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <Bloque titulo="📂 Por categoría" nota="por importe">
                      <Ranking tono="var(--ambar)" limite={6} filas={analisisTienda.porCategoria.map(c => ({
                        clave: c.categoria, etiqueta: c.categoria, sub: `${c.cantidad} ${c.cantidad === 1 ? 'pieza' : 'piezas'}`,
                        valor: c.revenue, texto: fmt(c.revenue),
                        pct: analisisTienda.totalVendido > 0 ? Math.round((c.revenue / analisisTienda.totalVendido) * 100) : null,
                      }))} />
                    </Bloque>
                    <Bloque titulo="👤 Por vendedor">
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
                  <h3 style={{ ...rotulo, marginBottom: 10 }}>Ventas del periodo · toca una para ver los artículos</h3>
                  <ListaVentasTienda key={claveLista} ventas={analisisTienda.transacciones} />
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

            {cargandoEC && <div style={{ color: 'var(--w30)', textAlign: 'center', padding: 40 }}>Cargando…</div>}

            {!cargandoEC && metricasEC && (
              <EntregaVista
                m={metricasEC} peds={rawPedidos} porCliente={porClienteEC}
                categorias={categoriasReporte} filtroCat={filtroCatReporte} setFiltroCat={setFiltroCatReporte} />
            )}

            {!entregaSeleccionada && !cargandoEC && (
              <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w35)', fontSize: 13 }}>
                Elige una entrega para ver sus números
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════ CONTROL ═══════════════════ */}
        {vista === 'control' && !cargandoGeneral && g && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <CuadreCard g={g} />
            <Senales g={g} fmt={fmt} />

            {/* Cada corte contra lo que sigue registrado: detecta dinero que se
                anotó y después desapareció (así se destapó el bug de los
                anticipos borrados, tres semanas tarde). */}
            {g.cuadreCortes?.length > 0 && (
              <div style={tarjeta}>
                <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--w06)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={rotulo}>Cada corte contra lo registrado</span>
                    {g.alertaCortes?.descuadrados > 0 ? (
                      <span className="monto" style={{ color: 'var(--rojo-t)', fontSize: 13, fontWeight: 800 }}>
                        {g.alertaCortes.descuadrados} descuadrado{g.alertaCortes.descuadrados !== 1 ? 's' : ''} · {fmt(g.alertaCortes.monto)}
                      </span>
                    ) : g.alertaCortes?.revisados > 0 ? (
                      <span style={{ color: 'var(--verde)', fontSize: 13, fontWeight: 700 }}>Todos cuadran</span>
                    ) : null}
                  </div>
                  <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6, maxWidth: 620, lineHeight: 1.5 }}>
                    Lo que el corte anotó por método contra lo que sigue registrado en ese mismo periodo. Si el corte contó más, algo se borró o se canceló después.
                    {g.alertaCortes?.sin_periodo > 0 && ` ${g.alertaCortes.sin_periodo} corte${g.alertaCortes.sin_periodo !== 1 ? 's' : ''} no se puede${g.alertaCortes.sin_periodo !== 1 ? 'n' : ''} cuadrar: son anteriores al cambio que guarda el periodo.`}
                  </div>
                </div>
                <div>
                  {g.cuadreCortes.map((c) => {
                    const cuando = new Date(c.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })
                    if (!c.conciliable) {
                      return (
                        <div key={c.id} style={{ padding: '11px 22px', borderTop: '1px solid var(--w04)', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--w45)', fontSize: 12.5, minWidth: 130 }}>{cuando}</span>
                          <span style={{ color: 'var(--w35)', fontSize: 12 }}>{c.quien}</span>
                          <span style={{ color: 'var(--w28)', fontSize: 11.5, marginLeft: 'auto' }}>{c.motivo || 'No conciliable'}</span>
                        </div>
                      )
                    }
                    const mal = Math.abs(c.descuadre) > 0.5
                    return (
                      <div key={c.id} style={{ padding: '13px 22px', borderTop: '1px solid var(--w04)', background: mal ? 'rgba(var(--rojo-rgb),0.07)' : 'transparent' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 600, minWidth: 130 }}>{cuando}</span>
                          <span style={{ color: 'var(--w40)', fontSize: 12 }}>{c.quien}</span>
                          <span className="monto" style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: 800, color: mal ? 'var(--rojo-t)' : 'var(--verde)' }}>
                            {!mal ? 'cuadra' : c.descuadre > 0 ? `faltan ${fmt(c.descuadre)}` : `sobran ${fmt(-c.descuadre)}`}
                          </span>
                        </div>
                        {mal && (
                          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
                            {c.metodos.filter(m => Math.abs(m.diferencia) > 0.5).map(m => (
                              <div key={m.metodo} style={{ fontSize: 11.5, color: 'var(--w45)' }}>
                                <span style={{ fontWeight: 600, color: 'var(--w60)' }}>{m.metodo}:</span>{' '}
                                anotó <span className="monto">{fmt(m.anoto)}</span>, hay <span className="monto">{fmt(m.hay)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Por colaborador */}
            {g.control.length > 0 && (
              <div>
                <h3 style={{ ...rotulo, marginBottom: 10 }}>Por colaborador</h3>
                <div style={tarjeta}>
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
                        {g.control.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid var(--w04)' }}>
                            <td style={{ ...td, fontWeight: 700, color: 'var(--tinta)' }}>{c.nombre}</td>
                            <td style={{ ...td, textAlign: 'center', color: 'var(--w45)' }}>{c.cortes || '—'}</td>
                            <td className="monto" style={{ ...td, textAlign: 'right', fontWeight: 800, color: c.diferencia < -0.5 ? 'var(--rojo-t)' : c.diferencia > 0.5 ? 'var(--ambar)' : 'var(--verde)' }}>
                              {c.cortes ? `${c.diferencia > 0 ? '+' : ''}${fmt(c.diferencia)}` : '—'}
                            </td>
                            <td className="monto" style={{ ...td, textAlign: 'right', color: 'var(--w45)' }}>{c.peorDiferencia ? fmt(c.peorDiferencia) : '—'}</td>
                            <td className="monto" style={{ ...td, textAlign: 'right', color: 'var(--w55)' }}>{fmt(c.montoVendido)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              {c.manuales > 0 ? (
                                <span>
                                  <span className="monto" style={{ color: c.pctManual >= 20 ? 'var(--rojo-t)' : c.pctManual >= 10 ? 'var(--ambar)' : 'var(--w55)', fontWeight: 700 }}>{fmt(c.montoManual)}</span>
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
                  La diferencia acumulada suma todos los cortes del periodo. Un faltante aislado casi siempre es error de captura; lo que hay que mirar es el patrón — la misma persona cerrando corto una y otra vez. "Monto libre" son ventas tecleadas sin producto del catálogo: por encima del 20% de lo que vende alguien, vale la pena revisar.
                </p>
              </div>
            )}

            {/* Retiros y cancelaciones */}
            {(g.retiros.length > 0 || g.cancelados.length > 0) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {g.retiros.length > 0 && (
                  <div>
                    <h3 style={{ ...rotulo, marginBottom: 10 }}>Retiros de caja · {fmt(retirosTotal)}</h3>
                    <div style={tarjeta}>
                      {g.retiros.map((r, i) => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < g.retiros.length - 1 ? '1px solid var(--w04)' : 'none' }}>
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
                {g.cancelados.length > 0 && (
                  <div>
                    <h3 style={{ ...rotulo, marginBottom: 10 }}>Pagos cancelados · {fmt(canceladosTotal)}</h3>
                    <div style={tarjeta}>
                      {g.cancelados.map((c, i) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: i < g.cancelados.length - 1 ? '1px solid var(--w04)' : 'none' }}>
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
            ) : (
              <div style={{ ...tarjeta, padding: '16px 22px', color: 'var(--w40)', fontSize: 12.5 }}>
                Sin retiros de caja ni pagos cancelados en este periodo.
              </div>
            )}
          </div>
        )}

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
          <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
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
          <div style={{ color: 'var(--w38)', fontSize: 10.5, marginTop: 4 }}>
            {d < -0.5 ? 'falta efectivo' : d > 0.5 ? 'sobra efectivo' : 'cuadra exacto'}
          </div>
        </div>
      </div>
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
      style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--w03)', border: '1px solid var(--w07)', borderLeft: `4px solid ${tono}`, borderRadius: 12, padding: '14px 16px', display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: 'var(--tinta)', fontSize: 13.5, fontWeight: 800 }}>{titulo}</span>
        <span style={{ color: 'var(--w35)', fontSize: 11 }}>{pct}% del total</span>
      </div>
      <div className="monto" style={{ color: 'var(--tinta)', fontSize: 26, fontWeight: 900, letterSpacing: -0.8, margin: '6px 0 8px' }}>{fmt(monto)}</div>
      {lineas.map((l, i) => <div key={i} style={{ color: 'var(--w45)', fontSize: 11.5, marginTop: 2 }}>{l}</div>)}
      <div style={{ color: 'var(--marca-t)', fontSize: 11.5, fontWeight: 700, marginTop: 10 }}>Ver detalle →</div>
    </button>
  )
}

// Celda de cifra dentro de una tarjeta.
function Celda({ rotulo: r, valor, sub, color, chico, children }) {
  return (
    <div style={{ padding: '14px 18px', borderRight: '1px solid var(--w05)', borderBottom: '1px solid var(--w05)' }}>
      <div style={rotulo}>{r}</div>
      <div className="monto" style={{ color: color || 'var(--tinta)', fontSize: chico ? 15 : 20, fontWeight: 800, marginTop: chico ? 8 : 5, letterSpacing: -0.5 }}>{valor}</div>
      {sub && <div style={{ color: 'var(--w35)', fontSize: 10.5, marginTop: 3 }}>{sub}</div>}
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
        {nota && <span style={{ color: 'var(--w32)', fontSize: 10.5 }}>{nota}</span>}
      </div>
      <div style={{ padding: '6px 18px 10px' }}>{children}</div>
    </div>
  )
}

// Listado con barra de magnitud: orden + longitud + cifra. Un solo tono por
// listado; el nombre y la cifra cargan el dato, la barra solo compara.
function Ranking({ filas, tono = 'var(--marca)', limite = 0, extraTitulo }) {
  const [todos, setTodos] = useState(false)
  if (!filas.length) return <div style={{ color: 'var(--w30)', fontSize: 12, padding: '14px 0' }}>Sin datos</div>
  const visibles = limite && !todos ? filas.slice(0, limite) : filas
  const mayor = Math.max(...filas.map(f => Math.abs(f.valor)), 1)
  return (
    <div>
      {visibles.map((f, i) => (
        <div key={f.clave + i} style={{ padding: '9px 0', borderTop: i ? '1px solid var(--w04)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ color: 'var(--w30)', fontSize: 11, width: 16, flexShrink: 0, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.etiqueta}</span>
            <span className="monto" style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{f.texto}</span>
            {f.pct != null && <span style={{ color: 'var(--w32)', fontSize: 10.5, width: 30, textAlign: 'right', flexShrink: 0 }}>{f.pct}%</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, paddingLeft: 26 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--w06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, (Math.abs(f.valor) / mayor) * 100)}%`, height: '100%', background: tono, opacity: 0.55, borderRadius: 3 }} />
            </div>
            {f.sub && <span style={{ color: 'var(--w38)', fontSize: 10.5, flexShrink: 0, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.sub}</span>}
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
          <div style={{ color: 'var(--w45)', fontSize: 12, marginTop: 3 }}>Captura el costo real para que la utilidad quede exacta.</div>
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

// Ventas de tienda, una por renglón; se abre para ver los artículos.
function ListaVentasTienda({ ventas }) {
  const [abierta, setAbierta] = useState(null)
  const [visibles, setVisibles] = useState(25)
  return (
    <div>
      <div style={tarjeta}>
        {ventas.slice(0, visibles).map((t, i) => {
          const open = abierta === i
          const piezas = t.articulos.reduce((s, a) => s + a.cantidad, 0)
          return (
            <div key={t.pago_id} style={{ borderTop: i ? '1px solid var(--w05)' : 'none' }}>
              <div onClick={() => setAbierta(open ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: open ? 'var(--w03)' : 'transparent' }}>
                <div style={{ width: 84, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{hora(t.creado_en)}</div>
                  <div style={{ color: 'var(--w35)', fontSize: 10.5 }}>{diaCorto(t.creado_en)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--w70)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.articulos.map(a => `${a.cantidad > 1 ? a.cantidad + '× ' : ''}${a.nombre}`).join(', ')}
                  </div>
                  <div style={{ color: 'var(--w38)', fontSize: 11, marginTop: 3 }}>
                    {t.vendedor} · {piezas} {piezas === 1 ? 'pieza' : 'piezas'} · {t.metodo}
                  </div>
                </div>
                <div className="monto" style={{ color: 'var(--verde)', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>{fmt(t.total)}</div>
              </div>
              {open && (
                <div style={{ padding: '2px 16px 14px 112px' }}>
                  {t.articulos.map((a, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: 'var(--w60)' }}>{a.cantidad > 1 ? `${a.cantidad}× ` : ''}{a.nombre}</span>
                      <span className="monto" style={{ color: 'var(--w45)', flexShrink: 0 }}>{fmt(a.cantidad * a.precio)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {ventas.length > visibles && (
        <button onClick={() => setVisibles(n => n + 25)}
          style={{ width: '100%', marginTop: 10, padding: 11, borderRadius: 11, cursor: 'pointer', border: '1px solid var(--w10)', background: 'transparent', color: 'var(--marca-t)', fontSize: 12.5, fontWeight: 700 }}>
          Ver 25 más · quedan {ventas.length - visibles}
        </button>
      )}
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
  const SEGS = [['todas', 'Todas'], ['recogieron', '📦 Recogieron su encargo'], ['anticipos', '💳 Anticipos'], ['pagado', 'Ya estaba pagado']]
  const filtradas = pedidos.filter(v => delSeg(v, seg))
  const valorYaPagado = pedidos.filter(v => v.sinCobro).reduce((s, v) => s + Number(v.valorRecogido || 0), 0)
  const clientesRecogieron = pedidos.filter(v => delSeg(v, 'recogieron')).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
          <div>
            <div style={rotulo}>Cobrado por pedidos</div>
            <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>Entregas + anticipos{g.ingresos.envios > 0 ? ' + envíos' : ''}</div>
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
        <div style={{ ...tarjeta, padding: 40, textAlign: 'center', color: 'var(--w35)', fontSize: 13 }}>
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
                  style={{ cursor: 'pointer', border: `1px solid ${activo ? 'var(--marca)' : 'var(--w10)'}`, background: activo ? 'rgba(193,85,58,0.1)' : 'var(--w03)', color: activo ? 'var(--marca-t)' : 'var(--w45)', borderRadius: 20, padding: '6px 12px', fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t}<span style={{ color: activo ? 'var(--marca-t)' : 'var(--w30)', fontWeight: 800 }}>{n}</span>
                </button>
              )
            })}
          </div>
          <p style={{ color: 'var(--w40)', fontSize: 12, marginBottom: 12 }}>
            {filtradas.length} {filtradas.length === 1 ? 'visita' : 'visitas'} · toca una para ver qué se llevó
          </p>
          <ListaVisitas key={`${claveLista}-${seg}`} visitas={filtradas} />
        </div>
      )}
    </div>
  )
}

function ListaVisitas({ visitas }) {
  const [abierta, setAbierta] = useState(null)
  const [visibles, setVisibles] = useState(25)
  if (!visitas.length) {
    return <div style={{ ...tarjeta, padding: 24, textAlign: 'center', color: 'var(--w30)', fontSize: 12 }}>Nada en este segmento durante el periodo</div>
  }
  return (
    <div>
      <div style={tarjeta}>
        {visitas.slice(0, visibles).map((v, i) => {
          const open = abierta === i
          const mixta = v.tienda > 0 && (v.entregas > 0 || v.anticipos > 0)
          return (
            <div key={i} style={{ borderTop: i ? '1px solid var(--w05)' : 'none' }}>
              <div onClick={() => setAbierta(open ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', background: open ? 'var(--w03)' : 'transparent' }}>
                <div style={{ width: 84, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{hora(v.desde)}</div>
                  <div style={{ color: 'var(--w35)', fontSize: 10.5 }}>{diaCorto(v.desde)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{v.nombre}</span>
                    {mixta && <span style={{ background: 'var(--marca)', color: 'var(--sup)', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, letterSpacing: 0.3 }}>ENCARGO + TIENDA</span>}
                    {v.sinCobro && <span style={{ border: '1px solid var(--w14)', color: 'var(--w45)', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, letterSpacing: 0.3 }}>YA ESTABA PAGADO</span>}
                  </div>
                  <div style={{ color: 'var(--w38)', fontSize: 11, marginTop: 3 }}>
                    {v.sinCobro
                      ? `recogió ${fmt(v.valorRecogido)} en mercancía · no se cobró nada`
                      : [
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
                <div className="monto" style={{ color: v.sinCobro ? 'var(--w30)' : 'var(--marca-t)', fontSize: 17, fontWeight: 800, flexShrink: 0 }}>{fmt(v.total)}</div>
              </div>

              {open && (
                <div style={{ padding: '0 16px 15px 112px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
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
      {visitas.length > visibles && (
        <button onClick={() => setVisibles(n => n + 25)}
          style={{ width: '100%', marginTop: 10, padding: 11, borderRadius: 11, cursor: 'pointer', border: '1px solid var(--w10)', background: 'transparent', color: 'var(--marca-t)', fontSize: 12.5, fontWeight: 700 }}>
          Ver 25 más · quedan {visitas.length - visibles}
        </button>
      )}
    </div>
  )
}

// ── Por entrega ──────────────────────────────────────────────────────────────
function EntregaVista({ m, peds, porCliente, categorias, filtroCat, setFiltroCat }) {
  const [segCliente, setSegCliente] = useState('todos')
  const [todosClientes, setTodosClientes] = useState(false)

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
  const porDia = filasDe(agrupar('fecha_compra', 'Sin fecha'), (a, b) => a[0].localeCompare(b[0]))

  const pctCobrado = m.ventaTotal > 0 ? Math.min(100, Math.max(0, (m.cobradoTotal / m.ventaTotal) * 100)) : 0
  const conSaldo = porCliente.filter(c => c.venta - c.cobrado > 0)
  const liquidados = porCliente.filter(c => c.venta - c.cobrado <= 0)
  const clientesVis = segCliente === 'saldo' ? conSaldo : segCliente === 'liquidados' ? liquidados : porCliente
  const clientesMostrados = todosClientes ? clientesVis : clientesVis.slice(0, 12)

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
            <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>{m.totalPedidos} pedidos · {m.clientesUnicos} clientes</div>
          </div>
          <div className="monto" style={{ color: 'var(--marca-t)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{fmt(m.ventaTotal)}</div>
        </div>

        <div style={{ padding: '0 22px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 7 }}>
            <span style={{ color: 'var(--w50)' }}>Cobrado <b className="monto" style={{ color: 'var(--tinta)' }}>{fmt(m.cobradoTotal)}</b></span>
            <span style={{ color: m.pendiente > 0 ? 'var(--rojo-t)' : 'var(--verde)', fontWeight: 700 }}>
              {m.pendiente > 0 ? `faltan ${fmt(m.pendiente)}` : 'liquidada'}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--w06)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pctCobrado}%`, height: '100%', background: 'var(--verde)', borderRadius: 6 }} />
          </div>
          <div style={{ color: 'var(--w35)', fontSize: 10.5, marginTop: 6 }}>{pctCobrado.toFixed(0)}% cobrado · anticipos {fmt(m.totalAnticipos)}</div>
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
            <span style={{ color: 'var(--w40)', fontSize: 11 }}>Mirar solo una categoría:</span>
            {[['', 'Todas'], ...categorias.map(c => [c.nombre, c.nombre])].map(([val, t]) => {
              const act = filtroCat === val
              return (
                <button key={val || 'todas'} onClick={() => setFiltroCat(val)}
                  style={{ padding: '4px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${act ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: act ? 'rgba(193,85,58,0.15)' : 'var(--w03)', color: act ? 'var(--marca-t)' : 'var(--w40)' }}>{t}</button>
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
          <Bloque titulo="Por día de compra" nota="venta"><Ranking tono="var(--ambar)" limite={6} filas={porDia} /></Bloque>
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
                  <button key={k} onClick={() => { setSegCliente(k); setTodosClientes(false) }}
                    style={{ cursor: 'pointer', border: `1px solid ${act ? 'var(--marca)' : 'var(--w10)'}`, background: act ? 'rgba(193,85,58,0.1)' : 'var(--w03)', color: act ? 'var(--marca-t)' : 'var(--w45)', borderRadius: 20, padding: '5px 12px', fontSize: 11.5, fontWeight: 700 }}>
                    {t} <span style={{ fontWeight: 800 }}>{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div style={tarjeta}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 420 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '9px 16px', background: 'var(--w02)' }}>
                  {['Cliente', 'Venta', 'Utilidad', 'Estado'].map((h, i) => (
                    <span key={i} style={{ ...rotulo, fontSize: 9.5, textAlign: i > 0 ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {clientesMostrados.map((c, i) => {
                  const pendiente = c.venta - c.cobrado
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', borderTop: '1px solid var(--w04)', alignItems: 'center' }}>
                      <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{c.nombre}</span>
                      <span className="monto" style={{ color: 'var(--tinta)', fontSize: 13, textAlign: 'right' }}>{fmt(c.venta)}</span>
                      <span className="monto" style={{ color: 'var(--verde)', fontSize: 13, textAlign: 'right' }}>{fmt(c.utilidad)}</span>
                      <div style={{ textAlign: 'right' }}>
                        {pendiente <= 0
                          ? <span style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--verde)', fontSize: 10.5 }}>✓ Liquidado</span>
                          : <span className="monto" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '2px 8px', color: 'var(--rojo-t)', fontSize: 10.5, fontWeight: 700 }}>debe {fmt(pendiente)}</span>}
                      </div>
                    </div>
                  )
                })}
                {clientesVis.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--w30)', fontSize: 12 }}>Nadie en este grupo</div>}
              </div>
            </div>
          </div>
          {clientesVis.length > 12 && (
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

// Desglose por magnitud, sin color de identidad. En una misma pantalla solo un
// desglose lleva paleta categórica (el origen); los demás se resuelven con
// longitud y un solo tono, para que el ojo no empareje lo que no tiene relación.
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
