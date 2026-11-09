import { NextResponse } from 'next/server'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { analizarYGuardar, pendientesDe, viejasDe } from '@/lib/mercadolibre/oportunidades'

export const maxDuration = 60

// Corrida automática de Oportunidades: revisa las ofertas nuevas de EE. UU. contra el
// catálogo de MercadoLibre y, si no hay nuevas, actualiza las oportunidades con más de 7 días.
// SOLO LEE de MercadoLibre. Entra con el cron de Vercel (CRON_SECRET) o con el programador
// de Supabase (clave de la tabla privada ml_sync_clave).
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
  const inicio = Date.now()
  let nuevas = 0, renovadas = 0
  // Lotes de 12 hasta ~40 s (el límite de la función es 60 s).
  while (Date.now() - inicio < 40000) {
    const { lista } = await pendientesDe(supabase, 12)
    if (!lista.length) break
    nuevas += (await analizarYGuardar(supabase, token, lista)).length
  }
  if (!nuevas && Date.now() - inicio < 40000) {
    const viejas = await viejasDe(supabase, 12)
    if (viejas.length) renovadas = (await analizarYGuardar(supabase, token, viejas)).length
  }
  console.log('[cron ml-oportunidades]', JSON.stringify({ nuevas, renovadas }))
  return NextResponse.json({ ok: true, nuevas, renovadas })
}
