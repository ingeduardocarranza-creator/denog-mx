import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { tiposDenog } from '@/lib/tendencias/ofertas'
import { actualizarVirales } from '@/lib/tendencias/instagram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/tendencias/virales/actualizar — solo Instagram (pestaña "Redes
// sociales"). Lo ya visto no se vuelve a mandar a la IA.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const supabase = supabaseConSesion(sesion)
    const r = await actualizarVirales(supabase, await tiposDenog(supabase), { max: 120 })
    if (!r.configurado) return NextResponse.json({ ok: false, mensaje: 'Falta INSTAGRAM_TOKEN' })
    if (r.errores.length) console.warn('[virales] avisos:', r.errores)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[virales] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
