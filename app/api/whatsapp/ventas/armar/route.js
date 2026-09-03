// Arma en `pedidos` los mensajes de venta que ya están en la bandeja.
//
// Se llama al abrir "Por aprobar" (y con el botón de refrescar). Es a
// propósito que no haya un cron detrás: el armado solo hace falta cuando
// alguien va a revisar, y un cron dando vueltas en vacío es justo lo que se
// quitó en claude/vercel-cpu-optimizacion-polling.md.
//
// El orden lo garantiza el candado de whatsapp_ventas_armado: si dos pestañas
// piden armar al mismo tiempo, una trabaja y la otra recibe ocupado:true y no
// hace nada. Ver lib/whatsapp/ventasBandeja.js.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { armarVentas } from '@/lib/whatsapp/ventasBandeja'

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await armarVentas(supabase))
  } catch (err) {
    console.error('[ventas/armar] falló el armado:', err?.message)
    return NextResponse.json({ ok: false, mensaje: err?.message || 'Falló el armado' })
  }
}
