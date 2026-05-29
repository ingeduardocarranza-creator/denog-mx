import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  const { id, estado, costo_envio, total } = await req.json()

  const actualizacion = { estado }
  if (costo_envio !== undefined) actualizacion.costo_envio = costo_envio
  if (total !== undefined) actualizacion.total = total

  const { error } = await supabase
    .from('domicilios')
    .update(actualizacion)
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}