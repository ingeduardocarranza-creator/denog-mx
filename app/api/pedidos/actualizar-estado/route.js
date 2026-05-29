import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  const { cliente_id, entrega_id, estado } = await req.json()

  const { error } = await supabase
    .from('pedidos')
    .update({ estado })
    .eq('cliente_id', cliente_id)
    .eq('entrega_id', entrega_id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}