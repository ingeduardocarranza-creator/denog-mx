import { NextResponse } from 'next/server'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { actualizarOfertas } from '@/lib/tendencias/ofertas'
import { etiquetarBloque } from '@/lib/tendencias/etiquetar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET /api/cron/tendencias — corrida automática (Vercel Cron, ver vercel.json):
// 6 am, 12 pm y 6 pm de Hermosillo.
//  1. Etiqueta los productos nuevos de pedidos (para el puntaje y la guía).
//  2. Trae ofertas de los sitios de ofertas.
//  3. Lee el Gmail de las tiendas: boletines → ofertas; avisos de pedido →
//     Paquetes Nogales.
// Vercel manda "Authorization: Bearer <CRON_SECRET>"; sin eso no corre.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const supabase = supabaseConSesion({ id: '', nombre: 'Automatico (tendencias)' })
  const inicio = Date.now()
  const res = {}
  try { res.etiquetas = await etiquetarBloque(supabase) } catch (e) { res.etiquetas = { error: e.message } }
  try {
    const r = await actualizarOfertas(supabase, { maxCorreos: 100 })
    res.ofertas = { nuevas: r.nuevas, utiles: r.utiles, correos: r.correos, avisos: r.errores.slice(0, 5) }
  } catch (e) { res.ofertas = { error: e.message } }
  res.segundos = Math.round((Date.now() - inicio) / 1000)
  console.log('[cron tendencias]', JSON.stringify(res))
  return NextResponse.json({ ok: true, ...res })
}
