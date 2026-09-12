import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()

  // Cualquier admin puede confirmar, incluso el que sacó el dinero — no
  // hace falta un segundo admin. Lo que importa es que quede registrado
  // quién lo sacó (admin_id) y quién lo confirmó (confirmado_por), aunque
  // sea la misma persona.
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
