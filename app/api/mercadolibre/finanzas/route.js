import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { completarFinanzas } from '@/lib/mercadolibre/ventas'

export const maxDuration = 60

// POST → trae de MercadoLibre la comisión y el envío reales de las ventas que
// todavía no los tienen (hasta 40 por vez). Solo lee de MercadoLibre.
export async function POST(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  try {
    const { token } = await obtenerAcceso(supabase)
    const r = await completarFinanzas(supabase, token, { max: 40 })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
