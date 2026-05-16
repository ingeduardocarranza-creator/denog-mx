import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('entregas')
    .select('*')
    .order('fecha_entrega', { ascending: false })

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, entregas: data })
}

export async function POST(req) {
  const { fecha_entrega, nota } = await req.json()

  const { error } = await supabase.from('entregas').insert({
    fecha_entrega,
    nota,
    estado: 'pendiente'
  })

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req) {
  const { id, estado } = await req.json()

  const { error } = await supabase
    .from('entregas')
    .update({ estado })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
