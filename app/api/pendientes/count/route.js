import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { barrerSinResponder } from '@/lib/whatsapp/sweepSinResponder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Conteo liviano para el badge del menú lateral (admin y colaborador).
// Aprovecha que el menú consulta esto cada 20s en cualquier pantalla del
// admin para correr también el barrido de "sin responder" — mientras
// alguien del equipo tenga el sistema abierto, no hace falta un cron aparte.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  await barrerSinResponder(supabase)

  const { count, error } = await supabase
    .from('pendientes')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['nuevo', 'visto'])

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, count: count || 0 })
}
