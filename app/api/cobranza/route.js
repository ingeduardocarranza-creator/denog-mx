import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarCobranza, dentroDeHorario, HORARIO_TEXTO } from '@/lib/cobranza/calcular'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/cobranza — clientes con saldo en entregas pasadas (solo admin).
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { hoy, clientes } = await cargarCobranza(supabaseConSesion(sesion))
    return NextResponse.json({ ok: true, hoy, clientes, dentroHorario: dentroDeHorario(), horario: HORARIO_TEXTO })
  } catch (e) {
    console.error('[cobranza] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
