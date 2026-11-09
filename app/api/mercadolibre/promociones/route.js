import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso, mlGet } from '@/lib/mercadolibre/api'

export const maxDuration = 60

// Solo LEE. Campañas de promociones de MercadoLibre de tu cuenta y las
// publicaciones que participan o podrían participar (con su precio de promoción).
// GET                 → campañas
// GET ?campana=ID&tipo=TIPO → publicaciones de esa campaña
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  try {
    const { token, userId } = await obtenerAcceso(supabase)
    const q = new URL(req.url).searchParams
    const H = { 'x-version': 'v2' }
    if (q.get('campana')) {
      const items = []
      let token_busqueda = null
      for (let i = 0; i < 6; i++) {
        const p = { promotion_type: q.get('tipo') || '', app_version: 'v2', limit: '50' }
        if (token_busqueda) p.search_after = token_busqueda
        const r = await mlGet(token, `/seller-promotions/promotions/${q.get('campana')}/items`, p, H)
        items.push(...(r.results || []))
        token_busqueda = r.paging?.searchAfter || null
        if (!token_busqueda || !(r.results || []).length) break
      }
      return NextResponse.json({ ok: true, items })
    }
    const r = await mlGet(token, `/seller-promotions/users/${userId}`, { app_version: 'v2' }, H)
    return NextResponse.json({ ok: true, campanas: r.results || r })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: String(e.message).slice(0, 300) })
  }
}
