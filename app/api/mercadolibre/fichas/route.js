import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

// Ficha de compra de una publicación: dónde se compra y cuánto cuesta.
// Se guarda una vez y sirve para todas las ventas futuras de esa publicación.
export async function PUT(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  if (!/^MLM\d+$/.test(String(b.item_id || ''))) return NextResponse.json({ ok: false, mensaje: 'Publicación inválida' }, { status: 400 })
  const enlace = String(b.enlace_compra || '').trim()
  if (enlace && !/^https?:\/\//i.test(enlace)) return NextResponse.json({ ok: false, mensaje: 'El enlace debe empezar con http:// o https://' }, { status: 400 })
  const costo = b.costo_usd === '' || b.costo_usd == null ? null : Number(b.costo_usd)
  if (costo != null && (!Number.isFinite(costo) || costo < 0)) return NextResponse.json({ ok: false, mensaje: 'Costo inválido' }, { status: 400 })

  const supabase = clienteSupabaseServicio()
  const { error } = await supabase.from('ml_fichas_compra').upsert({
    item_id: b.item_id,
    variacion_id: Number(b.variacion_id) || 0,
    tienda: String(b.tienda || '').trim().slice(0, 80) || null,
    enlace_compra: enlace || null,
    costo_usd: costo,
    notas: String(b.notas || '').trim().slice(0, 300) || null,
    actualizada_en: new Date().toISOString(),
  }, { onConflict: 'item_id,variacion_id' })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
