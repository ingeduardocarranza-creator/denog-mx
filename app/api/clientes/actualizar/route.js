import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function PUT(req) {
  if (!requerirAdmin(req)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }
  try {
    const { id, nombre, usuario, telefono, celular_contacto, limite_credito, requiere_anticipo, activo, password } = await req.json()

    if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

    // Verificar unicidad del usuario (excluyendo el cliente actual)
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
    if (nombre           !== undefined) campos.nombre            = nombre
    if (usuario          !== undefined) campos.usuario           = usuario
    if (telefono         !== undefined) campos.telefono          = telefono
    if (celular_contacto !== undefined) campos.celular_contacto  = celular_contacto
    if (limite_credito   !== undefined) campos.limite_credito    = limite_credito
    if (requiere_anticipo!== undefined) campos.requiere_anticipo = requiere_anticipo
    if (activo           !== undefined) campos.activo            = activo
    if (password)                       campos.password_hash     = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from('clientes')
      .update(campos)
      .eq('id', id)
      .select('id, nombre, usuario, telefono, celular_contacto, limite_credito, requiere_anticipo, activo')
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, cliente: data })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
