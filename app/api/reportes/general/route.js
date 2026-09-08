import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { traerTodo } from '@/lib/traerTodo'

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
// El reporte se cae entero si una sola consulta falla, y así debe ser: media
// verdad en una pantalla de control es peor que ninguna. Pero tiene que decir
// QUÉ falló. Antes, un error aquí llegaba al navegador como un 500 pelón, la
// pantalla se quedaba en blanco y parecía que "no había datos". Fue lo que pasó
// cuando salió que `pagos_cancelados` no tenía permisos de lectura.
export async function GET(req) {
  try {
    return await armarReporte(req)
  } catch (e) {
    return NextResponse.json(
      { ok: false, mensaje: `No se pudo armar el reporte: ${e.message}` },
      { status: 500 }
    )
  }
}

async function armarReporte(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  if (!desde || !hasta) return NextResponse.json({ ok: false, mensaje: 'Faltan fechas' })

  const ini = `${desde}T00:00:00`
  const fin = `${hasta}T23:59:59`

  const [pagos, ventas, cortes, retiros, cancelados, listaClientes, huerfanosRes] = await Promise.all([
    traerTodo((a, b) => supabase.from('pagos').select('id, monto, metodo, tipo, entrega_id, creado_en, vendedor_id, cliente_id')
      .gte('creado_en', ini).lte('creado_en', fin).range(a, b)),
    traerTodo((a, b) => supabase.from('ventas_tienda')
      .select('id, pago_id, nombre_producto, categoria, cantidad, precio_unitario, costo_unitario, vendedor_id, origen, descuento_tipo, descuento_valor, creado_en')
      .gte('creado_en', ini).lte('creado_en', fin).range(a, b)),
    traerTodo((a, b) => supabase.from('cortes_caja').select('id, colaborador_id, tipo, total_contado, total_esperado, diferencia, justificacion, creado_en, desde, hasta, total_efectivo, total_transferencia, total_terminal')
      .gte('creado_en', ini).lte('creado_en', fin).range(a, b)),
    traerTodo((a, b) => supabase.from('retiros_caja').select('id, admin_id, monto, motivo, estado, creado_en')
      .gte('creado_en', ini).lte('creado_en', fin).range(a, b)),
    traerTodo((a, b) => supabase.from('pagos_cancelados').select('id, monto, metodo, cancelado_por, cancelado_en, cancelado_motivo, cliente_id')
      .gte('cancelado_en', ini).lte('cancelado_en', fin).range(a, b)),
    traerTodo((a, b) => supabase.from('clientes').select('id, nombre').range(a, b)),
    supabase.from('pendientes').select('id', { count: 'exact', head: true })
      .eq('tipo', 'comprobante').eq('estado', 'resuelto'),
  ])

  const nombre = Object.fromEntries(listaClientes.map(c => [c.id, c.nombre]))

  const pagosDeTienda = new Set(ventas.map(v => v.pago_id).filter(Boolean))
  const clase = (p) =>
    pagosDeTienda.has(p.id) ? 'tienda'
    // El envío a domicilio es ingreso por servicio, no venta de mercancía.
    // Sin esta línea caería en 'otros' y parecería un flujo sin clasificar.
    : p.tipo === 'Envío' ? 'envios'
    : p.tipo === 'Anticipo' ? 'anticipos'
    : p.entrega_id ? 'entregas'
    : 'otros'

  const suma = (arr, f = x => x.monto) => Math.round(arr.reduce((s, x) => s + Number(f(x) || 0), 0) * 100) / 100

  const ingresos = { entregas: 0, anticipos: 0, tienda: 0, envios: 0, otros: 0 }
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
  const idsEntregas = [...new Set(visitas.flatMap(v => v.entregaIds))]
  let pedidosEntregados = []
  if (idsEntregas.length) {
    pedidosEntregados = await traerTodo((a, b) => supabase
      .from('pedidos')
      .select('cliente_id, entrega_id, descripcion, cantidad, precio_venta, estado')
      .in('entrega_id', idsEntregas)
      .range(a, b))
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

  // ── Visitas donde no se cobró nada ──────────────────────────────────────
  // Las visitas se armaban recorriendo `pagos`. Quien ya había pagado todo por
  // adelantado no genera ningún renglón al recoger, así que su visita no salía
  // en el reporte: la mercancía se iba y no quedaba constancia.
  // Caso que lo destapó: Ingrid Gutiérrez, anticipo de $295 el 14 de agosto,
  // recogió su pedido de $295 el 7 de septiembre, no debía nada, no apareció.
  // Se rescatan por `entregado_en`, que es la hora real en que se llevó.
  const recogidasPeriodo = await traerTodo((a, b) => supabase
    .from('pedidos')
    .select('cliente_id, entrega_id, descripcion, cantidad, precio_venta, entregado_en')
    .gte('entregado_en', ini).lte('entregado_en', fin).range(a, b))

  const cerca = (a, b) => Math.abs(new Date(a) - new Date(b)) <= VENTANA_MS
  const sinCobro = []
  for (const r of recogidasPeriodo) {
    if (!r.cliente_id || !r.entregado_en) continue
    // Si esa persona ya tiene una visita a esa hora, o una visita que cobró
    // algo de esta misma entrega, el pedido ya está contado ahí.
    const yaContado = visitas.some(v => v.cliente_id === r.cliente_id && (
      (r.entrega_id && v.entregaIds.includes(r.entrega_id)) ||
      cerca(r.entregado_en, v.desde) || cerca(r.entregado_en, v.hasta)
    ))
    if (yaContado) continue

    let g = sinCobro.find(v => v.cliente_id === r.cliente_id && cerca(r.entregado_en, v.hasta))
    if (!g) {
      g = {
        cliente_id: r.cliente_id,
        nombre: nombre[r.cliente_id] || 'Cliente sin cuenta',
        desde: r.entregado_en, hasta: r.entregado_en,
        total: 0, metodos: {}, entregas: 0, anticipos: 0, tienda: 0, otros: 0,
        entregaIds: [], articulos: [], recogio: [],
        // No entró dinero: ya estaba pagado antes de este periodo.
        sinCobro: true, valorRecogido: 0,
      }
      sinCobro.push(g)
    }
    if (r.entregado_en < g.desde) g.desde = r.entregado_en
    if (r.entregado_en > g.hasta) g.hasta = r.entregado_en
    if (r.entrega_id && !g.entregaIds.includes(r.entrega_id)) g.entregaIds.push(r.entrega_id)
    g.recogio.push({ descripcion: r.descripcion, cantidad: r.cantidad, precio: r.precio_venta })
    g.valorRecogido += Number(r.precio_venta || 0) * Number(r.cantidad || 0)
  }
  for (const g of sinCobro) g.valorRecogido = Math.round(g.valorRecogido * 100) / 100
  visitas.push(...sinCobro)
  visitas.sort((a, b) => new Date(b.desde) - new Date(a.desde))

  // ── Cuadre de cada corte contra lo que hay en `pagos` ───────────────────
  // Lo que el corte anotó por método, en el momento en que se tomó, contra lo
  // que hoy queda registrado en ese mismo periodo. Si no coincide, algo se
  // borró o se capturó después. Así se destapó el bug del POS que borraba
  // anticipos: el corte del 5 sep había anotado $12,217.50 de transferencias
  // y en `pagos` quedaban $9,537.50 — los $2,680 de Lupita Sifuentes.
  //
  // Un corte SIN `desde` no se puede cuadrar: no se sabe qué periodo cubre.
  // Adivinar la ventana daba disparates (cortes con $40,128 en 73 minutos),
  // así que esos se marcan como no conciliables en vez de inventar una cifra.
  const cuadreCortes = cortesCierre.map(c => {
    // Sin periodo, o con un periodo que empieza antes del rango del reporte:
    // en los dos casos faltan pagos para comparar y saldría un descuadre
    // falso. Mejor decir que no se puede cuadrar.
    if (!c.desde || c.desde < desde) {
      return {
        id: c.id, creado_en: c.creado_en,
        quien: nombre[c.colaborador_id] || 'Sin responsable',
        conciliable: false,
        motivo: !c.desde ? 'El corte no registró qué periodo cubre' : 'Su periodo empieza antes del rango consultado',
      }
    }
    // El fin de la ventana es el que el corte midió, no la hora de guardar:
    // entre una cosa y la otra el colaborador estuvo contando billetes, y un
    // cobro hecho en ese rato no está en sus totales. Los cortes viejos no
    // guardaron `hasta`; para ellos se usa `creado_en`, como antes.
    const fin = c.hasta || c.creado_en
    const enVentana = (metodo) => Math.round(pagos
      .filter(p => p.metodo === metodo && p.creado_en >= c.desde && p.creado_en <= fin)
      .reduce((t, p) => t + Number(p.monto || 0), 0) * 100) / 100

    const metodos = ['Efectivo', 'Transferencia', 'Terminal'].map(m => {
      const clave = m === 'Efectivo' ? 'total_efectivo' : m === 'Transferencia' ? 'total_transferencia' : 'total_terminal'
      const anoto = Number(c[clave] || 0)
      const hay = enVentana(m)
      return { metodo: m, anoto, hay, diferencia: Math.round((anoto - hay) * 100) / 100 }
    })

    return {
      id: c.id,
      creado_en: c.creado_en,
      desde: c.desde,
      hasta: fin,
      quien: nombre[c.colaborador_id] || 'Sin responsable',
      conciliable: true,
      metodos,
      // Positivo = el corte contó dinero que hoy ya no está en `pagos`.
      descuadre: Math.round(metodos.reduce((t, m) => t + m.diferencia, 0) * 100) / 100,
    }
  })

  const cortesDescuadrados = cuadreCortes.filter(c => c.conciliable && Math.abs(c.descuadre) > 0.5)

  return NextResponse.json({
    ok: true,
    periodo: { desde, hasta },
    visitas,
    cuadreCortes,
    alertaCortes: {
      revisados: cuadreCortes.filter(c => c.conciliable).length,
      sin_periodo: cuadreCortes.filter(c => !c.conciliable).length,
      descuadrados: cortesDescuadrados.length,
      monto: Math.round(cortesDescuadrados.reduce((t, c) => t + Math.abs(c.descuadre), 0) * 100) / 100,
      faltante: Math.round(cortesDescuadrados.filter(c => c.descuadre > 0).reduce((t, c) => t + c.descuadre, 0) * 100) / 100,
      sobrante: Math.round(cortesDescuadrados.filter(c => c.descuadre < 0).reduce((t, c) => t - c.descuadre, 0) * 100) / 100,
    },
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
