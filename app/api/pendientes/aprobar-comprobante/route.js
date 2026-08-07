import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Aprueba un comprobante: registra el pago (mismo lugar que Mercadito y
// Encargos) y marca el pendiente como resuelto. Una persona decide siempre
// el monto final y a qué estado de cuenta (entrega) se abona — la IA solo
// propuso el monto detectado, nunca aprueba.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const {
    pendiente_id, cliente_id, nombre_suelto, telefono_suelto,
    entrega_id, monto, creado_en,
  } = await req.json()

  if (!pendiente_id) return NextResponse.json({ ok: false, mensaje: 'Falta el pendiente' })
  if (!monto || Number(monto) <= 0) return NextResponse.json({ ok: false, mensaje: 'Monto inválido' })
  if (!cliente_id && !nombre_suelto) {
    return NextResponse.json({ ok: false, mensaje: 'Falta el cliente o un nombre para el pago' })
  }

  const { data: pago, error: errorPago } = await supabase
    .from('pagos')
    .insert({
      cliente_id: cliente_id || null,
      nombre_suelto: cliente_id ? null : nombre_suelto,
      telefono_suelto: cliente_id ? null : (telefono_suelto || null),
      entrega_id: entrega_id || null,
      monto: Number(monto),
      metodo: 'Transferencia',
      tipo: 'Anticipo',
      pendiente_id,
      creado_en: creado_en || new Date().toISOString(),
    })
    .select()
    .single()

  if (errorPago) return NextResponse.json({ ok: false, mensaje: errorPago.message })

  const { error: errorPendiente } = await supabase
    .from('pendientes')
    .update({ estado: 'resuelto', resuelto_por: sesion.id, resuelto_en: new Date().toISOString() })
    .eq('id', pendiente_id)

  if (errorPendiente) return NextResponse.json({ ok: false, mensaje: errorPendiente.message })

  return NextResponse.json({ ok: true, pago })
}
