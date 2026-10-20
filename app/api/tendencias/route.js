import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarResumen } from '@/lib/tendencias/resumen'
import { puntuarOfertas } from '@/lib/tendencias/ofertas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tendencias — lo que te funciona, calendario y la última lista (solo admin).
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const supabase = supabaseConSesion(sesion)
    const resumen = await cargarResumen(supabase)
    // Ofertas de los últimos 3 días, con el puntaje calculado con el historial de hoy.
    const desde = new Date(Date.now() - 3 * 86400000).toISOString()
    const { data: ofertas, error } = await supabase.from('ofertas')
      .select('id, fuente, tienda, nombre, precio_usd, precio_antes_usd, url, url_tienda, enlace_tipo, imagen_url, tipo, familia, temporadas, gancho, tallas, colores, publicado, creado_en')
      .eq('util', true).eq('descartado', false).gte('creado_en', desde)
      .order('creado_en', { ascending: false }).limit(1500)
    if (error) throw new Error(error.message)
    const resultados = await cargarResultados(supabase)
    const ventasPorOferta = new Map(resultados.filas.map(r => [r.oferta_id, r]))
    const puntuadas = puntuarOfertas(ofertas || [], resumen)
      .map(o => ({ ...o, ventas: ventasPorOferta.get(o.id)?.pedidos || 0 }))
      .sort((a, b) => b.puntaje - a.puntaje)
    // Un artículo real de tu catálogo, para el botón "Probar compartir".
    const { data: muestra } = await supabase.from('productos_tienda')
      .select('id, nombre, variante, precio_venta').not('imagen_url', 'is', null).gt('precio_venta', 0)
      .order('id', { ascending: false }).limit(1)
    const { todosTipos, ...resto } = resumen
    void todosTipos
    return NextResponse.json({ ok: true, ...resto, ofertas: puntuadas, muestra: muestra?.[0] || null, resultados: resultados.resumen })
  } catch (e) {
    console.error('[tendencias] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}

// ── Medir qué se vende ──
// Una oferta "vendió" si después de publicarla entró un pedido por WhatsApp
// cuyo texto de la foto trae su título (ver función tendencias_resultados).
// Solo cuenta lo que llega con el texto; lo que se reenvía sin texto no se ve.
async function cargarResultados(supabase) {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: filas, error }, { data: publicadas, error: e2 }] = await Promise.all([
    supabase.rpc('tendencias_resultados', { p_desde: desde }),
    supabase.from('ofertas').select('id, nombre, tipo, tienda, precio_usd').eq('publicado', true).gte('creado_en', desde).limit(5000),
  ])
  if (error) throw new Error(error.message)
  if (e2) throw new Error(e2.message)
  const porId = new Map((filas || []).map(f => [f.oferta_id, f]))
  const porTipo = new Map()
  for (const o of publicadas || []) {
    const k = o.tipo || 'Otro'
    const t = porTipo.get(k) || { tipo: k, publicadas: 0, conVenta: 0, pedidos: 0, utilidad: 0 }
    const v = porId.get(o.id)
    t.publicadas++
    if (v) { t.conVenta++; t.pedidos += v.pedidos; t.utilidad += Number(v.utilidad) || 0 }
    porTipo.set(k, t)
  }
  const tipos = [...porTipo.values()].map(t => ({ ...t, utilidad: Math.round(t.utilidad), tasa: t.publicadas ? t.conVenta / t.publicadas : 0 }))
  const mejores = (publicadas || []).filter(o => porId.has(o.id))
    .map(o => ({ ...o, pedidos: porId.get(o.id).pedidos, utilidad: Math.round(Number(porId.get(o.id).utilidad) || 0) }))
    .sort((a, b) => b.pedidos - a.pedidos).slice(0, 10)
  const total = publicadas?.length || 0
  const conVenta = tipos.reduce((s, t) => s + t.conVenta, 0)
  return {
    filas: filas || [],
    resumen: {
      publicadas: total, conVenta, tasa: total ? conVenta / total : 0,
      pedidos: tipos.reduce((s, t) => s + t.pedidos, 0), utilidad: tipos.reduce((s, t) => s + t.utilidad, 0),
      venden: tipos.filter(t => t.publicadas >= 3).sort((a, b) => b.tasa - a.tasa).slice(0, 8),
      noVenden: tipos.filter(t => t.publicadas >= 5 && t.conVenta === 0).sort((a, b) => b.publicadas - a.publicadas).slice(0, 8),
      mejores,
    },
  }
}
