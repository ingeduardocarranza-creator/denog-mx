import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function POST(req) {
  // Confirmar lo puede hacer cualquier colaborador (admin o vendedor), no
  // solo admin: la idea es que el colaborador en turno "se dé por
  // enterado" de que le sacaron dinero de su caja, para que después no
  // ande buscando de dónde falta. Sacar dinero (crear el retiro) sigue
  // siendo exclusivo de admin — eso no cambia.
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()
  const { data: retiro, error: errBusca } = await supabase
    .from('retiros_caja')
    .select('admin_id, estado')
    .eq('id', id)
    .single()
  if (errBusca) return NextResponse.json({ ok: false, mensaje: errBusca.message })
  if (!retiro) return NextResponse.json({ ok: false, mensaje: 'Retiro no encontrado' })
  if (retiro.estado === 'confirmado') return NextResponse.json({ ok: false, mensaje: 'Ese retiro ya estaba confirmado.' })

  const { error } = await supabase
    .from('retiros_caja')
    .update({ estado: 'confirmado', confirmado_en: new Date().toISOString(), confirmado_por: sesion.id })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
