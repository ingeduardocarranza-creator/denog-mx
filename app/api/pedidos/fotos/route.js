import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Firma las fotos de unos pedidos concretos.
//
// Para qué: Empacado muestra UN cliente a la vez, pero cargaba las 384 fotos de
// toda la entrega para pintar las 2 de la primera bolsa. Firmar cuesta una
// consulta a la base por foto, así que ese exceso es justo lo que saturaba
// Storage. Ahora la pantalla pide sólo las del cliente que tiene enfrente.
//
// Se piden por ID de pedido, no por ruta: así nadie puede pedir que se le firme
// una ruta arbitraria del bucket (ahí también viven los comprobantes de pago).
// El servidor busca esos pedidos y firma lo que ellos tengan.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ids = (searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)
  if (ids.length === 0) return NextResponse.json({ ok: true, fotos: {} })

  const { data, error } = await supabase
    .from('pedidos')
    .select('id, imagen_url')
    .in('id', ids)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const filas = (data || []).filter(p => p.imagen_url)
  const firmadas = await urlsFirmadas(supabase, filas.map(p => p.imagen_url), 3600)

  const fotos = {}
  for (const p of filas) {
    fotos[p.id] = p.imagen_url.startsWith('http') ? p.imagen_url : (firmadas[p.imagen_url] || null)
  }

  return NextResponse.json({ ok: true, fotos })
}
