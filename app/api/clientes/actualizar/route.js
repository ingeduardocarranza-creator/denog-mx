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
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { id, nombre, usuario, telefono, celular_contacto, limite_credito, requiere_anticipo, activo, password, regenerar_codigo } = await req.json()

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

    // Regenerar el código de recolección: solo a propósito, cuando el admin
    // lo pide (por ejemplo, si el cliente dice que alguien más lo vio). El
    // código viejo deja de servir en cuanto se guarda el nuevo.
    if (regenerar_codigo) {
      const { data: nuevoCodigo, error: errorCodigo } = await supabase.rpc('generar_codigo_recoleccion')
      if (errorCodigo) return NextResponse.json({ ok: false, mensaje: errorCodigo.message })
      campos.codigo_recoleccion = nuevoCodigo
    }

    const { data, error } = await supabase
      .from('clientes')
      .update(campos)
      .eq('id', id)
      .select('id, nombre, usuario, telefono, celular_contacto, limite_credito, requiere_anticipo, activo, codigo_recoleccion')
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, cliente: data })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
