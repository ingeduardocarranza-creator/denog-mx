import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { geocodificar, dentroDeHermosillo } from '@/lib/domicilios/geocodificar'
import { coordenadasDeEnlace } from '@/lib/domicilios/enlaceMaps'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST { id }                -> reintenta ubicar la dirección con Google
// POST { id, enlace }        -> usa un enlace de Google Maps (pin) pegado a mano
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { id, enlace } = await req.json()
    const { data: d } = await supabase.from('domicilios').select('id, direccion, colonia, entre_calles').eq('id', id).single()
    if (!d) return NextResponse.json({ ok: false, mensaje: 'Domicilio no encontrado' })

    let punto = null
    if (enlace) {
      let url = String(enlace).trim()
      punto = coordenadasDeEnlace(url)
      if (!punto && /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|www\.google\.[a-z.]+\/maps)/i.test(url)) {
        try {
          const r = await fetch(url, { redirect: 'follow' })
          punto = coordenadasDeEnlace(r.url) || coordenadasDeEnlace(await r.text())
        } catch {}
      }
      if (!punto || !dentroDeHermosillo(punto.lat, punto.lng)) {
        return NextResponse.json({ ok: false, mensaje: 'No pude sacar una ubicación en Hermosillo de ese enlace' })
      }
    } else {
      const g = await geocodificar({ direccion: d.direccion, colonia: d.colonia, entre_calles: d.entre_calles })
      if (g) punto = { lat: g.lat, lng: g.lng }
    }
    if (!punto) return NextResponse.json({ ok: false, mensaje: 'Google no encontró esa dirección' })

    const { error } = await supabase
      .from('domicilios')
      .update({ lat: punto.lat, lng: punto.lng, geocodificado_en: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, lat: punto.lat, lng: punto.lng })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
