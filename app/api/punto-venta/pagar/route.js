import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  if (!requerirStaff(req)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }
  const { cliente_id, entrega_id, pagos } = await req.json()

  const registros = pagos.map(p => ({
    cliente_id,
    entrega_id,
    monto: p.monto,
    metodo: p.metodo,
    tipo: 'Venta Liquidación'
  }))

  const { error } = await supabase.from('pagos').insert(registros)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}