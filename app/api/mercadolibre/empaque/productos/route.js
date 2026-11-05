import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

// Buscador del catálogo para "Se sustituye por". Sin precios ni costos.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ ok: true, productos: [] })
  const limpio = q.replace(/[%,()]/g, ' ').trim()
  const supabase = clienteSupabaseServicio()
  const { data, error } = await supabase.from('productos_tienda')
    .select('id, nombre, codigo_barras, stock, imagen_url, variante')
    .eq('activo', true)
    .or(`nombre.ilike.%${limpio}%,codigo_barras.eq.${limpio.replace(/\s/g, '')}`)
    .order('nombre').limit(8)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, productos: data || [] })
}
