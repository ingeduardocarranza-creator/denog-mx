import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  const { cliente_id, entrega_id, pagos } = await req.json()

  const registros = pagos.map(p => ({
    cliente_id,
    entrega_id,
    monto: p.monto,
    metodo: p.metodo,
    tipo: 'pago'
  }))

  const { error } = await supabase.from('pagos').insert(registros)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}