// Pedidos "empacado" que el sistema cree que siguen en tienda, agrupados por
// cliente y por entrega, para que el colaborador confirme si es cierto.
import { a10Digitos, paraWaMe } from '@/lib/whatsapp/telefono'

const fechaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date())

// incluirConfirmados=false (default en la lista del colaborador): oculta las
// entregas ya confirmadas por alguien (en tienda, entregado o no está).
export async function cargarPedidosEnTienda(supabase, { incluirConfirmados = false } = {}) {
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, cliente_id, entrega_id, descripcion, cantidad, precio_venta, imagen_url, foto_url, entregas!inner(fecha_entrega, estado)')
    .eq('estado', 'empacado')
    .eq('entregas.estado', 'en_tienda')
    .eq('pendiente_aprobacion', false)
    .not('devuelto', 'is', true)
    .limit(5000)
  if (error) throw new Error(error.message)

  const { data: confs } = await supabase.from('jarvis_confirmaciones').select('cliente_id, entrega_id')
  const hechas = new Set((confs || []).map(c => `${c.cliente_id}|${c.entrega_id}`))

  const porCliente = {}
  for (const p of pedidos || []) {
    if (!incluirConfirmados && hechas.has(`${p.cliente_id}|${p.entrega_id}`)) continue
    const c = porCliente[p.cliente_id] ||= { cliente_id: p.cliente_id, entregas: {}, desde: p.entregas.fecha_entrega }
    const e = c.entregas[p.entrega_id] ||= { entrega_id: p.entrega_id, fecha: p.entregas.fecha_entrega, piezas: 0, monto: 0, ids: [], items: [] }
    const cant = Number(p.cantidad) || 1
    e.piezas += cant
    e.monto += Number(p.precio_venta) || 0
    e.ids.push(p.id)
    e.items.push({ cantidad: cant, descripcion: p.descripcion, imagen: p.imagen_url || p.foto_url || null })
    if (p.entregas.fecha_entrega < c.desde) c.desde = p.entregas.fecha_entrega
  }
  const ids = Object.keys(porCliente)
  const { data: clientes } = ids.length
    ? await supabase.from('clientes').select('id, nombre, telefono').in('id', ids) : { data: [] }
  const hoy = fechaHoy()
  return Object.values(porCliente).map(c => {
    const cl = (clientes || []).find(x => x.id === c.cliente_id)
    const tel = a10Digitos(cl?.telefono)
    return {
      cliente_id: c.cliente_id, nombre: cl?.nombre || 'Cliente', telefono: tel || null, wa: tel ? paraWaMe(tel) : null,
      dias: Math.max(0, Math.round((new Date(`${hoy}T12:00:00Z`) - new Date(`${c.desde}T12:00:00Z`)) / 86400000)),
      desde: c.desde,
      entregas: Object.values(c.entregas).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
    }
  }).sort((a, b) => String(a.desde).localeCompare(String(b.desde)))
}

// Cierra pedidos como Entregado sin cobro: es la corrección de algo que el
// colaborador no marcó en su momento. entregado_en se deja vacío (no se conoce
// el día real) y se marca regularizado para poder distinguirlos siempre.
export async function cerrarComoEntregado(supabase, { ids, usuarioId, ahora }) {
  if (!ids?.length) return
  const { error } = await supabase.from('pedidos')
    .update({ estado: 'Entregado', regularizado_en: ahora, regularizado_por: usuarioId })
    .in('id', ids).eq('estado', 'empacado')
  if (error) throw new Error(error.message)
}
