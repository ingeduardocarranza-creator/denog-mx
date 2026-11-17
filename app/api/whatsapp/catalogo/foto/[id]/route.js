import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'

export const runtime = 'nodejs'
export const maxDuration = 30

// Foto de un producto convertida a JPG, para el catálogo de WhatsApp.
// Meta no acepta AVIF, así que el catálogo apunta aquí en vez de a la foto
// original. Es pública a propósito (Meta la pide sin sesión), pero solo sirve
// fotos que ya son públicas en nuestro almacenamiento de Supabase.
// Uso: /api/whatsapp/catalogo/foto/123.jpg
export async function GET(_req, { params }) {
  const { id: crudo } = await params
  const id = Number(String(crudo || '').replace(/\.jpe?g$/i, ''))
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('No encontrada', { status: 404 })

  try {
    const { data, error } = await clienteSupabaseServicio()
      .from('productos_tienda')
      .select('imagen_url')
      .eq('id', id)
      .maybeSingle()
    if (error || !data?.imagen_url) return new NextResponse('No encontrada', { status: 404 })

    const url = new URL(data.imagen_url)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
      return new NextResponse('No encontrada', { status: 404 })
    }

    const origen = await fetch(url.toString())
    if (!origen.ok) return new NextResponse('No encontrada', { status: 404 })
    const bytes = Buffer.from(await origen.arrayBuffer())

    const jpg = await sharp(bytes)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()

    return new NextResponse(jpg, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch {
    return new NextResponse('No se pudo convertir la foto', { status: 500 })
  }
}
