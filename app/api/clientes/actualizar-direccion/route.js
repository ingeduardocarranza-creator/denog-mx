import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { cliente_id, direccion, colonia, referencias, celular_contacto } = await req.json()

    const { error } = await supabase
      .from('clientes')
      .update({ direccion, colonia, referencias, celular_contacto })
      .eq('id', cliente_id)

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}