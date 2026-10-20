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
      .select('id, fuente, tienda, nombre, precio_usd, precio_antes_usd, url, imagen_url, tipo, familia, temporadas, gancho, publicado, creado_en')
      .eq('util', true).eq('descartado', false).gte('creado_en', desde)
      .order('creado_en', { ascending: false }).limit(1500)
    if (error) throw new Error(error.message)
    const puntuadas = puntuarOfertas(ofertas || [], resumen).sort((a, b) => b.puntaje - a.puntaje)
    const { todosTipos, ...resto } = resumen
    void todosTipos
    return NextResponse.json({ ok: true, ...resto, ofertas: puntuadas })
  } catch (e) {
    console.error('[tendencias] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
