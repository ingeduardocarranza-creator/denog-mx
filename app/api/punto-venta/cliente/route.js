import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Returns all data needed when a client is selected at the POS:
// pending orders, mercadito orders with payments, and available anticipos.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  if (!cliente_id) return NextResponse.json({ ok: false, mensaje: 'cliente_id requerido' })

  const [pedidosRes, mercaditoRes, anticiposRes] = await Promise.all([
    // Mismo criterio que el estado de cuenta (lib/estadosCuenta/datosServidor.js):
    // un pedido que sigue en 'pendiente_aprobacion' es un BORRADOR que armó la IA
    // desde WhatsApp — todavía no es una compra. Los descartados son borradores
    // rechazados. Sin este filtro el POS le cobraba al cliente mercancía que
    // nunca existió, y el saldo no coincidía con su estado de cuenta.
    supabase
      .from('pedidos')
      .select('*')
      .eq('cliente_id', cliente_id)
      .eq('pendiente_aprobacion', false)
      .not('estado', 'in', '("Pagado","Entregado","Cancelado","no_llego","pendiente","descartado")'),

    supabase
      .from('pedidos_mercadito')
      .select('id, folio, items, creado_en')
      .eq('cliente_id', cliente_id)
      .in('estado', ['aprobado', 'agregado']),

    supabase
      .from('pagos')
      .select('id, monto, creado_en, entrega_id')
      .eq('cliente_id', cliente_id)
      .eq('tipo', 'Anticipo')
      .order('creado_en', { ascending: true }),
  ])

  // Mismo criterio que /api/reportes/pedidos: la foto de un pedido que llegó
  // por WhatsApp es una ruta dentro del bucket privado 'whatsapp-media', no
  // una URL usable directo en <img>. Se manda convertida en un campo aparte
  // (imagen_url_firmada) — imagen_url sigue siendo la ruta permanente.
  const filasPedidos = pedidosRes.data || []
  const firmadas = await urlsFirmadas(supabase, filasPedidos.map(p => p.imagen_url), 3600)
  const pedidos = filasPedidos.map(p => ({
    ...p,
    imagen_url_firmada: !p.imagen_url ? null
      : p.imagen_url.startsWith('http') ? p.imagen_url
      : (firmadas[p.imagen_url] || null),
  }))
  const mercadito = mercaditoRes.data || []
  const todosAnticipos = anticiposRes.data || []

  // El POS necesita saber si la mercancía ya llegó. Una entrega "en proceso"
  // se muestra, pero bloqueada: el colaborador ve que el encargo existe (para
  // no decirle al cliente que no tiene nada) y aun así no lo puede cobrar.
  const idsEntregas = [...new Set(pedidos.map(p => p.entrega_id).filter(Boolean))]
  let entregas = []
  if (idsEntregas.length > 0) {
    const { data } = await supabase
      .from('entregas')
      .select('id, fecha_entrega, estado, nota')
      .in('id', idsEntregas)
    entregas = data || []

    // La cuenta de cada entrega, para que la pantalla calcule lo mismo que el
    // servidor: mercancia que el cliente YA se llevo de esa entrega, y todo lo
    // que ya abono ahi (anticipos incluidos). Sin esto, una entrega cobrada en
    // dos vueltas descontaria el mismo anticipo dos veces.
    const [{ data: pedsEnt }, { data: pagosEnt }] = await Promise.all([
      supabase.from('pedidos')
        .select('entrega_id, precio_venta')
        .eq('cliente_id', cliente_id)
        .eq('pendiente_aprobacion', false)
        .eq('estado', 'Entregado')
        .in('entrega_id', idsEntregas),
      // Sin los envíos: pagan el domicilio, no la mercancía.
      supabase.from('pagos')
        .select('entrega_id, monto')
        .eq('cliente_id', cliente_id)
        .neq('tipo', 'Envío')
        .in('entrega_id', idsEntregas),
    ])
    const yaEnt = {}, pagEnt = {}
    for (const x of (pedsEnt || [])) yaEnt[x.entrega_id] = (yaEnt[x.entrega_id] || 0) + Number(x.precio_venta || 0)
    for (const x of (pagosEnt || [])) pagEnt[x.entrega_id] = (pagEnt[x.entrega_id] || 0) + Number(x.monto || 0)
    entregas = entregas.map(e => ({ ...e, ya_entregado: yaEnt[e.id] || 0, pagado: pagEnt[e.id] || 0 }))
  }

  // Un anticipo que ya quedó atribuido a una entrega liquidada NO se vuelve a
  // ofrecer: ya se gastó. Se muestran los generales (sin entrega) y los de las
  // entregas que el cliente todavía tiene pendientes. Antes esto no hacía falta
  // porque el cobro BORRABA el anticipo al usarlo — y con él, el registro del
  // dinero. Ahora la fila se conserva, así que el filtro va aquí.
  const anticipos = todosAnticipos.filter(a => !a.entrega_id || idsEntregas.includes(a.entrega_id))

  // Fetch payments already made on the mercadito orders to calculate balance
  let pagosMercadito = []
  const idsMercadito = mercadito.map(m => m.id)
  if (idsMercadito.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('pedido_mercadito_id, monto')
      .in('pedido_mercadito_id', idsMercadito)
    pagosMercadito = data || []
  }

  const mercaditoConSaldo = mercadito.map(pm => {
    const total = (pm.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
    const pagado = pagosMercadito.filter(pg => pg.pedido_mercadito_id === pm.id).reduce((s, pg) => s + Number(pg.monto || 0), 0)
    return { ...pm, total, pagado, saldo: Math.max(0, total - pagado) }
  })

  return NextResponse.json({ ok: true, pedidos, mercadito: mercaditoConSaldo, anticipos, entregas })
}
