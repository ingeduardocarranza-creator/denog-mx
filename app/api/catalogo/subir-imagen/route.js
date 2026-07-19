import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const EXT_POR_TIPO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
}

// Devuelve una URL firmada de subida: el archivo se sube DIRECTO del
// navegador a Supabase Storage (no pasa por esta función), para no chocar
// con el límite de tamaño de body de las funciones serverless de Vercel.
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { tipo, carpeta } = await req.json()
  const ext = EXT_POR_TIPO[tipo]
  if (!ext) {
    return NextResponse.json({ ok: false, mensaje: 'Formato no soportado. Usa JPG, PNG, WEBP, GIF, HEIC o AVIF.' })
  }

  // Solo letras/números/guiones para evitar traversal de rutas en el bucket.
  const carpetaSegura = /^[a-z0-9-]+$/i.test(carpeta || '') ? `${carpeta}/` : ''
  const path = `${carpetaSegura}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { data, error } = await supabase.storage.from('productos').createSignedUploadUrl(path)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const { data: pub } = supabase.storage.from('productos').getPublicUrl(path)
  return NextResponse.json({ ok: true, path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl })
}
