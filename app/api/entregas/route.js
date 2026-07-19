import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase
    .from('entregas')
    .select('*')
    .order('fecha_entrega')
  
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, entregas: data })
}

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { fecha_entrega, nota } = await req.json()

  const { data, error } = await supabase
    .from('entregas')
    .insert([{ fecha_entrega, nota, estado: 'futura' }])
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, entrega: data })
}

export async function PUT(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, fecha_entrega, nota } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { data, error } = await supabase
    .from('entregas')
    .update({ fecha_entrega, nota })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, entrega: data })
}

export async function DELETE(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })
  const { error } = await supabase.from('entregas').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}