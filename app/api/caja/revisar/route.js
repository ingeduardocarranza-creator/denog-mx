import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()

  // Revisión posterior, no bloquea: cualquiera de los colaboradores puede
  // revisar un corte de caja que no sea el suyo. No frena el cierre de
  // turno de nadie — solo deja constancia de que alguien más lo revisó.
  const { data: corte, error: errBusca } = await supabase
    .from('cortes_caja')
    .select('colaborador_id, tipo, revisado_por')
    .eq('id', id)
    .single()
  if (errBusca) return NextResponse.json({ ok: false, mensaje: errBusca.message })
  if (!corte) return NextResponse.json({ ok: false, mensaje: 'Corte no encontrado' })
  if (corte.tipo !== 'corte') return NextResponse.json({ ok: false, mensaje: 'Solo se revisan cortes, no aperturas' })
  if (corte.revisado_por) return NextResponse.json({ ok: false, mensaje: 'Ese corte ya estaba revisado' })
  if (corte.colaborador_id === sesion.id) {
    return NextResponse.json({ ok: false, mensaje: 'No puedes revisar tu propio corte. Pídele a otro colaborador que lo revise.' })
  }

  const { error } = await supabase
    .from('cortes_caja')
    .update({ revisado_por: sesion.id, revisado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
