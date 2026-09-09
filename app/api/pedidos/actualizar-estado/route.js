import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// Hora de Hermosillo en el formato que guarda la base (timestamp sin zona).
function horaLocal() {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Hermosillo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
  return p.replace(' ', 'T')
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { cliente_id, entrega_id, estado } = await req.json()

  // No permitir marcar como Entregado si el cliente aún tiene saldo pendiente en esa entrega
  if (estado === 'Entregado' && cliente_id && entrega_id) {
    const { data: pedidosEntrega } = await supabase
      .from('pedidos')
      .select('precio_venta')
      .eq('cliente_id', cliente_id)
      .eq('entrega_id', entrega_id)

    const { data: pagosEntrega } = await supabase
      .from('pagos')
      .select('monto')
      .eq('cliente_id', cliente_id)
      .eq('entrega_id', entrega_id)

    const totalPedidos = (pedidosEntrega || []).reduce((s, p) => s + (p.precio_venta || 0), 0)
    const totalPagado = (pagosEntrega || []).reduce((s, p) => s + (p.monto || 0), 0)
    const saldoPendiente = totalPedidos - totalPagado

    if (saldoPendiente > 0.5) {
      return NextResponse.json({
        ok: false,
        mensaje: `No se puede marcar como Entregado: el cliente tiene un saldo pendiente de $${saldoPendiente.toFixed(2)} en esta entrega.`
      })
    }
  }

  // Al marcar Entregado se sella el dia real de la entrega, y quién estaba
  // en el POS en ese momento (cobrando y/o entregando) — para el ticket de
  // "ya pagado, solo recoge" (lib/ticket/datosEntrega.js), que no tiene
  // ninguna transacción de la que sacar un vendedor_id como sí lo hace el
  // cobro normal. Es el mismo dato que escribe el POS al cobrar; esta ruta
  // la usa el cobro a domicilio.
  const cambios = { estado }
  if (estado === 'Entregado') {
    cambios.entregado_en = horaLocal()
    cambios.entregado_por = sesion.nombre || null
  }

  const { error } = await supabase
    .from('pedidos')
    .update(cambios)
    .eq('cliente_id', cliente_id)
    .eq('entrega_id', entrega_id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}