import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { sugerirFechaLimite } from '@/lib/entregas/fechaLimite'

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
  const { fecha_entrega, nota, fecha_limite } = await req.json()

  const { data, error } = await supabase
    .from('entregas')
    // Si no viene, se propone: 7 días después, sin contar domingos. Es una
    // sugerencia — se puede cambiar en cualquier momento desde Entregas.
    .insert([{ fecha_entrega, nota, estado: 'futura',
               fecha_limite: fecha_limite || sugerirFechaLimite(fecha_entrega) }])
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, entrega: data })
}

export async function PUT(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, fecha_entrega, nota, fecha_limite } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  // `fecha_limite` solo se toca si viene en la petición: así una edición de la
  // nota no borra la fecha que Lalo ya había ajustado a mano.
  const cambios = { fecha_entrega, nota }
  if (fecha_limite !== undefined) cambios.fecha_limite = fecha_limite || null

  const { data, error } = await supabase
    .from('entregas')
    .update(cambios)
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