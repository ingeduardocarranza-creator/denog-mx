import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { enviarEstadoCuentaPorWhatsapp } from '@/lib/whatsapp/enviarDocumentos'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST /api/whatsapp/enviar-estado-cuenta   { entrega_id, cliente_id }
// Manda el estado de cuenta de ese cliente en esa entrega por WhatsApp:
// imagen libre si escribió en las últimas 24h, o la plantilla aprobada si no.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const entregaId = body?.entrega_id
  const clienteId = body?.cliente_id
  if (!entregaId || !clienteId) return NextResponse.json({ ok: false, mensaje: 'Falta entrega_id o cliente_id' }, { status: 400 })

  try {
    const resultado = await enviarEstadoCuentaPorWhatsapp(supabase, {
      entregaId,
      clienteId,
      enviadoPor: sesion?.id || null,
    })
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 })
  } catch (e) {
    console.error('[whatsapp/enviar-estado-cuenta] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
