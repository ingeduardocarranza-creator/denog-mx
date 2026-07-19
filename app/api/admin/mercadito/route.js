import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Returns all pedidos_mercadito with client info, pagos map, and stock map
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const [pedidosRes, pagosRes, stockRes] = await Promise.all([
    supabase.from('pedidos_mercadito').select('*, clientes(nombre, telefono)').order('creado_en', { ascending: false }),
    supabase.from('pagos').select('pedido_mercadito_id, monto').not('pedido_mercadito_id', 'is', null),
    supabase.from('productos_tienda').select('id, stock'),
  ])

  const pagosPorPedido = {}
  for (const p of pagosRes.data || []) {
    pagosPorPedido[p.pedido_mercadito_id] = (pagosPorPedido[p.pedido_mercadito_id] || 0) + Number(p.monto || 0)
  }

  const stockPorProducto = Object.fromEntries((stockRes.data || []).map(p => [p.id, Number(p.stock) || 0]))

  return NextResponse.json({
    ok: true,
    pedidos: pedidosRes.data || [],
    pagosPorPedido,
    stockPorProducto,
  })
}

// Updates a pedido_mercadito (status change, items, notas, undo)
export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { id, patch, historialLabel, actorNombre, historialCompleto } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'id requerido' })

  // historialCompleto is used for undo (restores exact historial), otherwise we append
  let updatePayload
  if (historialCompleto !== undefined) {
    updatePayload = { ...patch, historial: historialCompleto }
  } else if (historialLabel) {
    const { data: actual } = await supabase.from('pedidos_mercadito').select('historial').eq('id', id).single()
    const nuevoHistorial = [
      ...(actual?.historial || []),
      { ts: new Date().toISOString(), label: historialLabel, actor_id: sesion.id, actor_nombre: actorNombre || null },
    ]
    updatePayload = { ...patch, historial: nuevoHistorial, actualizado_en: new Date().toISOString() }
  } else {
    updatePayload = { ...patch, actualizado_en: new Date().toISOString() }
  }

  const { error } = await supabase.from('pedidos_mercadito').update(updatePayload).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
