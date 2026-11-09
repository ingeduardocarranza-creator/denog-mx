import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { analizarOferta, TC_DEFAULT, MARGEN_MIN } from '@/lib/mercadolibre/oportunidades'

export const maxDuration = 60

const EXCLUIDAS = ['Ropa', 'Calzado']

async function envioMediano(supabase) {
  const { data } = await supabase.from('ml_ventas').select('envio_costo').not('envio_costo', 'is', null).gt('envio_costo', 0).order('fecha_venta', { ascending: false }).limit(60)
  const a = (data || []).map(x => Number(x.envio_costo)).sort((x, y) => x - y)
  return a.length ? a[a.length >> 1] : 0
}

// Ofertas de EE. UU. que todavía no se han analizado (las más nuevas primero).
async function pendientes(supabase, max) {
  const { data: hechas } = await supabase.from('ml_oportunidades').select('oferta_id').limit(10000)
  const ya = new Set((hechas || []).map(x => x.oferta_id))
  const { data } = await supabase.from('ofertas')
    .select('id, nombre, tienda, precio_usd, imagen_url, url, url_tienda, familia, descartado')
    .gt('precio_usd', 0).not('nombre', 'is', null).order('creado_en', { ascending: false }).limit(1500)
  const lista = (data || []).filter(o => !ya.has(o.id) && !o.descartado && !EXCLUIDAS.includes(o.familia))
  return { lista: lista.slice(0, max), total: lista.length }
}

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
  const { total } = await pendientes(supabase, 0)
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
    const envio = await envioMediano(supabase)
    const { lista, total } = await pendientes(supabase, Math.min(Number(cuerpo.lote) || 12, 20))
    const filas = []
    let i = 0
    const trabajador = async () => {
      while (i < lista.length) {
        const o = lista[i++]
        try { filas.push(await analizarOferta(token, o, { tc, envioMediano: envio })) }
        catch (e) { filas.push({ oferta_id: o.id, nombre: o.nombre, tienda: o.tienda, precio_usd: o.precio_usd, tipo: 'error', actualizado_en: new Date().toISOString() }); console.error('oportunidad', o.id, e.message) }
      }
    }
    await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()])
    if (filas.length) {
      const { error } = await supabase.from('ml_oportunidades').upsert(filas, { onConflict: 'oferta_id' })
      if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    }
    return NextResponse.json({ ok: true, analizadas: filas.length, quedan: Math.max(0, total - filas.length), encontradas: filas.filter(f => ['nicho', 'competida', 'intermedia'].includes(f.tipo)).length })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: String(e.message).slice(0, 300) })
  }
}
