import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')

  const { data, error } = await supabase
    .from('pedidos')
    .select('*, entregas(fecha_entrega, estado)')
    .eq('cliente_id', cliente_id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // Traer domicilios entregados del cliente
  const { data: domicilios } = await supabase
    .from('domicilios')
    .select('entrega_ids, costo_envio, estado')
    .eq('cliente_id', cliente_id)
    .eq('estado', 'entregado')

  return NextResponse.json({ ok: true, pedidos: data, domicilios: domicilios || [] })
}