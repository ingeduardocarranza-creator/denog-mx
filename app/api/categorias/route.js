import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('categorias_pedidos')
    .select('*')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, categorias: data })
}

export async function POST(req) {
  const { nombre } = await req.json()
  if (!nombre?.trim()) return NextResponse.json({ ok: false, mensaje: 'Nombre requerido' })

  const { data, error } = await supabase
    .from('categorias_pedidos')
    .insert([{ nombre: nombre.trim(), activo: true }])
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, categoria: data })
}

export async function PUT(req) {
  const { id, activo } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { data, error } = await supabase
    .from('categorias_pedidos')
    .update({ activo })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, categoria: data })
}
