import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Solo se puede calificar un producto si el cliente lo compró de verdad
// (pedido en pedidos_mercadito con estado "agregado" que contenga ese
// producto) — no se confía en lo que mande el navegador.
export async function POST(req) {
  try {
    const { producto_id, cliente_id, estrellas, comentario } = await req.json()

    if (!producto_id || !cliente_id || !estrellas) {
      return NextResponse.json({ ok: false, mensaje: 'Faltan datos de la reseña.' })
    }

    const { data: pedidos, error: errPedidos } = await supabase
      .from('pedidos_mercadito')
      .select('items')
      .eq('cliente_id', cliente_id)
      .eq('estado', 'agregado')
    if (errPedidos) return NextResponse.json({ ok: false, mensaje: errPedidos.message })

    const compro = (pedidos || []).some((p) =>
      (p.items || []).some((it) => it.producto_id === producto_id)
    )
    if (!compro) {
      return NextResponse.json({ ok: false, mensaje: 'Solo puedes calificar productos que hayas comprado.' })
    }

    const { error: errInsert } = await supabase
      .from('mercadito_resenas')
      .insert([{ producto_id, cliente_id, estrellas, comentario: comentario || null }])
    if (errInsert) {
      const mensaje = errInsert.code === '23505' ? 'Ya calificaste este producto.' : errInsert.message
      return NextResponse.json({ ok: false, mensaje })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
