import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarResumen } from '@/lib/tendencias/resumen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tendencias — lo que te funciona, calendario y la última lista (solo admin).
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const resumen = await cargarResumen(supabaseConSesion(sesion))
    return NextResponse.json({ ok: true, ...resumen })
  } catch (e) {
    console.error('[tendencias] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
