import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tendencias/foto?oferta=<id>  ó  ?lista=<id>&clave=<p3>  ó  ?producto=<id> (catálogo)
// Trae la foto de una oferta desde nuestro propio dominio, para poder
// compartirla a WhatsApp junto con el texto (el celular no deja compartir
// una imagen de otro sitio). Solo sirve fotos de ofertas/listas guardadas:
// nunca una URL que mande el navegador.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return new Response('No autorizado', { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  let url = null
  if (searchParams.get('oferta')) {
    const { data } = await supabase.from('ofertas').select('imagen_url').eq('id', searchParams.get('oferta')).single()
    url = data?.imagen_url
  } else if (searchParams.get('producto')) {
    const { data } = await supabase.from('productos_tienda').select('imagen_url').eq('id', searchParams.get('producto')).single()
    url = data?.imagen_url
  } else if (searchParams.get('lista')) {
    const { data } = await supabase.from('tendencias_listas').select('productos').eq('id', searchParams.get('lista')).single()
    url = (data?.productos || []).find(p => p.clave === searchParams.get('clave'))?.imagen_url
  }
  if (!url || !/^https:\/\//.test(url)) return new Response('Sin foto', { status: 404 })
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 DenogOfertas/1.0' } })
    clearTimeout(t)
    const tipo = r.headers.get('content-type') || ''
    if (!r.ok || !tipo.startsWith('image/')) return new Response('Sin foto', { status: 404 })
    const bytes = await r.arrayBuffer()
    if (bytes.byteLength > 8 * 1024 * 1024) return new Response('Muy grande', { status: 413 })
    return new Response(bytes, { headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=86400' } })
  } catch {
    return new Response('Sin foto', { status: 404 })
  }
}
