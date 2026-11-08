import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { sugerirCategorias, atributosObligatorios, armarPayload, validarBorrador, publicarEnPausa } from '@/lib/mercadolibre/borradores'

export const maxDuration = 60

const CAMPOS = ['titulo', 'descripcion', 'categoria_id', 'categoria_nombre', 'precio', 'cantidad', 'tipo_publicacion', 'dias_entrega', 'gtin', 'sku', 'imagenes', 'atributos']

export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()
  const { data, error } = await supabase.from('ml_borradores').select('*').neq('estado', 'descartado').order('id', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, borradores: data })
}

// POST { accion, ... }
//  crear      { producto_id }            → borrador desde el catálogo (sin precio)
//  guardar    { id, cambios }            → edita campos
//  categorias { id }                     → categorías sugeridas por MercadoLibre
//  obligatorios { id }                   → atributos que pide la categoría
//  validar    { id }                     → MercadoLibre lo revisa, NO publica
//  publicar   { id, confirmar:true }     → crea la publicación EN PAUSA
//  descartar  { id }
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const supabase = clienteSupabaseServicio()
  try {
    if (b.accion === 'crear') {
      const { data: pr } = await supabase.from('productos_tienda')
        .select('id, nombre, codigo_barras, stock, imagen_url, galeria, descripcion').eq('id', Number(b.producto_id)).maybeSingle()
      if (!pr) return NextResponse.json({ ok: false, mensaje: 'Ese producto no existe en el catálogo' })
      const imagenes = [pr.imagen_url, ...(pr.galeria || [])].filter(u => /^https:\/\//.test(u || ''))
      const { data, error } = await supabase.from('ml_borradores').insert({
        producto_id: pr.id, titulo: String(pr.nombre).slice(0, 60), descripcion: pr.descripcion || null,
        cantidad: Math.max(1, pr.stock || 1), gtin: pr.codigo_barras || null, sku: String(pr.id),
        imagenes, creado_por: sesion.nombre || String(sesion.id),
      }).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, borrador: data })
    }

    const id = Number(b.id)
    if (!Number.isInteger(id)) return NextResponse.json({ ok: false, mensaje: 'Falta el borrador' }, { status: 400 })
    const { data: bor } = await supabase.from('ml_borradores').select('*').eq('id', id).maybeSingle()
    if (!bor) return NextResponse.json({ ok: false, mensaje: 'Ese borrador no existe' })
    if (bor.estado === 'publicado' && b.accion !== 'descartar') return NextResponse.json({ ok: false, mensaje: 'Ese borrador ya se publicó' })

    if (b.accion === 'guardar') {
      const cambios = {}
      for (const k of CAMPOS) if (b.cambios && k in b.cambios) cambios[k] = b.cambios[k]
      if ('titulo' in cambios) cambios.titulo = String(cambios.titulo).slice(0, 60)
      const { data, error } = await supabase.from('ml_borradores')
        .update({ ...cambios, estado: 'borrador', validacion: null, actualizado_en: new Date().toISOString() }).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, borrador: data })
    }
    if (b.accion === 'descartar') {
      await supabase.from('ml_borradores').update({ estado: 'descartado', actualizado_en: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    const { token } = await obtenerAcceso(supabase)
    if (b.accion === 'categorias') return NextResponse.json({ ok: true, categorias: await sugerirCategorias(token, bor.titulo) })
    if (b.accion === 'obligatorios') {
      if (!bor.categoria_id) return NextResponse.json({ ok: false, mensaje: 'Elige primero la categoría' })
      return NextResponse.json({ ok: true, obligatorios: await atributosObligatorios(token, bor.categoria_id) })
    }
    if (b.accion === 'validar') {
      const v = await validarBorrador(token, bor)
      const { data } = await supabase.from('ml_borradores')
        .update({ estado: v.ok ? 'validado' : 'borrador', validacion: v, actualizado_en: new Date().toISOString() }).eq('id', id).select('*').single()
      return NextResponse.json({ ok: true, validacion: v, borrador: data })
    }
    if (b.accion === 'publicar') {
      if (b.confirmar !== true) return NextResponse.json({ ok: false, mensaje: 'Falta tu confirmación' }, { status: 400 })
      if (bor.estado !== 'validado') return NextResponse.json({ ok: false, mensaje: 'Primero hay que validarlo con MercadoLibre' })
      const r = await publicarEnPausa(token, bor)
      await supabase.from('ml_borradores').update({
        estado: 'publicado', item_id_publicado: r.item_id, enlace_publicado: r.enlace, publicado_en: new Date().toISOString(),
      }).eq('id', id)
      await supabase.from('ml_acciones').insert({ item_id: r.item_id, accion: 'publicar_borrador', valor: String(id), antes: null, ok: true, mensaje: r.aviso.join(' ') || null, hecho_por: sesion.id })
      return NextResponse.json({ ok: true, item_id: r.item_id, enlace: r.enlace, aviso: r.aviso })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
