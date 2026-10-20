import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { actualizarOfertas } from '@/lib/tendencias/ofertas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/tendencias/ofertas/actualizar — lee los sitios de ofertas y
// clasifica con IA solo lo nuevo. Se puede apretar las veces que sea: lo ya
// visto no se vuelve a cobrar.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const r = await actualizarOfertas(supabaseConSesion(sesion))
    if (r.errores.length) console.warn('[ofertas] avisos:', r.errores)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[ofertas] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
