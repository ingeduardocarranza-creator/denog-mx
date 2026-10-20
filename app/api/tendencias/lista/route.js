import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/tendencias/lista — marca o desmarca un producto como "ya lo publiqué".
// body: { id, clave, publicado }
export async function PATCH(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id, clave, publicado } = await req.json()
  if (!id || !clave) return NextResponse.json({ ok: false, mensaje: 'Falta id o clave' })

  const { data: lista, error } = await supabase.from('tendencias_listas').select('publicados').eq('id', id).single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  const set = new Set(lista.publicados || [])
  if (publicado) set.add(String(clave)); else set.delete(String(clave))
  const { error: e2 } = await supabase.from('tendencias_listas').update({ publicados: [...set] }).eq('id', id)
  if (e2) return NextResponse.json({ ok: false, mensaje: e2.message })
  return NextResponse.json({ ok: true, publicados: [...set] })
}
