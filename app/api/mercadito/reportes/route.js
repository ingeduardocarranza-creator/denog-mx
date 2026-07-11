import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const DIA_MS = 24 * 60 * 60 * 1000
const totalPedido = (p) => (p.items || []).reduce((a, it) => a + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)

function claveBucket(fecha, periodo) {
  const d = new Date(fecha)
  if (periodo === 'mes') {
    // Semana ISO aproximada: año-mes-numero de semana del mes
    const primerDia = new Date(d.getFullYear(), d.getMonth(), 1)
    const semanaDelMes = Math.ceil((d.getDate() + primerDia.getDay()) / 7)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-S${semanaDelMes}`
  }
  return d.toISOString().slice(0, 10)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const periodo = searchParams.get('periodo') === 'mes' ? 'mes' : 'semana'
    const dias = periodo === 'mes' ? 30 : 7

    const desde = new Date(Date.now() - dias * DIA_MS)
    const desdeAnterior = new Date(Date.now() - dias * 2 * DIA_MS)

    const [{ data: pedidos, error: errPedidos }, { data: productos, error: errProductos }] = await Promise.all([
      supabase.from('pedidos_mercadito').select('*, clientes(nombre)').gte('creado_en', desdeAnterior.toISOString()),
      supabase.from('productos_tienda').select('id, categoria'),
    ])
    if (errPedidos) return NextResponse.json({ ok: false, mensaje: errPedidos.message })
    if (errProductos) return NextResponse.json({ ok: false, mensaje: errProductos.message })

    const categoriaPorProducto = Object.fromEntries((productos || []).map((p) => [p.id, p.categoria]))

    const enPeriodo = (pedidos || []).filter((p) => new Date(p.creado_en) >= desde)
    const enPeriodoAnterior = (pedidos || []).filter((p) => new Date(p.creado_en) >= desdeAnterior && new Date(p.creado_en) < desde)

    const aprobadosOAgregados = enPeriodo.filter((p) => p.estado === 'aprobado' || p.estado === 'agregado')
    const cancelados = enPeriodo.filter((p) => p.estado === 'cancelado')
    const invitados = enPeriodo.filter((p) => !p.cliente_id)

    const ingresosAprobados = aprobadosOAgregados.reduce((a, p) => a + totalPedido(p), 0)
    const ticketPromedio = aprobadosOAgregados.length ? ingresosAprobados / aprobadosOAgregados.length : 0
    const tasaCancelacion = enPeriodo.length ? (cancelados.length / enPeriodo.length) * 100 : 0

    const variacionPedidos = enPeriodoAnterior.length
      ? ((enPeriodo.length - enPeriodoAnterior.length) / enPeriodoAnterior.length) * 100
      : (enPeriodo.length > 0 ? 100 : 0)

    const desgloseAnticipo = { recibido: 0, autorizado_sin_anticipo: 0, esperando: 0 }
    enPeriodo.forEach((p) => { if (p.anticipo_estado && desgloseAnticipo[p.anticipo_estado] !== undefined) desgloseAnticipo[p.anticipo_estado]++ })

    const gestionados = enPeriodo.filter((p) => (p.historial || []).length > 1)
    const horasAtencion = gestionados.map((p) => (new Date(p.actualizado_en) - new Date(p.creado_en)) / 3_600_000)
    const tiempoPromedioAtencionHoras = horasAtencion.length ? horasAtencion.reduce((a, b) => a + b, 0) / horasAtencion.length : 0

    const cantidadPorCategoria = {}
    const cantidadPorProducto = {}
    enPeriodo.forEach((p) => {
      (p.items || []).forEach((it) => {
        const cat = categoriaPorProducto[it.producto_id] || 'Sin categoría'
        cantidadPorCategoria[cat] = (cantidadPorCategoria[cat] || 0) + (Number(it.cantidad) || 0)
        const key = it.producto_id || it.nombre
        if (!cantidadPorProducto[key]) cantidadPorProducto[key] = { nombre: it.nombre, cantidad: 0 }
        cantidadPorProducto[key].cantidad += Number(it.cantidad) || 0
      })
    })
    const categoriaMasVendida = Object.entries(cantidadPorCategoria).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const topProductos = Object.values(cantidadPorProducto).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

    const gestionesPorActor = {}
    enPeriodo.forEach((p) => {
      const actores = new Set((p.historial || []).map((h) => h.actor_nombre).filter(Boolean))
      actores.forEach((nombre) => { gestionesPorActor[nombre] = (gestionesPorActor[nombre] || 0) + 1 })
    })
    const colaboradorTop = Object.entries(gestionesPorActor).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    const buckets = {}
    enPeriodo.forEach((p) => {
      const clave = claveBucket(p.creado_en, periodo)
      if (!buckets[clave]) buckets[clave] = []
      buckets[clave].push({ id: p.id, folio: p.folio, nombre: p.clientes?.nombre || p.invitado_nombre || 'Cliente', items: p.items, total: totalPedido(p), estado: p.estado })
    })
    const tendencia = Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, lista]) => ({ clave, count: lista.length, pedidos: lista }))

    return NextResponse.json({
      ok: true,
      periodo,
      kpis: {
        pedidosTotales: enPeriodo.length,
        ingresosAprobados,
        ticketPromedio,
        tasaCancelacion,
        variacionPedidos,
        pctInvitado: enPeriodo.length ? (invitados.length / enPeriodo.length) * 100 : 0,
        pctCliente: enPeriodo.length ? ((enPeriodo.length - invitados.length) / enPeriodo.length) * 100 : 0,
        desgloseAnticipo,
        tiempoPromedioAtencionHoras,
        categoriaMasVendida,
        colaboradorTop,
      },
      tendencia,
      topProductos,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
