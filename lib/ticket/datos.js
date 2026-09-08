import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { saldoDeGrupos } from '@/lib/estadosCuenta/dibujar'

// Arma el ticket de una transacción.
//
// El saldo pendiente NO se calcula aquí: se pide al mismo motor que dibuja el
// estado de cuenta. Si cada pantalla calculara el saldo a su manera, el número
// del ticket y el del estado de cuenta acabarían discrepando, y el cliente
// tendría dos papeles de la misma casa diciendo cosas distintas.

const VENTANA_MS = 5 * 60 * 1000

export async function cargarTicket(supabase, transaccionId) {
  const { data: tx, error } = await supabase
    .from('transacciones')
    .select('id, folio, canal, cliente_id, entrega_id, domicilio_id, vendedor_id, total, efectivo_recibido, cambio, nota, creado_en')
    .eq('id', transaccionId)
    .single()
  if (error || !tx) throw new Error('No se encontró esa transacción')

  const [pagosRes, ventasRes, genteRes] = await Promise.all([
    supabase.from('pagos')
      .select('id, monto, metodo, tipo, entrega_id')
      .eq('transaccion_id', tx.id)
      .order('creado_en', { ascending: true }),
    supabase.from('ventas_tienda')
      .select('id, nombre_producto, cantidad, precio_unitario')
      .eq('transaccion_id', tx.id),
    supabase.from('clientes').select('id, nombre, telefono')
      .in('id', [tx.cliente_id, tx.vendedor_id].filter(Boolean)),
  ])

  const gente = Object.fromEntries((genteRes.data || []).map(c => [c.id, c]))
  const pagos = pagosRes.data || []
  const ventas = ventasRes.data || []

  // Lo que se llevó en ese momento. Se busca por la hora real de entrega, que
  // el POS estampa en el mismo instante del cobro. Es la única forma fiable:
  // si el anticipo cubría todo, no hay ni un pago con esa fecha.
  let recogio = []
  if (tx.cliente_id) {
    const t = new Date(String(tx.creado_en).replace(' ', 'T')).getTime()
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('descripcion, cantidad, precio_venta, entregado_en')
      .eq('cliente_id', tx.cliente_id)
      .gte('entregado_en', new Date(t - VENTANA_MS).toISOString().slice(0, 19))
      .lte('entregado_en', new Date(t + VENTANA_MS).toISOString().slice(0, 19))
    recogio = (pedidos || []).map(p => ({
      descripcion: p.descripcion,
      cantidad: p.cantidad || 1,
      precio: Number(p.precio_venta || 0),
    }))
  }

  // Saldo que le queda de esa entrega, con la fórmula del estado de cuenta.
  let saldoPendiente = null
  if (tx.cliente_id && tx.entrega_id) {
    try {
      const lista = await cargarEstadosDeCuenta(supabase, tx.entrega_id)
      const suyo = lista.find(d => String(d.cliente.id) === String(tx.cliente_id))
      if (suyo) saldoPendiente = saldoDeGrupos(suyo.grupos)
    } catch {
      // Si no se puede calcular, el ticket no inventa un cero: omite el renglón.
      saldoPendiente = null
    }
  }

  const envio = pagos.filter(p => p.tipo === 'Envío').reduce((s, p) => s + Number(p.monto || 0), 0)

  // Por método, que es como el cliente lo recuerda ("te di en efectivo").
  const porMetodo = {}
  for (const p of pagos) {
    const m = p.metodo || 'Otro'
    porMetodo[m] = Math.round(((porMetodo[m] || 0) + Number(p.monto || 0)) * 100) / 100
  }

  return {
    folio: tx.folio,
    canal: tx.canal,
    fecha: tx.creado_en,
    cliente: {
      nombre: gente[tx.cliente_id]?.nombre || 'Cliente de mostrador',
      telefono: gente[tx.cliente_id]?.telefono || null,
    },
    atendio: gente[tx.vendedor_id]?.nombre || null,
    recogio,
    tienda: ventas.map(v => ({
      nombre: v.nombre_producto,
      cantidad: v.cantidad || 1,
      importe: Math.round(Number(v.precio_unitario || 0) * Number(v.cantidad || 1) * 100) / 100,
    })),
    metodos: Object.entries(porMetodo).map(([metodo, monto]) => ({ metodo, monto })),
    envio: Math.round(envio * 100) / 100,
    total: Number(tx.total || 0),
    efectivoRecibido: tx.efectivo_recibido != null ? Number(tx.efectivo_recibido) : null,
    cambio: tx.cambio != null ? Number(tx.cambio) : null,
    saldoPendiente,
    nota: tx.nota || null,
  }
}
