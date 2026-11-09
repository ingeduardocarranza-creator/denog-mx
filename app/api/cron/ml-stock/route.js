import { NextResponse } from 'next/server'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { enviarStock } from '@/lib/mercadolibre/stock'

export const maxDuration = 60

// Corrida automática (Vercel Cron, ver vercel.json): manda el stock del catálogo
// a las publicaciones que tienen encendido "Automático". Solo toca las que ya
// están ligadas, sin variantes y con la cantidad distinta.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return NextResponse.json({ ok: false }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const { data: pubs } = await supabase.from('ml_publicaciones').select('*').eq('sync_stock', true).eq('liga_estado', 'ligada').is('variacion_id', null)
  if (!pubs?.length) return NextResponse.json({ ok: true, revisadas: 0 })
  let token
  try { ({ token } = await obtenerAcceso(supabase)) } catch (e) { return NextResponse.json({ ok: false, mensaje: e.message }) }
  let enviadas = 0, fallos = 0
  for (const p of pubs) {
    const r = await enviarStock(supabase, token, p, { automatico: true })
    if (!r.ok) fallos++; else if (!r.sinCambio) enviadas++
  }
  console.log('[cron ml-stock]', JSON.stringify({ revisadas: pubs.length, enviadas, fallos }))
  return NextResponse.json({ ok: true, revisadas: pubs.length, enviadas, fallos })
}
