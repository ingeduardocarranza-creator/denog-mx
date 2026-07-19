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
  const cliente_id = searchParams.get('cliente_id')

  let query = supabase
    .from('pagos')
    .select('id, cliente_id, entrega_id, monto, metodo, tipo, creado_en')
    .order('creado_en', { ascending: true })

  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, anticipos: data })
}