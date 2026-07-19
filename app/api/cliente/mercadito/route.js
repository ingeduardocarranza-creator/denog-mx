import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Pedidos del Mercadito de un cliente para la sección "Compras de tu
// Mercadito" del Estado de Cuenta — enriquece cada ítem con la foto del
// producto (el snapshot guardado en el pedido no incluye imagen_url).
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')

  const { data: pedidos, error } = await supabase
    .from('pedidos_mercadito')
    .select('*')
    .eq('cliente_id', cliente_id)
    .order('creado_en', { ascending: false })

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const idsProductos = [...new Set((pedidos || []).flatMap((p) => (p.items || []).map((it) => it.producto_id)).filter(Boolean))]
  let imagenPorProducto = {}
  if (idsProductos.length > 0) {
    const { data: productos } = await supabase.from('productos_tienda').select('id, imagen_url').in('id', idsProductos)
    imagenPorProducto = Object.fromEntries((productos || []).map((p) => [p.id, p.imagen_url]))
  }

  const pedidosConFoto = (pedidos || []).map((p) => ({
    ...p,
    items: (p.items || []).map((it) => ({ ...it, imagen_url: imagenPorProducto[it.producto_id] || null })),
  }))

  return NextResponse.json({ ok: true, pedidos: pedidosConFoto })
}
