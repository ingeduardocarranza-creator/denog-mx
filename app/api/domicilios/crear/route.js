import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const body = await req.json()
    const {
      cliente_id, entrega_ids, direccion, colonia,
      referencias, celular_contacto, celular_contacto_adicional,
      fecha_preferida, horario, notas, distancia_km, costo_envio,
      subtotal, total
    } = body

    const { data, error } = await supabase
      .from('domicilios')
      .insert([{
        cliente_id, entrega_ids, direccion, colonia,
        referencias, celular_contacto, celular_contacto_adicional,
        fecha_preferida, horario, notas, distancia_km, costo_envio,
        subtotal, total, estado: 'pendiente'
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, domicilio: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}