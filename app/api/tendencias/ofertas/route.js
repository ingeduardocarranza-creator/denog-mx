import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/tendencias/ofertas — { id, publicado?, descartado? }
export async function PATCH(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, publicado, descartado } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta id' })
  const cambios = {}
  if (typeof publicado === 'boolean') cambios.publicado = publicado
  if (typeof descartado === 'boolean') cambios.descartado = descartado
  if (!Object.keys(cambios).length) return NextResponse.json({ ok: false, mensaje: 'Nada que cambiar' })
  const { error } = await supabaseConSesion(sesion).from('ofertas').update(cambios).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
