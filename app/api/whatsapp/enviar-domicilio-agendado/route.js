import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { enviarDomicilioAgendadoPorWhatsapp } from '@/lib/whatsapp/enviarDomicilioAgendado'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST /api/whatsapp/enviar-domicilio-agendado   { domicilio_id }
// Se dispara solo en cuanto se confirma el costo de envío en
// /admin/domicilios: avisa al cliente que su domicilio quedó agendado, con
// el día, la dirección, el saldo pendiente, el envío y el total a pagar.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const domicilioId = body?.domicilio_id
  if (!domicilioId) return NextResponse.json({ ok: false, mensaje: 'Falta domicilio_id' }, { status: 400 })

  try {
    const resultado = await enviarDomicilioAgendadoPorWhatsapp(supabase, {
      domicilioId,
      enviadoPor: sesion?.id || null,
    })
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 })
  } catch (e) {
    console.error('[whatsapp/enviar-domicilio-agendado] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
