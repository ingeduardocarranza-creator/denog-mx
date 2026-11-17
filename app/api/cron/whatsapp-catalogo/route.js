import { NextResponse } from 'next/server'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { sincronizarCatalogo, catalogoConfigurado } from '@/lib/whatsapp/catalogo'

export const maxDuration = 60

// Corrida automática (Vercel Cron, ver vercel.json): sube al catálogo de
// WhatsApp los productos activos con stock y baja los que ya no deben estar.
// Con ?simular=1 solo cuenta lo que haría, sin tocar Meta ni la base.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET
  const autorizado = Boolean(secreto) && req.headers.get('authorization') === `Bearer ${secreto}`
  if (!autorizado) return NextResponse.json({ ok: false }, { status: 401 })

  const simular = new URL(req.url).searchParams.get('simular') === '1'
  if (!simular && !catalogoConfigurado()) {
    return NextResponse.json({ ok: false, mensaje: 'Falta WHATSAPP_CATALOGO_ID o WHATSAPP_CATALOGO_TOKEN en Vercel' })
  }
  try {
    const r = await sincronizarCatalogo(clienteSupabaseServicio(), { simular, origen: 'cron' })
    console.log('[cron whatsapp-catalogo]', JSON.stringify({ ...r, ejemplo: undefined }))
    return NextResponse.json(r)
  } catch (e) {
    console.error('[cron whatsapp-catalogo]', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
