import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'
import { a10Digitos } from '@/lib/whatsapp/telefono'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Estados de pedido que no cuentan para lo que el cliente debe de esa entrega.
const NO_COBRABLES = ['cancelado', 'no_llego']

// Devuelve todo lo que necesita la sesión de captura de una entrega:
//
//   1. roster  — la lista alfabética de quienes compraron en esa entrega,
//                con lo que compraron, lo que ya abonaron y su saldo. Es el
//                orden real de trabajo: se va uno por uno.
//   2. bandeja — comprobantes de WhatsApp que todavía no se convirtieron en
//                pago, cada uno con el cliente y la entrega que el sistema
//                propone. Incluye los que alguien marcó "resuelto" sin haber
//                registrado el pago (el bug histórico), para poder repararlos.
//   3. cuadre  — el cierre: vendido, cobrado, saldo y comprobantes sin aplicar.
export async function GET(req) {
  // Solo admin: esta pantalla muestra el dinero completo de una entrega.
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entrega_id = searchParams.get('entrega_id')
  if (!entrega_id) return NextResponse.json({ ok: false, mensaje: 'entrega_id requerido' })

  const [entregaRes, pedidosRes, pagosRes, clientesRes, compRes] = await Promise.all([
    supabase.from('entregas').select('id, fecha_entrega, nota, estado').eq('id', entrega_id).single(),

    supabase.from('pedidos')
      .select('id, cliente_id, descripcion, precio_venta, cantidad, estado')
      .eq('entrega_id', entrega_id)
      // Borradores de WhatsApp y descartados no son mercancía.
      .eq('pendiente_aprobacion', false)
      .neq('estado', 'descartado'),

    supabase.from('pagos')
      .select('id, cliente_id, monto, metodo, tipo, creado_en, pendiente_id')
      .eq('entrega_id', entrega_id)
      .order('creado_en', { ascending: true }),

    supabase.from('clientes').select('id, nombre, telefono').neq('rol', 'admin'),

    // Bandeja: comprobantes abiertos + los resueltos que nunca generaron pago.
    supabase.from('pendientes')
      .select('id, estado, cliente_id, telefono_whatsapp, nombre_whatsapp, resumen, monto, monto_no_coincide, imagen_url, creado_en, resuelto_en')
      .eq('tipo', 'comprobante')
      .in('estado', ['nuevo', 'visto', 'resuelto'])
      .order('creado_en', { ascending: true }),
  ])

  if (entregaRes.error) return NextResponse.json({ ok: false, mensaje: entregaRes.error.message })

  const pedidos = pedidosRes.data || []
  const pagos = pagosRes.data || []
  const clientes = clientesRes.data || []
  const porId = Object.fromEntries(clientes.map(c => [c.id, c]))

  // --- 1. Roster alfabético de la entrega ---------------------------------
  const roster = {}
  for (const p of pedidos) {
    if (!p.cliente_id) continue
    if (NO_COBRABLES.includes((p.estado || '').toLowerCase())) continue
    const r = roster[p.cliente_id] || (roster[p.cliente_id] = {
      cliente_id: p.cliente_id,
      nombre: porId[p.cliente_id]?.nombre || 'Sin nombre',
      telefono: porId[p.cliente_id]?.telefono || null,
      articulos: 0, total: 0, pagos: [], pagado: 0, saldo: 0,
    })
    r.articulos += 1
    r.total += Number(p.precio_venta || 0)
  }
  for (const g of pagos) {
    if (!g.cliente_id || !roster[g.cliente_id]) continue
    roster[g.cliente_id].pagos.push(g)
    roster[g.cliente_id].pagado += Number(g.monto || 0)
  }

  const lista = Object.values(roster).map(r => {
    const saldo = Math.round((r.total - r.pagado) * 100) / 100
    return {
      ...r,
      saldo,
      estado: r.pagado <= 0 ? 'sin_anticipo' : saldo > 0.5 ? 'parcial' : saldo < -0.5 ? 'a_favor' : 'liquidado',
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  // --- 2. Bandeja de comprobantes -----------------------------------------
  const comprobantes = compRes.data || []
  const idsComp = comprobantes.map(c => c.id)
  let aplicados = new Set()
  if (idsComp.length) {
    const { data } = await supabase.from('pagos').select('pendiente_id').in('pendiente_id', idsComp)
    aplicados = new Set((data || []).map(p => p.pendiente_id))
  }

  // Un comprobante ya aplicado no vuelve a la bandeja. Uno "resuelto" sin
  // pago sí — es dinero que se perdió en el camino y hay que recuperarlo.
  const sinAplicar = comprobantes.filter(c => !aplicados.has(c.id))

  // Para proponer cliente cuando el teléfono no estaba ligado al llegar.
  const porTelefono = {}
  for (const c of clientes) {
    const d = a10Digitos(c.telefono || '')
    if (d) porTelefono[d] = c
  }

  // Todas las fotos de comprobante en una sola firma, no una por comprobante.
  const firmadas = await urlsFirmadas(supabase, sinAplicar.map(c => c.imagen_url), 3600)

  const bandeja = await Promise.all(sinAplicar.map(async c => {
    const sugerido = c.cliente_id
      ? porId[c.cliente_id]
      : porTelefono[a10Digitos(c.telefono_whatsapp || '') || ''] || null

    const enEntrega = sugerido ? lista.find(r => r.cliente_id === sugerido.id) : null

    // Aviso de posible duplicado: un pago del mismo cliente, mismo monto,
    // dentro de los 3 días del comprobante. No bloquea; avisa antes.
    let posible_duplicado = null
    if (sugerido && c.monto) {
      const { data: parecidos } = await supabase
        .from('pagos')
        .select('id, monto, creado_en, entrega_id')
        .eq('cliente_id', sugerido.id)
        .eq('monto', c.monto)
        .gte('creado_en', new Date(new Date(c.creado_en).getTime() - 3 * 864e5).toISOString())
        .lte('creado_en', new Date(new Date(c.creado_en).getTime() + 3 * 864e5).toISOString())
      if (parecidos?.length) posible_duplicado = parecidos[0]
    }

    return {
      ...c,
      imagen_url: !c.imagen_url ? null
        : c.imagen_url.startsWith('http') ? c.imagen_url
        : (firmadas[c.imagen_url] || null),
      cliente_sugerido: sugerido ? { id: sugerido.id, nombre: sugerido.nombre } : null,
      en_esta_entrega: !!enEntrega,
      saldo_en_esta_entrega: enEntrega ? enEntrega.saldo : null,
      // El bug histórico: marcado resuelto pero el pago nunca se creó.
      huerfano_resuelto: c.estado === 'resuelto',
      posible_duplicado,
    }
  }))

  // Orden de la bandeja por urgencia real, no por fecha. Con 119 comprobantes
  // sin aplicar, lo que decide si la lista sirve o se abandona es qué sale
  // primero: el dinero que se perdió, luego quien está en esta entrega.
  const rango = (b) => {
    if (b.huerfano_resuelto) return 0
    if (b.en_esta_entrega && b.saldo_en_esta_entrega > 0) return 1
    if (b.en_esta_entrega) return 2
    if (b.cliente_sugerido) return 3
    return 4
  }
  bandeja.sort((a, b) => rango(a) - rango(b) || new Date(b.creado_en) - new Date(a.creado_en))

  // --- 3. Cuadre de cierre -------------------------------------------------
  const vendido = lista.reduce((s, r) => s + r.total, 0)
  const cobrado = lista.reduce((s, r) => s + r.pagado, 0)

  return NextResponse.json({
    ok: true,
    entrega: entregaRes.data,
    roster: lista,
    bandeja,
    cuadre: {
      clientes: lista.length,
      vendido: Math.round(vendido * 100) / 100,
      cobrado: Math.round(cobrado * 100) / 100,
      saldo: Math.round((vendido - cobrado) * 100) / 100,
      liquidados: lista.filter(r => r.estado === 'liquidado').length,
      sin_anticipo: lista.filter(r => r.estado === 'sin_anticipo').length,
      comprobantes_sin_aplicar: bandeja.length,
      huerfanos: bandeja.filter(b => b.huerfano_resuelto).length,
      comprobantes_de_esta_entrega: bandeja.filter(b => b.en_esta_entrega).length,
    },
  })
}
