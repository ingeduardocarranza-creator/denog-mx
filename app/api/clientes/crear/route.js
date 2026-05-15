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
    const { nombre, telefono, usuario, password, limite_credito, requiere_anticipo } = await req.json()

    const password_hash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from('clientes')
      .insert([{
        nombre,
        telefono,
        usuario,
        password_hash,
        limite_credito,
        requiere_anticipo,
        rol: 'cliente',
        activo: true
      }])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ ok: false, mensaje: error.message })
    }

    return NextResponse.json({ ok: true, cliente: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}