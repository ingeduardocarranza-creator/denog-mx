import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// Rechazar es para cuando la IA se equivocó de plano (no era un gasto, era
// una foto de otra cosa) o el ticket llegó duplicado. Queda constancia de
// quién y por qué — no se borra, para no perder el rastro del ticket original.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id, motivo } = await req.json()

  const { data: gasto, error: errBusca } = await supabase
    .from('gastos')
    .select('estado')
    .eq('id', id)
    .single()
  if (errBusca) return NextResponse.json({ ok: false, mensaje: errBusca.message })
  if (!gasto) return NextResponse.json({ ok: false, mensaje: 'Gasto no encontrado' })
  if (gasto.estado !== 'pendiente') return NextResponse.json({ ok: false, mensaje: 'Ese gasto ya fue revisado' })

  const { error } = await supabase
    .from('gastos')
    .update({
      estado: 'rechazado',
      rechazado_por: sesion.id,
      rechazado_en: new Date().toISOString(),
      rechazado_motivo: motivo || null,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
