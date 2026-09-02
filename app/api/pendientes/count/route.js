import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Conteo liviano para el badge del menú lateral (admin y colaborador).
// El menú lo consulta cada 20 s desde cualquier pantalla del admin.
//
// Sólo cuenta pedidos específicos: los comprobantes se atienden en Anticipos
// y el tipo "sin responder" se eliminó (1 sep 2026). Aquí colgaba también el
// barrido de sin-responder, que corría en cada una de esas llamadas — se
// quitó junto con la función.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { count, error } = await supabase
    .from('pendientes')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'pedido_especifico')
    .in('estado', ['nuevo', 'visto'])

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, count: count || 0 })
}
