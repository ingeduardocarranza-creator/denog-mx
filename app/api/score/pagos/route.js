import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  if (!requerirAdmin(req)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('pagos')
    .select('id, cliente_id, entrega_id, monto, metodo, tipo, creado_en')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, pagos: data })
}