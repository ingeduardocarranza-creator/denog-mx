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
  const { searchParams } = new URL(req.url)
  const incluirInactivos = searchParams.get('activo') === 'todos'

  let query = supabase
    .from('clientes')
    .select('id, nombre, usuario, telefono, activo, rol, direccion, colonia, referencias, celular_contacto, limite_credito, requiere_anticipo')
    .order('nombre')

  if (!incluirInactivos) query = query.eq('activo', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, clientes: data })
}