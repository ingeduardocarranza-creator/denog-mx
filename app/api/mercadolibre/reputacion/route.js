import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso, mlGet } from '@/lib/mercadolibre/api'

export const maxDuration = 30

// Solo LEE. Reputación del vendedor (la que calcula MercadoLibre) y ventas
// pendientes de empacar que están por vencer o ya vencidas.
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  try {
    const { token, userId } = await obtenerAcceso(supabase)
    const u = await mlGet(token, `/users/${userId}`).catch(() => null)
    const r = u?.seller_reputation || null
    const m = r?.metrics || {}
    const tasa = (x) => (x && x.rate != null ? Math.round(Number(x.rate) * 1000) / 10 : null)
    const reputacion = r ? {
      nivel: r.level_id || null,                    // ej. 5_green, 3_yellow, 2_orange, 1_red
      color: String(r.level_id || '').split('_')[1] || null,
      mercadolider: r.power_seller_status || null,
      ventas_completadas: r.transactions?.completed ?? null,
      periodo: r.transactions?.period || null,
      reclamos: { tasa: tasa(m.claims), cantidad: m.claims?.value ?? null },
      demoras: { tasa: tasa(m.delayed_handling_time), cantidad: m.delayed_handling_time?.value ?? null },
      cancelaciones: { tasa: tasa(m.cancellations), cantidad: m.cancellations?.value ?? null },
    } : null

    const { data: pend } = await supabase.from('ml_ventas').select('id, paquete, limite_despacho, fecha_venta, etiqueta_lista')
      .eq('empaque_estado', 'pendiente').not('limite_despacho', 'is', null).order('limite_despacho').limit(40)
    const ahora = Date.now()
    const ids = (pend || []).map(v => v.id)
    const { data: its } = ids.length ? await supabase.from('ml_venta_items').select('venta_id, titulo').in('venta_id', ids) : { data: [] }
    const riesgo = (pend || []).map(v => {
      const horas = Math.round((new Date(v.limite_despacho).getTime() - ahora) / 36e5)
      return { paquete: v.paquete, limite: v.limite_despacho, horas, vencida: horas < 0, titulo: (its || []).find(i => i.venta_id === v.id)?.titulo || 'Venta', etiqueta_lista: v.etiqueta_lista }
    }).filter(x => x.horas <= 36)
    return NextResponse.json({ ok: true, reputacion, riesgo })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: String(e.message).slice(0, 300) })
  }
}
