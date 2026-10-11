import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirBodega } from '@/lib/auth/session'
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
    .select('id, tipo, tienda, numero_guia, paqueteria, danado, fotos, notas, recibido_por, recibido_por_nombre, recibido_en')
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

const TIENDAS = ['Walmart', "Sam's", 'Costco', 'Target', 'Five Below', 'Otra']

// POST: registrar un paquete.
//  · Con guía:  { tipo: 'guia', numero_guia, forzar?, danado, fotos, notas }
//      Si llegó bien se guarda solo la guía; si llegó dañado, de 1 a 3 fotos.
//  · Sin guía:  { tipo: 'delivery' | 'pickup', tienda, danado, fotos, notas }
//      Bolsa de Walmart, pickup en tienda, etc.: tienda + 1 a 3 fotos siempre.
export async function POST(req) {
  const sesion = requerirBodega(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const tipo = ['delivery', 'pickup'].includes(body.tipo) ? body.tipo : 'guia'
  const danado = body.danado === true
  const notas = String(body.notas || '').trim().slice(0, 300) || null
  const todasFotos = Array.isArray(body.fotos) ? body.fotos.filter(f => PATH_VALIDO.test(f)) : []
  if (todasFotos.length > 3) return NextResponse.json({ ok: false, mensaje: 'Máximo 3 fotos por paquete.' })

  let registro
  if (tipo === 'guia') {
    // La guía se vuelve a validar aquí. Solo pasa sin forma conocida si viene
    // de la foto de la etiqueta o de una confirmación ("Sí, es la guía").
    const analisis = analizarCodigo(body.numero_guia)
    const forzada = !analisis.ok && body.forzar === true
    const numero_guia = analisis.ok ? analisis.guia : limpiarGuia(body.numero_guia)
    if (!analisis.ok && !forzada) return NextResponse.json({ ok: false, mensaje: analisis.motivo })
    if (numero_guia.length < 8) return NextResponse.json({ ok: false, mensaje: 'El número de guía no es válido.' })
    const fotos = danado ? todasFotos : []
    if (danado && fotos.length < 1) return NextResponse.json({ ok: false, mensaje: 'Toma al menos una foto del daño.' })

    const { data: existente } = await supabase
      .from('paquetes_recibidos')
      .select('recibido_en, recibido_por_nombre')
      .eq('numero_guia', numero_guia)
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ ok: false, duplicado: true, existente, mensaje: 'Esta guía ya estaba registrada.' }, { status: 409 })
    }
    registro = {
      tipo, numero_guia, paqueteria: analisis.ok ? analisis.paqueteria : (String(body.paqueteria || '').slice(0, 30) || 'Otra'),
      danado, fotos, notas,
    }
  } else {
    const tienda = TIENDAS.includes(body.tienda) ? body.tienda : null
    if (!tienda) return NextResponse.json({ ok: false, mensaje: 'Elige la tienda.' })
    if (todasFotos.length < 1) return NextResponse.json({ ok: false, mensaje: 'Toma al menos una foto del paquete.' })
    registro = { tipo, tienda, numero_guia: null, paqueteria: null, danado, fotos: todasFotos, notas }
  }

  const db = supabaseConSesion(sesion)
  const { data, error } = await db
    .from('paquetes_recibidos')
    .insert({ ...registro, recibido_por: sesion.id, recibido_por_nombre: sesion.nombre })
    .select('id, tipo, tienda, numero_guia, paqueteria, danado, fotos, notas, recibido_por, recibido_por_nombre, recibido_en')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, duplicado: true, mensaje: 'Esta guía ya estaba registrada.' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, mensaje: error.message })
  }
  return NextResponse.json({ ok: true, paquete: data })
}

// DELETE ?id= :
//  · admin  → cualquier registro (corregir errores).
//  · bodega → solo los suyos y dentro de los 10 minutos (botón "Deshacer").
const MINUTOS_DESHACER = 10
export async function DELETE(req) {
  const sesion = requerirBodega(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta id' })

  if (sesion.rol !== 'admin') {
    const { data: p } = await supabase.from('paquetes_recibidos').select('recibido_por, recibido_en').eq('id', id).maybeSingle()
    const reciente = p && Date.now() - new Date(p.recibido_en).getTime() < MINUTOS_DESHACER * 60000
    if (!p || String(p.recibido_por) !== String(sesion.id) || !reciente) {
      return NextResponse.json({ ok: false, mensaje: 'Ya no se puede deshacer. Pídele al administrador que lo corrija.' })
    }
  }

  const db = supabaseConSesion(sesion)
  const { data, error } = await db.from('paquetes_recibidos').delete().eq('id', id).select('fotos').single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  if (data?.fotos?.length) await supabase.storage.from(BUCKET).remove(data.fotos)
  return NextResponse.json({ ok: true })
}
