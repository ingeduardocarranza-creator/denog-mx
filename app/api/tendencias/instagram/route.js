import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { instagramConfigurado, cuentaInstagram, leerInstagram, HASHTAGS } from '@/lib/tendencias/instagram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/tendencias/instagram — revisa la conexión con Instagram (solo lee,
// no guarda nada ni usa IA): ¿hay token?, ¿qué cuenta?, ¿cuántas
// publicaciones regresa cada hashtag?
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  if (!instagramConfigurado()) return NextResponse.json({ ok: false, mensaje: 'Falta INSTAGRAM_TOKEN (reinicia npm run dev después de guardarlo)' })
  try {
    const cuenta = await cuentaInstagram()
    const { publicaciones, errores } = await leerInstagram()
    const porHashtag = Object.fromEntries(Object.keys(HASHTAGS).map(h => [h, publicaciones.filter(p => p.hashtag === h).length]))
    return NextResponse.json({
      ok: errores.length === 0, cuenta: cuenta.username || cuenta.id, total: publicaciones.length,
      conFoto: publicaciones.filter(p => p.fotos.length).length, fotos: publicaciones.reduce((a, p) => a + p.fotos.length, 0), porHashtag, errores,
      ejemplo: publicaciones[0] ? { hashtag: publicaciones[0].hashtag, likes: publicaciones[0].likes, texto: publicaciones[0].caption.slice(0, 160) } : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
