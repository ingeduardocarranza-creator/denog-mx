import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { enviarRecordatorio } from '@/lib/cobranza/recordar'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/cobranza/recordar   { cliente_id }
// Un cliente por llamada. "Recordar a todos" lo recorre la pantalla uno por
// uno, para ir mostrando el avance y no topar con el límite de tiempo.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.cliente_id) return NextResponse.json({ ok: false, mensaje: 'Falta cliente_id' }, { status: 400 })
  try {
    const r = await enviarRecordatorio(supabaseConSesion(sesion), { clienteId: body.cliente_id, enviadoPor: sesion.id || null })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e) {
    console.error('[cobranza/recordar] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
