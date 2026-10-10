import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirBodega } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const EXT_POR_TIPO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

// URL firmada para subir la foto de evidencia DIRECTO del celular a
// Supabase Storage (bucket privado evidencia-paquetes), sin pasar por Vercel.
export async function POST(req) {
  if (!requerirBodega(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { tipo } = await req.json().catch(() => ({}))
  const ext = EXT_POR_TIPO[tipo] || 'jpg'

  // Carpeta por día (hora de Nogales/Hermosillo, UTC-7 todo el año).
  const dia = new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10)
  const path = `${dia}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { data, error } = await supabase.storage.from('evidencia-paquetes').createSignedUploadUrl(path)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, path, signedUrl: data.signedUrl })
}
