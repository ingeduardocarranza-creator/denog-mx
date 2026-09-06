import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

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
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
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

  // Al marcar Entregado se sella el dia real de la entrega. Es el mismo dato
  // que escribe el POS al cobrar; esta ruta la usa el cobro a domicilio.
  const cambios = { estado }
  if (estado === 'Entregado') cambios.entregado_en = horaLocal()

  const { error } = await supabase
    .from('pedidos')
    .update(cambios)
    .eq('cliente_id', cliente_id)
    .eq('entrega_id', entrega_id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}