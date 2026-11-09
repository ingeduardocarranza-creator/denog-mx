import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { analizarYGuardar, pendientesDe, TC_DEFAULT, MARGEN_MIN } from '@/lib/mercadolibre/oportunidades'

export const maxDuration = 60

export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const { data, error } = await supabase.from('ml_oportunidades').select('*').eq('descartada', false)
    .not('ml_producto_id', 'is', null).in('tipo', ['nicho', 'competida', 'intermedia', 'sin_vendedores']).order('sobre_costo_pct', { ascending: false, nullsFirst: false }).limit(1000)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  // Varias ofertas pueden apuntar al mismo producto de MercadoLibre: se queda la de mejor ganancia.
  const mejor = new Map()
  for (const o of data || []) {
    const previo = mejor.get(o.ml_producto_id)
    if (!previo || (o.ganancia ?? -1e9) > (previo.ganancia ?? -1e9) || (o.ganancia == null && previo.ganancia == null && Number(o.costo_mxn) < Number(previo.costo_mxn))) mejor.set(o.ml_producto_id, o)
  }
  const unicas = [...mejor.values()]
  const { count: analizadas } = await supabase.from('ml_oportunidades').select('oferta_id', { count: 'exact', head: true })
  const { total } = await pendientesDe(supabase, 0)
  return NextResponse.json({ ok: true, oportunidades: unicas, analizadas: analizadas || 0, por_analizar: total, margen_min: MARGEN_MIN, tc: TC_DEFAULT })
}

export async function POST(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const cuerpo = await req.json().catch(() => ({}))
  try {
    if (cuerpo.accion === 'descartar') {
      await supabase.from('ml_oportunidades').update({ descartada: !!cuerpo.valor }).eq('oferta_id', cuerpo.id)
      return NextResponse.json({ ok: true })
    }
    const { token } = await obtenerAcceso(supabase)
    const tc = Number(cuerpo.tc) > 0 ? Number(cuerpo.tc) : TC_DEFAULT
    const { lista, total } = await pendientesDe(supabase, Math.min(Number(cuerpo.lote) || 12, 20))
    const filas = await analizarYGuardar(supabase, token, lista, { tc })
    return NextResponse.json({ ok: true, analizadas: filas.length, quedan: Math.max(0, total - filas.length), encontradas: filas.filter(f => ['nicho', 'competida', 'intermedia'].includes(f.tipo)).length })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: String(e.message).slice(0, 300) })
  }
}
