import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Conteo liviano para el badge del menú lateral (admin y colaborador) —
// pedidos nuevos que todavía nadie ha revisado.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { count, error } = await supabase
    .from('pedidos_mercadito')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'nuevo')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, count: count || 0 })
}
