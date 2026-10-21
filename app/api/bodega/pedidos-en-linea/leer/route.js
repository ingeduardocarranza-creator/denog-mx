import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { correoConfigurado, procesarCorreosTiendas } from '@/lib/correos/tiendas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/bodega/pedidos-en-linea/leer — lee los correos nuevos del Gmail
// de las tiendas (avisos de pedido y, de paso, boletines de ofertas).
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  if (!correoConfigurado()) return NextResponse.json({ ok: false, mensaje: 'Falta configurar el correo de las tiendas (CORREO_TIENDAS y CORREO_TIENDAS_CLAVE).' })
  const supabase = supabaseConSesion(sesion)
  try {
    const { data: et } = await supabase.from('producto_etiquetas').select('tipo').not('tipo', 'is', null).limit(5000)
    const conteo = new Map()
    for (const e of et || []) conteo.set(e.tipo, (conteo.get(e.tipo) || 0) + 1)
    const tipos = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
    const r = await procesarCorreosTiendas(supabase, tipos)
    if (r.errores.length) console.warn('[pedidos-en-linea/leer] avisos:', r.errores)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[pedidos-en-linea/leer] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
