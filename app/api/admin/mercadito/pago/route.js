import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Registers a payment for a mercadito order, optionally advancing estado to 'aprobado'
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { pedidoId, clienteId, monto, metodo, estadoActual, actorNombre } = await req.json()

  if (!pedidoId || !monto || monto <= 0) return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' })
  if (!['Efectivo', 'Transferencia', 'Terminal'].includes(metodo)) {
    return NextResponse.json({ ok: false, mensaje: 'Método de pago inválido' })
  }

  const { error } = await supabase.from('pagos').insert({
    cliente_id: clienteId || null,
    pedido_mercadito_id: pedidoId,
    entrega_id: null,
    monto,
    metodo,
    tipo: 'Anticipo',
    vendedor_id: sesion.id,
  })
  if (error) return NextResponse.json({ ok: false, mensaje: 'No se pudo registrar el pago.' })

  // If order was waiting for anticipo, advance to aprobado
  if (estadoActual === 'confirmado' || estadoActual === 'esperando_anticipo') {
    const { data: actual } = await supabase.from('pedidos_mercadito').select('historial').eq('id', pedidoId).single()
    const label = `Anticipo recibido: $${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${metodo})`
    const nuevoHistorial = [
      ...(actual?.historial || []),
      { ts: new Date().toISOString(), label, actor_id: sesion.id, actor_nombre: actorNombre || null },
    ]
    await supabase.from('pedidos_mercadito').update({
      estado: 'aprobado',
      anticipo_estado: 'recibido',
      historial: nuevoHistorial,
      actualizado_en: new Date().toISOString(),
    }).eq('id', pedidoId)
  } else {
    const { data: actual } = await supabase.from('pedidos_mercadito').select('historial').eq('id', pedidoId).single()
    const label = `Pago registrado: $${Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${metodo})`
    const nuevoHistorial = [
      ...(actual?.historial || []),
      { ts: new Date().toISOString(), label, actor_id: sesion.id, actor_nombre: actorNombre || null },
    ]
    await supabase.from('pedidos_mercadito').update({
      historial: nuevoHistorial,
      actualizado_en: new Date().toISOString(),
    }).eq('id', pedidoId)
  }

  return NextResponse.json({ ok: true })
}
