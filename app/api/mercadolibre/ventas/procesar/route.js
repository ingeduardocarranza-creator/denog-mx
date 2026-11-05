import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { procesarPendientes, traerVentasRecientes } from '@/lib/mercadolibre/ventas'

export const maxDuration = 60

// Atiende los avisos de MercadoLibre pendientes y, si se pide, revisa las
// ventas de los últimos días directo en la API (red de seguridad).
// Cualquier miembro del equipo puede dispararlo (las pantallas lo hacen solas).
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let cuerpo = {}
  try { cuerpo = await req.json() } catch {}
  try {
    const supabase = clienteSupabaseServicio()
    const { token, userId } = await obtenerAcceso(supabase)
    const avisos = await procesarPendientes(supabase, token)
    const recientes = cuerpo.recientes
      ? await traerVentasRecientes(supabase, token, userId, { dias: Math.min(Number(cuerpo.dias) || 14, 60) })
      : null
    return NextResponse.json({ ok: true, avisos, recientes })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
