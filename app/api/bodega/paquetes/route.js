import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirBodega, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { limpiarGuia, analizarCodigo } from '@/lib/bodega/guias'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const BUCKET = 'evidencia-paquetes'
const PATH_VALIDO = /^\d{4}-\d{2}-\d{2}\/[0-9a-z-]+\.(jpg|png|webp|heic|heif)$/
const hoyLocal = () => new Date(Date.now() - 7 * 3600 * 1000).toISOString().slice(0, 10)
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')

// GET: lista de paquetes recibidos, con fotos firmadas.
//  · bodega → un día (?fecha=YYYY-MM-DD, hoy por default; hasta 90 días atrás):
//             su contador de hoy y su historial por día.
//  · admin  → rango ?desde=&hasta= o búsqueda ?guia= en todas las fechas.
export async function GET(req) {
  const sesion = requerirBodega(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const esAdmin = sesion.rol === 'admin'
  const { searchParams } = new URL(req.url)

  let desde = hoyLocal(), hasta = hoyLocal()
  if (esAdmin) {
    if (esFecha(searchParams.get('desde'))) desde = searchParams.get('desde')
    if (esFecha(searchParams.get('hasta'))) hasta = searchParams.get('hasta')
  } else if (esFecha(searchParams.get('fecha'))) {
    const limite = new Date(Date.now() - 7 * 3600 * 1000 - 90 * 86400000).toISOString().slice(0, 10)
    const f = searchParams.get('fecha')
    if (f >= limite && f <= hoyLocal()) desde = hasta = f
  }

  let q = supabase
    .from('paquetes_recibidos')
    .select('id, numero_guia, paqueteria, danado, fotos, notas, recibido_por_nombre, recibido_en')
    .order('recibido_en', { ascending: false })
    .limit(esAdmin ? 1000 : 100)

  const guia = esAdmin ? limpiarGuia(searchParams.get('guia')) : ''
  if (guia) q = q.ilike('numero_guia', `%${guia}%`)
  else q = q.gte('recibido_en', `${desde}T00:00:00-07:00`).lte('recibido_en', `${hasta}T23:59:59.999-07:00`)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  let paquetes = data || []
  {
    const todas = paquetes.flatMap(p => p.fotos || [])
    const urls = {}
    if (todas.length) {
      const { data: firmadas } = await supabase.storage.from(BUCKET).createSignedUrls(todas, 3600)
      for (const f of firmadas || []) if (f.signedUrl) urls[f.path] = f.signedUrl
    }
    paquetes = paquetes.map(p => ({ ...p, fotos_url: (p.fotos || []).map(f => urls[f]).filter(Boolean) }))
  }
  return NextResponse.json({ ok: true, paquetes })
}

// POST: registrar un paquete { numero_guia, danado, fotos: [paths], notas }.
// Si llegó bien se guarda solo la guía; si llegó dañado, de 1 a 3 fotos.
export async function POST(req) {
  const sesion = requerirBodega(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  // La guía se vuelve a validar aquí. Solo una guía escrita a mano y
  // confirmada por el de bodega ("Sí, es la guía") pasa sin forma conocida.
  const analisis = analizarCodigo(body.numero_guia)
  const forzada = !analisis.ok && body.forzar === true
  const numero_guia = analisis.ok ? analisis.guia : limpiarGuia(body.numero_guia)
  if (!analisis.ok && !forzada) return NextResponse.json({ ok: false, mensaje: analisis.motivo })
  const danado = body.danado === true
  const fotos = danado && Array.isArray(body.fotos) ? body.fotos.filter(f => PATH_VALIDO.test(f)) : []
  const notas = String(body.notas || '').trim().slice(0, 300) || null

  if (numero_guia.length < 8) return NextResponse.json({ ok: false, mensaje: 'El número de guía no es válido.' })
  if (danado && fotos.length < 1) return NextResponse.json({ ok: false, mensaje: 'Toma al menos una foto del daño.' })
  if (fotos.length > 3) return NextResponse.json({ ok: false, mensaje: 'Máximo 3 fotos por paquete.' })

  const { data: existente } = await supabase
    .from('paquetes_recibidos')
    .select('recibido_en, recibido_por_nombre')
    .eq('numero_guia', numero_guia)
    .maybeSingle()
  if (existente) {
    return NextResponse.json({ ok: false, duplicado: true, existente, mensaje: 'Esta guía ya estaba registrada.' }, { status: 409 })
  }

  const db = supabaseConSesion(sesion)
  const { data, error } = await db
    .from('paquetes_recibidos')
    .insert({
      numero_guia,
      paqueteria: analisis.ok ? analisis.paqueteria : 'Otra',
      danado,
      fotos,
      notas,
      recibido_por: sesion.id,
      recibido_por_nombre: sesion.nombre,
    })
    .select('id, numero_guia, paqueteria, danado, fotos, notas, recibido_por_nombre, recibido_en')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, duplicado: true, mensaje: 'Esta guía ya estaba registrada.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, mensaje: error.message })
  }
  return NextResponse.json({ ok: true, paquete: data })
}

// DELETE ?id= : solo admin, para corregir un registro equivocado.
export async function DELETE(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta id' })

  const db = supabaseConSesion(sesion)
  const { data, error } = await db.from('paquetes_recibidos').delete().eq('id', id).select('fotos').single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  if (data?.fotos?.length) await supabase.storage.from(BUCKET).remove(data.fotos)
  return NextResponse.json({ ok: true })
}
