import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, usuario, rol, activo, creado_en')
    .in('rol', ['vendedor', 'admin'])
    .order('nombre')
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, colaboradores: data })
}

export async function POST(req) {
  try {
    const { nombre, usuario, password, rol } = await req.json()
    if (!nombre || !usuario || !password || !rol)
      return NextResponse.json({ ok: false, mensaje: 'Todos los campos son obligatorios' })

    const password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from('clientes')
      .insert([{ nombre, usuario, password_hash, rol, activo: true }])
      .select('id, nombre, usuario, rol, activo')
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, colaborador: data })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}

export async function PUT(req) {
  try {
    const { id, nombre, usuario, rol, activo, password } = await req.json()
    if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

    // Verificar unicidad del usuario (excluyendo el propio registro)
    if (usuario) {
      const { data: existente } = await supabase
        .from('clientes')
        .select('id')
        .eq('usuario', usuario)
        .neq('id', id)
        .maybeSingle()
      if (existente) return NextResponse.json({ ok: false, mensaje: 'Este usuario ya está en uso' })
    }

    const campos = {}
    if (nombre  !== undefined) campos.nombre = nombre
    if (usuario !== undefined) campos.usuario = usuario
    if (rol     !== undefined) campos.rol    = rol
    if (activo  !== undefined) campos.activo = activo
    if (password) campos.password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from('clientes')
      .update(campos)
      .eq('id', id)
      .select('id, nombre, usuario, rol, activo')
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, colaborador: data })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
