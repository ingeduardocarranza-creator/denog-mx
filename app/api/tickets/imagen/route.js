import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { cargarTicket } from '@/lib/ticket/datos'
import { dibujarTicket } from '@/lib/ticket/dibujar'
import { pngDeDibujo } from '@/lib/estadosCuenta/servidor'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// GET /api/tickets/imagen?transaccion_id=...        -> el PNG del ticket
// GET /api/tickets/imagen?transaccion_id=...&datos=1 -> los datos, sin dibujar
//     (para que la pantalla pueda mostrar el folio sin generar la imagen)
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('transaccion_id')
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta transaccion_id' }, { status: 400 })

  let datos
  try {
    datos = await cargarTicket(supabase, id)
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 404 })
  }

  if (searchParams.get('datos')) return NextResponse.json({ ok: true, ticket: datos })

  try {
    const png = await pngDeDibujo(dibujarTicket, datos)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="ticket-${datos.folio}.png"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[tickets/imagen] error dibujando:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
