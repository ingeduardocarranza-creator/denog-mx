// Ticket de "ya te lo entregué" para cuando alguien recoge un pedido que ya
// estaba pagado — no hubo cobro nuevo, así que no hay transaccion_id del que
// partir (a diferencia de cargarTicket, que sí necesita uno). Aquí se arma el
// mismo tipo de datos a mano, a partir de lo último que se marcó "Entregado"
// para ese cliente.

import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { saldoDeGrupos } from '@/lib/estadosCuenta/dibujar'

const VENTANA_MS = 5 * 60 * 1000

// entregado_en llega de Postgres como timestamp "ingenuo" (sin zona), p.ej.
// "2026-09-08 18:46:29" — son los mismos dígitos de reloj que ve el POS, sin
// convertir. Para hacer aritmética con esto SIN que el resultado dependa de
// en qué zona horaria corre el proceso de Node (Vercel = UTC, la Mac de Lalo
// = Hermosillo/UTC-7), lo tratamos como si fuera UTC de ida y de vuelta: se
// interpreta agregando "Z", y al formatear de regreso se usan los getters
// UTC. Así el "redondeo" de ida y vuelta no le suma ni le resta horas — antes
// se parseaba como hora LOCAL pero se volvía a formatear con toISOString()
// (que siempre da UTC), y esa mezcla desfasaba la ventana de búsqueda por el
// offset del servidor (7 horas en Hermosillo), dejándola sin encontrar nada.
const aFechaUTC = (naive) => new Date(String(naive).replace(' ', 'T') + 'Z')
const aNaive = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

// Folio simple tipo "E-N", mismo estilo que el "M-N" de mostrador — un
// contador atómico en la tabla folios (función siguiente_folio en Postgres),
// no un folio armado con la fecha.
async function siguienteFolioEntrega(supabase) {
  const { data, error } = await supabase.rpc('siguiente_folio', { p_canal: 'entrega', p_prefijo: 'E-' })
  if (error || !data) return 'ENTREGA'
  return data
}

export async function cargarTicketDeEntrega(supabase, clienteId) {
  const { data: cliente, error: eCliente } = await supabase
    .from('clientes').select('id, nombre, telefono').eq('id', clienteId).single()
  if (eCliente || !cliente) throw new Error('No se encontró ese cliente')

  // El momento de entrega es el que el propio POS/panel estampa al marcar
  // "Entregado" — se toma el más reciente, y de ahí una ventana de 5 minutos
  // para agrupar lo que se recogió junto (mismo criterio que cargarTicket).
  const { data: ultimo, error: eUltimo } = await supabase
    .from('pedidos')
    .select('entregado_en, entregado_por')
    .eq('cliente_id', clienteId)
    .not('entregado_en', 'is', null)
    .order('entregado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eUltimo) throw new Error(eUltimo.message)
  if (!ultimo?.entregado_en) throw new Error('Ese cliente no tiene ninguna entrega marcada todavía')

  const momento = ultimo.entregado_en
  const t = aFechaUTC(momento).getTime()

  const { data: pedidos, error: ePedidos } = await supabase
    .from('pedidos')
    .select('descripcion, cantidad, precio_venta, entrega_id, entregado_en, entregado_por')
    .eq('cliente_id', clienteId)
    .gte('entregado_en', aNaive(t - VENTANA_MS))
    .lte('entregado_en', aNaive(t + VENTANA_MS))
  if (ePedidos) throw new Error(ePedidos.message)

  const recogio = (pedidos || []).map(p => ({
    descripcion: p.descripcion,
    cantidad: p.cantidad || 1,
    precio: Number(p.precio_venta || 0),
  }))

  // El saldo real (para avisar si de casualidad queda algo pendiente en otra
  // entrega) sale del mismo motor que el estado de cuenta — cualquier
  // entrega_id de las suyas sirve de ancla, porque igual junta TODOS sus
  // grupos, no solo el de esa entrega. Ver cargarEstadosDeCuenta.
  let saldoPendiente = 0
  const entregaAncla = (pedidos || []).find(p => p.entrega_id)?.entrega_id
  if (entregaAncla) {
    try {
      const lista = await cargarEstadosDeCuenta(supabase, entregaAncla)
      const suyo = lista.find(d => String(d.cliente.id) === String(clienteId))
      if (suyo) saldoPendiente = saldoDeGrupos(suyo.grupos)
    } catch {
      saldoPendiente = null
    }
  }

  // Quién estaba en el POS cobrando/entregando en ese momento (columna
  // entregado_por, estampada por /api/pedidos/actualizar-estado). Puede
  // venir vacía en entregas marcadas antes de que existiera esa columna —
  // ahí quien manda el ticket puede pasar un atendio explícito como respaldo.
  const atendio = (pedidos || []).find(p => p.entregado_por)?.entregado_por || ultimo.entregado_por || null

  return {
    folio: await siguienteFolioEntrega(supabase),
    canal: 'mostrador',
    fecha: momento,
    cliente: { nombre: cliente.nombre, telefono: cliente.telefono },
    atendio,
    recogio,
    tienda: [],
    metodos: [],
    envio: 0,
    total: 0,
    efectivoRecibido: null,
    cambio: null,
    saldoPendiente,
    nota: 'Entrega de tu pedido — ya estaba pagado.',
  }
}
