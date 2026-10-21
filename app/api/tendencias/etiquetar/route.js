import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { etiquetarBloque } from '@/lib/tendencias/etiquetar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/tendencias/etiquetar — etiqueta el siguiente bloque de productos
// sin etiqueta. La pantalla lo llama en ciclo hasta que "faltan" llega a 0.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const r = await etiquetarBloque(supabaseConSesion(sesion))
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[tendencias/etiquetar] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
