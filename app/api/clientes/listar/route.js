import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, usuario, telefono, activo')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, clientes: data })
}