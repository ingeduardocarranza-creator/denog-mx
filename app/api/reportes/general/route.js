import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Reporte general de un periodo. Solo admin: trae diferencias de caja por
// persona y el detalle de las ventas manuales, que es material de control.
//
// Clasificación del dinero — el criterio importa, porque de él depende que la
// suma cuadre y que no quede dinero sin explicar:
//   · tienda    = el pago tiene renglones en ventas_tienda
//   · entregas  = pago con entrega_id y tipo 'Venta Liquidación'
//   · anticipos = tipo 'Anticipo'
//   · otros     = todo lo demás (mercadito, cobros sueltos). NO se esconde:
//                 si aparece dinero aquí, es que hay un flujo sin clasificar.
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  if (!desde || !hasta) return NextResponse.json({ ok: false, mensaje: 'Faltan fechas' })

  const ini = `${desde}T00:00:00`
  const fin = `${hasta}T23:59:59`

  const [pagosRes, ventasRes, cortesRes, retirosRes, canceladosRes, clientesRes, huerfanosRes] = await Promise.all([
    supabase.from('pagos').select('id, monto, metodo, tipo, entrega_id, creado_en, vendedor_id, cliente_id')
      .gte('creado_en', ini).lte('creado_en', fin),
    supabase.from('ventas_tienda')
      .select('id, pago_id, nombre_producto, categoria, cantidad, precio_unitario, costo_unitario, vendedor_id, origen, descuento_tipo, descuento_valor, creado_en')
      .gte('creado_en', ini).lte('creado_en', fin),
    supabase.from('cortes_caja').select('id, colaborador_id, tipo, total_contado, total_esperado, diferencia, justificacion, creado_en')
      .gte('creado_en', ini).lte('creado_en', fin),
    supabase.from('retiros_caja').select('id, admin_id, monto, motivo, estado, creado_en')
      .gte('creado_en', ini).lte('creado_en', fin),
    supabase.from('pagos_cancelados').select('id, monto, metodo, cancelado_por, cancelado_en, cancelado_motivo, cliente_id')
      .gte('cancelado_en', ini).lte('cancelado_en', fin),
    supabase.from('clientes').select('id, nombre'),
    supabase.from('pendientes').select('id', { count: 'exact', head: true })
      .eq('tipo', 'comprobante').eq('estado', 'resuelto'),
  ])

  const pagos = pagosRes.data || []
  const ventas = ventasRes.data || []
  const cortes = cortesRes.data || []
  const retiros = retirosRes.data || []
  const cancelados = canceladosRes.data || []
  const nombre = Object.fromEntries((clientesRes.data || []).map(c => [c.id, c.nombre]))

  const pagosDeTienda = new Set(ventas.map(v => v.pago_id).filter(Boolean))
  const clase = (p) =>
    pagosDeTienda.has(p.id) ? 'tienda'
    : p.tipo === 'Anticipo' ? 'anticipos'
    : p.entrega_id ? 'entregas'
    : 'otros'

  const suma = (arr, f = x => x.monto) => Math.round(arr.reduce((s, x) => s + Number(f(x) || 0), 0) * 100) / 100

  const ingresos = { entregas: 0, anticipos: 0, tienda: 0, otros: 0 }
  const porMetodo = { Efectivo: 0, Transferencia: 0, Terminal: 0, Otro: 0 }
  for (const p of pagos) {
    ingresos[clase(p)] += Number(p.monto || 0)
    const m = porMetodo[p.metodo] !== undefined ? p.metodo : 'Otro'
    porMetodo[m] += Number(p.monto || 0)
  }
  for (const k in ingresos) ingresos[k] = Math.round(ingresos[k] * 100) / 100
  for (const k in porMetodo) porMetodo[k] = Math.round(porMetodo[k] * 100) / 100
  const total = Math.round(Object.values(ingresos).reduce((a, b) => a + b, 0) * 100) / 100

  // ── Utilidad de tienda. Solo de las líneas con costo: inventarse el costo
  //    de las demás sería mentirse. Se reporta aparte cuánto no se sabe.
  const conCosto = ventas.filter(v => v.costo_unitario != null)
  const sinCosto = ventas.filter(v => v.costo_unitario == null)
  const utilidad = suma(conCosto, v => (v.precio_unitario - v.costo_unitario) * v.cantidad)
  const ventaConCosto = suma(conCosto, v => v.precio_unitario * v.cantidad)
  const ventaSinCosto = suma(sinCosto, v => v.precio_unitario * v.cantidad)

  // ── El cuadre. Es el número de control del periodo: lo que el sistema dice
  //    que debió haber en efectivo contra lo que de verdad se contó.
  const cortesCierre = cortes.filter(c => c.tipo === 'corte')
  const cuadre = {
    cortes: cortesCierre.length,
    esperado: suma(cortesCierre, c => c.total_esperado),
    contado: suma(cortesCierre, c => c.total_contado),
    diferencia: suma(cortesCierre, c => c.diferencia),
  }

  // ── Control por persona ─────────────────────────────────────────────────
  const porColaborador = {}
  const asegura = (id) => (porColaborador[id] ||= {
    id, nombre: nombre[id] || 'Sin nombre',
    cortes: 0, diferencia: 0, peorDiferencia: 0,
    ventas: 0, montoVendido: 0, manuales: 0, montoManual: 0,
    descuentos: 0, montoDescuento: 0, sinCosto: 0,
  })
  for (const c of cortesCierre) {
    if (!c.colaborador_id) continue
    const x = asegura(c.colaborador_id)
    x.cortes += 1
    x.diferencia += Number(c.diferencia || 0)
    x.peorDiferencia = Math.min(x.peorDiferencia, Number(c.diferencia || 0))
  }
  for (const v of ventas) {
    if (!v.vendedor_id) continue
    const x = asegura(v.vendedor_id)
    const importe = Number(v.precio_unitario || 0) * Number(v.cantidad || 0)
    x.ventas += 1
    x.montoVendido += importe
    if (v.origen && v.origen !== 'catalogo') { x.manuales += 1; x.montoManual += importe }
    if (v.descuento_tipo) { x.descuentos += 1; x.montoDescuento += Number(v.descuento_valor || 0) }
    if (v.costo_unitario == null) x.sinCosto += 1
  }
  const control = Object.values(porColaborador).map(x => ({
    ...x,
    diferencia: Math.round(x.diferencia * 100) / 100,
    montoVendido: Math.round(x.montoVendido * 100) / 100,
    montoManual: Math.round(x.montoManual * 100) / 100,
    // El porcentaje es lo que hace comparable a quien vende mucho con quien
    // vende poco: no importa el monto suelto, importa qué proporción de sus
    // ventas no pasó por el catálogo.
    pctManual: x.montoVendido > 0 ? Math.round((x.montoManual / x.montoVendido) * 1000) / 10 : 0,
  })).sort((a, b) => a.diferencia - b.diferencia)

  // ── Visitas ─────────────────────────────────────────────────────────────
  // Una persona que recoge su encargo y de paso compra algo en tienda genera
  // VARIOS renglones en `pagos` (uno por concepto y por método), todos dentro
  // del mismo segundo. Leídos sueltos no se entiende nada. Aquí se vuelven a
  // juntar en la transacción que realmente fueron.
  const VENTANA_MS = 5 * 60 * 1000
  const porPago = {}
  for (const v of ventas) {
    if (!v.pago_id) continue
    ;(porPago[v.pago_id] ||= []).push(v)
  }

  const ordenados = [...pagos].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
  const visitas = []
  for (const p of ordenados) {
    const quien = p.cliente_id || 'suelto'
    const previa = visitas.find(v =>
      v.quien === quien &&
      Math.abs(new Date(p.creado_en) - new Date(v.hasta)) <= VENTANA_MS
    )
    const destino = previa || (visitas.push({
      quien,
      cliente_id: p.cliente_id,
      nombre: nombre[p.cliente_id] || 'Cliente sin cuenta',
      desde: p.creado_en, hasta: p.creado_en,
      total: 0, metodos: {}, entregas: 0, anticipos: 0, tienda: 0, otros: 0,
      entregaIds: [], articulos: [],
    }), visitas[visitas.length - 1])

    destino.hasta = p.creado_en
    destino.total += Number(p.monto || 0)
    destino.metodos[p.metodo || 'Otro'] = Math.round(((destino.metodos[p.metodo || 'Otro'] || 0) + Number(p.monto || 0)) * 100) / 100
    destino[clase(p)] += Number(p.monto || 0)
    if (p.entrega_id && !destino.entregaIds.includes(p.entrega_id)) destino.entregaIds.push(p.entrega_id)
    for (const v of (porPago[p.id] || [])) {
      destino.articulos.push({
        nombre: v.nombre_producto, cantidad: v.cantidad,
        importe: Math.round(Number(v.precio_unitario || 0) * Number(v.cantidad || 0) * 100) / 100,
        manual: !!(v.origen && v.origen !== 'catalogo'),
      })
    }
  }

  // Qué recogió: los pedidos entregados de esa persona en esa entrega.
  const paresEntrega = [...new Set(visitas.flatMap(v => v.entregaIds.map(e => `${v.cliente_id}|${e}`)))]
  let pedidosEntregados = []
  if (paresEntrega.length) {
    const { data } = await supabase
      .from('pedidos')
      .select('cliente_id, entrega_id, descripcion, cantidad, precio_venta, estado')
      .in('entrega_id', [...new Set(visitas.flatMap(v => v.entregaIds))])
    pedidosEntregados = data || []
  }
  for (const v of visitas) {
    v.total = Math.round(v.total * 100) / 100
    v.entregas = Math.round(v.entregas * 100) / 100
    v.anticipos = Math.round(v.anticipos * 100) / 100
    v.tienda = Math.round(v.tienda * 100) / 100
    v.otros = Math.round(v.otros * 100) / 100
    // Sólo lo marcado como entregado: es lo que de verdad se llevó. Sin este
    // filtro aparecían también los artículos de la misma entrega que todavía
    // no recogía, y el ticket mentía.
    v.recogio = pedidosEntregados
      .filter(x => x.cliente_id === v.cliente_id && v.entregaIds.includes(x.entrega_id)
        && String(x.estado || '').toLowerCase() === 'entregado')
      .map(x => ({ descripcion: x.descripcion, cantidad: x.cantidad, precio: x.precio_venta }))
    delete v.quien
  }
  visitas.reverse()

  return NextResponse.json({
    ok: true,
    periodo: { desde, hasta },
    visitas,
    ingresos, porMetodo, total,
    tienda: {
      lineas: ventas.length,
      articulos: ventas.reduce((n, v) => n + Number(v.cantidad || 0), 0),
      utilidad,
      ventaConCosto,
      ventaSinCosto,
      lineasSinCosto: sinCosto.length,
      manuales: ventas.filter(v => v.origen && v.origen !== 'catalogo').length,
      montoManual: suma(ventas.filter(v => v.origen && v.origen !== 'catalogo'), v => v.precio_unitario * v.cantidad),
    },
    cuadre,
    control,
    retiros: retiros.map(r => ({ ...r, quien: nombre[r.admin_id] || 'Sin nombre' })),
    cancelados: cancelados.map(c => ({ ...c, quien: nombre[c.cancelado_por] || 'Sin nombre', cliente: nombre[c.cliente_id] || '—' })),
    comprobantesResueltos: huerfanosRes.count || 0,
  })
}
