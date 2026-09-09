import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { enviarTicketDeEntregaPorWhatsapp } from '@/lib/whatsapp/enviarDocumentos'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST /api/whatsapp/enviar-ticket-entrega   { cliente_id }
// Para cuando alguien recoge un pedido que ya estaba pagado (sin cobro
// nuevo): manda un ticket armado con lo último que se marcó "Entregado"
// para ese cliente, en vez de partir de una transacción real.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const clienteId = body?.cliente_id
  if (!clienteId) return NextResponse.json({ ok: false, mensaje: 'Falta cliente_id' }, { status: 400 })

  try {
    const resultado = await enviarTicketDeEntregaPorWhatsapp(supabase, {
      clienteId,
      enviadoPor: sesion?.id || null,
    })
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 })
  } catch (e) {
    console.error('[whatsapp/enviar-ticket-entrega] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
