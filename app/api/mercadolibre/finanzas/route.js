import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso, mlGet } from '@/lib/mercadolibre/api'
import { completarFinanzas } from '@/lib/mercadolibre/ventas'

export const maxDuration = 60

// POST → trae de MercadoLibre la comisión y el envío reales de las ventas que
// todavía no los tienen (hasta 40 por vez). Solo lee de MercadoLibre.
export async function POST(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  try {
    const { token } = await obtenerAcceso(supabase)
    const cuerpo = await req.json().catch(() => ({}))
    if (cuerpo?.accion === 'comisiones') return NextResponse.json({ ok: true, ...(await estimarComisiones(supabase, token)) })
    const r = await completarFinanzas(supabase, token, { max: 40 })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

// Comisión estimada (en %) de las publicaciones ligadas al catálogo, según MercadoLibre
// (precio actual + categoría + tipo de publicación). Solo lee.
async function estimarComisiones(supabase, token) {
  const { data: pubs } = await supabase.from('ml_publicaciones').select('id, item_id, precio').eq('liga_estado', 'ligada').gt('precio', 0)
  const lista = pubs || []
  let hechas = 0, errores = 0
  for (let i = 0; i < lista.length; i += 20) {
    const lote = lista.slice(i, i + 20)
    const det = await mlGet(token, '/items', { ids: lote.map(p => p.item_id).join(','), attributes: 'id,category_id,listing_type_id,price' }).catch(() => [])
    for (const d of Array.isArray(det) ? det : []) {
      const it = d.body
      const p = lote.find(x => x.item_id === it?.id)
      if (!p || !it.category_id) { errores++; continue }
      try {
        const lp = await mlGet(token, '/sites/MLM/listing_prices', { price: String(it.price || p.precio), category_id: it.category_id, listing_type_id: it.listing_type_id })
        const fee = Array.isArray(lp) ? lp[0]?.sale_fee_amount : lp?.sale_fee_amount
        if (fee == null) throw new Error('sin comisión')
        await supabase.from('ml_publicaciones').update({ comision_pct_est: Math.round(Number(fee) / Number(it.price || p.precio) * 10000) / 100, comision_est_en: new Date().toISOString() }).eq('id', p.id)
        hechas++
      } catch { errores++ }
    }
  }
  return { publicaciones: lista.length, hechas, errores }
}
