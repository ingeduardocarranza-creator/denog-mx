// Ticket de "ya te lo entregué" para cuando alguien recoge un pedido que ya
// estaba pagado — no hubo cobro nuevo, así que no hay transaccion_id del que
// partir (a diferencia de cargarTicket, que sí necesita uno). Aquí se arma el
// mismo tipo de datos a mano, a partir de lo último que se marcó "Entregado"
// para ese cliente.

import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { saldoDeGrupos } from '@/lib/estadosCuenta/dibujar'

const VENTANA_MS = 5 * 60 * 1000

const fmtFolioEntrega = (f) => {
  const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const d = new Date(String(f).replace(' ', 'T'))
  if (isNaN(d)) return 'ENTREGA'
  return `ENT-${String(d.getDate()).padStart(2, '0')}${meses[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`
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
    .select('entregado_en')
    .eq('cliente_id', clienteId)
    .not('entregado_en', 'is', null)
    .order('entregado_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eUltimo) throw new Error(eUltimo.message)
  if (!ultimo?.entregado_en) throw new Error('Ese cliente no tiene ninguna entrega marcada todavía')

  const momento = ultimo.entregado_en
  const t = new Date(String(momento).replace(' ', 'T')).getTime()

  const { data: pedidos, error: ePedidos } = await supabase
    .from('pedidos')
    .select('descripcion, cantidad, precio_venta, entrega_id, entregado_en')
    .eq('cliente_id', clienteId)
    .gte('entregado_en', new Date(t - VENTANA_MS).toISOString().slice(0, 19))
    .lte('entregado_en', new Date(t + VENTANA_MS).toISOString().slice(0, 19))
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

  return {
    folio: fmtFolioEntrega(momento),
    canal: 'mostrador',
    fecha: momento,
    cliente: { nombre: cliente.nombre, telefono: cliente.telefono },
    atendio: null,
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
