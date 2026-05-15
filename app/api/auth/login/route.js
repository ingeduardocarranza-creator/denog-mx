import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  try {
    const { usuario, password } = await req.json()

    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('usuario', usuario)
      .single()
      console.log('Supabase response:', JSON.stringify({ data, error }))

    if (error || !data) {
      return NextResponse.json({ ok: false, mensaje: 'Usuario no encontrado' })
    }

    if (!data.activo) {
      return NextResponse.json({ ok: false, mensaje: 'Usuario inactivo' })
    }

    const passwordValido = await bcrypt.compare(password, data.password_hash)

    if (!passwordValido) {
      return NextResponse.json({ ok: false, mensaje: 'Contraseña incorrecta' })
    }

    return NextResponse.json({
      ok: true,
      rol: data.rol,
      nombre: data.nombre,
      id: data.id
    })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}