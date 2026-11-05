import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

// GET                          → publicaciones con su producto ligado
// GET ?buscar_producto=texto   → productos del catálogo para ligar a mano
// PATCH { id, producto_id }    → liga a mano (producto_id null = desligar)
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const { searchParams } = new URL(req.url)
  const buscar = (searchParams.get('buscar_producto') || '').trim()

  if (buscar) {
    // Sin comas ni comodines que rompan el filtro .or()
    const t = buscar.replace(/[,%()*]/g, ' ').trim()
    const { data, error } = await supabase
      .from('productos_tienda')
      .select('id, nombre, codigo_barras, stock, variante')
      .or(`nombre.ilike.%${t}%,codigo_barras.ilike.%${t}%`)
      .order('nombre')
      .limit(8)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, productos: data })
  }

  const { data: pubs, error } = await supabase
    .from('ml_publicaciones')
    .select('*')
    .order('liga_estado')
    .order('titulo')
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const ids = [...new Set((pubs || []).map(p => p.producto_id).filter(Boolean))]
  let porId = {}
  if (ids.length) {
    const { data: prods, error: errProd } = await supabase
      .from('productos_tienda')
      .select('id, nombre, codigo_barras, stock')
      .in('id', ids)
    if (errProd) return NextResponse.json({ ok: false, mensaje: errProd.message })
    porId = Object.fromEntries((prods || []).map(p => [p.id, p]))
  }

  return NextResponse.json({
    ok: true,
    publicaciones: (pubs || []).map(p => ({ ...p, producto: p.producto_id ? porId[p.producto_id] || null : null })),
  })
}

export async function PATCH(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const { id, producto_id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta la publicación' })

  const cambios = producto_id
    ? { producto_id, liga_estado: 'ligada', liga_manual: true }
    : { producto_id: null, liga_estado: 'bajo_pedido', liga_manual: false }
  const { error } = await supabase.from('ml_publicaciones').update(cambios).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
