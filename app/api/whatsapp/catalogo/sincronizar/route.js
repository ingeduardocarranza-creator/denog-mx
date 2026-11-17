import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { sincronizarCatalogo, catalogoConfigurado } from '@/lib/whatsapp/catalogo'

export const maxDuration = 60

// Sincronización a mano desde el panel (sesión de staff).
// Cuerpo opcional: { "simular": true } → solo cuenta, no manda nada.
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const cuerpo = await req.json().catch(() => ({}))
  const simular = cuerpo?.simular === true
  if (!simular && !catalogoConfigurado()) {
    return NextResponse.json({ ok: false, mensaje: 'Falta WHATSAPP_CATALOGO_ID o WHATSAPP_CATALOGO_TOKEN en Vercel' })
  }
  try {
    const r = await sincronizarCatalogo(clienteSupabaseServicio(), { simular, origen: 'manual' })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
