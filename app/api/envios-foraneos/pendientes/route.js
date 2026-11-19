import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Clientes con piezas listas para mandar por paquetería.
//
// "Pendiente de enviar" = pedido en estado 'empacado' (ya está en tienda,
// empacado) que todavía no viaja en un envío foráneo activo (borrador,
// aprobado o notificado). Las piezas 'comprado' (aún no llegan) no se pueden
// mandar; solo se cuentan para avisar "faltan N por llegar".
//
// GET -> { ok, clientes: [{ id, nombre, telefono, listas, faltan, piezas: [...] }] }
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { data: activos, error: e0 } = await supabase
    .from('envios_foraneos')
    .select('pedido_ids')
    .in('estado', ['borrador', 'aprobado', 'notificado'])
  if (e0) return NextResponse.json({ ok: false, mensaje: e0.message })
  const yaEnEnvio = new Set((activos || []).flatMap(e => e.pedido_ids || []))

  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, cliente_id, descripcion, cantidad, apartado_fragil, imagen_url, estado, entrega_id, entregas(fecha_entrega)')
    .in('estado', ['empacado', 'comprado'])
    .eq('pendiente_aprobacion', false)
    .or('devuelto.is.null,devuelto.eq.false')
    .limit(5000)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const listas = (pedidos || []).filter(p => p.estado === 'empacado' && !yaEnEnvio.has(p.id))
  const porLlegar = (pedidos || []).filter(p => p.estado === 'comprado')

  const clienteIds = [...new Set(listas.map(p => p.cliente_id))]
  if (clienteIds.length === 0) return NextResponse.json({ ok: true, clientes: [] })

  const { data: clientes } = await supabase.from('clientes').select('id, nombre, telefono').in('id', clienteIds)
  const firmadas = await urlsFirmadas(supabase, listas.map(p => p.imagen_url), 3600)

  const faltanPorCliente = {}
  for (const p of porLlegar) faltanPorCliente[p.cliente_id] = (faltanPorCliente[p.cliente_id] || 0) + 1

  const resultado = (clientes || []).map(c => {
    const piezas = listas.filter(p => p.cliente_id === c.id).map(p => ({
      id: p.id,
      nombre: p.descripcion,
      cantidad: p.cantidad || 1,
      fragil: !!p.apartado_fragil,
      entrega_id: p.entrega_id,
      entrega_fecha: p.entregas?.fecha_entrega || null,
      foto: !p.imagen_url ? null : p.imagen_url.startsWith('http') ? p.imagen_url : (firmadas[p.imagen_url] || null),
    }))
    return { id: c.id, nombre: c.nombre, telefono: c.telefono, listas: piezas.length, faltan: faltanPorCliente[c.id] || 0, piezas }
  }).sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))

  return NextResponse.json({ ok: true, clientes: resultado })
}
