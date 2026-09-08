import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { enviarTicketPorWhatsapp } from '@/lib/whatsapp/enviarDocumentos'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST /api/whatsapp/enviar-ticket   { transaccion_id }
// Manda el ticket de esa transacción por WhatsApp: imagen libre si el
// cliente escribió en las últimas 24h, o la plantilla aprobada si no.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const transaccionId = body?.transaccion_id
  if (!transaccionId) return NextResponse.json({ ok: false, mensaje: 'Falta transaccion_id' }, { status: 400 })

  try {
    const resultado = await enviarTicketPorWhatsapp(supabase, {
      transaccionId,
      enviadoPor: sesion?.id || null,
    })
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 })
  } catch (e) {
    console.error('[whatsapp/enviar-ticket] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
