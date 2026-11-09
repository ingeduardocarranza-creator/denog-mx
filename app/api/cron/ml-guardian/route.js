import { NextResponse } from 'next/server'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { correr } from '@/lib/mercadolibre/guardian'

export const maxDuration = 60

// Guardián de disponibilidad (automático). Entra con CRON_SECRET (Vercel) o con x-sync-key (Supabase).
export async function GET(req) {
  const supabase = clienteSupabaseServicio()
  const secreto = process.env.CRON_SECRET
  let autorizado = Boolean(secreto) && req.headers.get('authorization') === `Bearer ${secreto}`
  if (!autorizado) {
    const enviada = req.headers.get('x-sync-key')
    if (enviada && enviada.length > 20) {
      const { data } = await supabase.from('ml_sync_clave').select('clave').limit(1).maybeSingle()
      autorizado = Boolean(data?.clave) && data.clave === enviada
    }
  }
  if (!autorizado) return NextResponse.json({ ok: false }, { status: 401 })
  let token
  try { ({ token } = await obtenerAcceso(supabase)) } catch (e) { return NextResponse.json({ ok: false, mensaje: e.message }) }
  const r = await correr(supabase, token)
  return NextResponse.json({ ok: true, ...r })
}
