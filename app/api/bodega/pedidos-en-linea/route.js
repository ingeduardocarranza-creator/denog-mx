import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { traerTodo } from '@/lib/traerTodo'
import { correoConfigurado } from '@/lib/correos/tiendas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/bodega/pedidos-en-linea — pedidos hechos en línea (según los
// correos de las tiendas) de los últimos 45 días, cruzados por guía con lo
// que la bodega escaneó. Solo admin: Diego no ve nada de esto.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const desde = new Date(Date.now() - 45 * 86400000).toISOString()
    const pedidos = await traerTodo((a, b) => supabase.from('pedidos_en_linea').select('*')
      .gte('ultimo_correo', desde).order('ultimo_correo', { ascending: false }).range(a, b))
    const guias = [...new Set(pedidos.map(p => p.guia).filter(Boolean))]
    const recibidos = new Map()
    for (let i = 0; i < guias.length; i += 300) {
      const { data, error } = await supabase.from('paquetes_recibidos')
        .select('numero_guia, recibido_en, recibido_por_nombre, danado').in('numero_guia', guias.slice(i, i + 300))
      if (error) throw new Error(error.message)
      for (const r of data || []) recibidos.set(r.numero_guia, r)
    }
    const filas = pedidos.map(p => ({ ...p, recibido: p.guia ? recibidos.get(p.guia) || null : null }))
    return NextResponse.json({ ok: true, pedidos: filas, correoConfigurado: correoConfigurado() })
  } catch (e) {
    console.error('[pedidos-en-linea] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
