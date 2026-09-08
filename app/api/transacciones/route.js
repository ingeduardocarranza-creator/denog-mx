import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Cierra una visita: crea la transacción con su folio y le amarra los renglones
// de dinero que ya se registraron.
//
// Se llama AL FINAL, cuando el cobro ya salió bien. El folio sale de un contador
// que vive en la base y se mueve dentro de la misma operación, así que no se
// repite ni deja huecos. Pedirlo antes de cobrar sí los dejaría: un cobro que
// truena a medias se habría llevado un número.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const {
    canal, cliente_id, entrega_id, domicilio_id, vendedor_id,
    total, efectivo_recibido, cambio, nota,
    pagos_ids, ventas_ids,
  } = await req.json()

  if (!['mostrador', 'domicilio'].includes(canal)) {
    return NextResponse.json({ ok: false, mensaje: 'Canal inválido' }, { status: 400 })
  }
  if (!(pagos_ids || []).length && !(ventas_ids || []).length) {
    return NextResponse.json({ ok: false, mensaje: 'Una transacción sin renglones no se guarda' }, { status: 400 })
  }

  const { data: transaccion, error } = await supabase
    .from('transacciones')
    .insert({
      canal,
      cliente_id: cliente_id || null,
      entrega_id: entrega_id || null,
      domicilio_id: domicilio_id || null,
      vendedor_id: vendedor_id || sesion.id,
      total: Number(total || 0),
      efectivo_recibido: efectivo_recibido ?? null,
      cambio: cambio ?? null,
      nota: nota || null,
    })
    .select('id, folio')
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  if ((pagos_ids || []).length) {
    await supabase.from('pagos').update({ transaccion_id: transaccion.id }).in('id', pagos_ids)
  }
  if ((ventas_ids || []).length) {
    await supabase.from('ventas_tienda').update({ transaccion_id: transaccion.id }).in('id', ventas_ids)
  }

  return NextResponse.json({ ok: true, id: transaccion.id, folio: transaccion.folio })
}
