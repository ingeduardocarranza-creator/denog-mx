import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const entrega_id = searchParams.get('entrega_id')

  const { data, error } = await supabase
    .from('pedidos')
    .select('*, clientes(nombre)')
    .eq('entrega_id', entrega_id)
    .order('creado_en')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, pedidos: data })
}