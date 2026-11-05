import { NextResponse } from 'next/server'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

// Aquí MercadoLibre avisa (POST) cuando pasa algo en tu cuenta: venta nueva,
// cambio de envío, reclamo, mensaje, cambio en una publicación.
//
// Reglas de MercadoLibre: responder 200 en menos de ~500 ms y NO procesar
// aquí; solo se guarda el aviso y la Fase 2 lo atiende aparte. Si no se
// responde 200, MercadoLibre reintenta y luego marca la URL como fallida.
//
// Ruta pública a propósito (MercadoLibre no manda sesión). Seguridad: solo se
// guarda si el aviso viene de NUESTRA aplicación (application_id = ML_CLIENT_ID)
// y de NUESTRA cuenta (user_id = la conectada). Todo lo demás se ignora con 200.

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req) {
  let aviso
  try { aviso = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!aviso || typeof aviso !== 'object' || !aviso.topic) return NextResponse.json({ ok: false }, { status: 400 })

  // No es nuestra aplicación: se ignora (200 para que no reintente).
  if (!process.env.ML_CLIENT_ID || String(aviso.application_id) !== String(process.env.ML_CLIENT_ID)) {
    return NextResponse.json({ ok: true, ignorado: true })
  }

  try {
    const supabase = clienteSupabaseServicio()
    const { data: con } = await supabase.from('ml_conexion').select('ml_user_id').eq('id', 1).maybeSingle()
    if (con?.ml_user_id && String(aviso.user_id) !== String(con.ml_user_id)) {
      return NextResponse.json({ ok: true, ignorado: true })
    }
    const { error } = await supabase.from('ml_notificaciones').upsert({
      ml_id: aviso._id || null,
      topic: String(aviso.topic),
      recurso: aviso.resource || null,
      ml_user_id: aviso.user_id ?? null,
      application_id: String(aviso.application_id),
      intentos: aviso.attempts ?? null,
      enviada_en: aviso.sent || null,
    }, { onConflict: 'ml_id', ignoreDuplicates: true })
    // 500 para que MercadoLibre reintente si no se pudo guardar.
    if (error) return NextResponse.json({ ok: false }, { status: 500 })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
