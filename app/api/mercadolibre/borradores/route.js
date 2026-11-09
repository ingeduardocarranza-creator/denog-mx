import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'
import { armarBorradorDeOportunidad } from '@/lib/mercadolibre/oportunidades'
import { leerPaginaTienda, guardarFoto } from '@/lib/mercadolibre/tienda'
import { buscarEnCatalogoML, sugerirCategorias, atributosObligatorios, armarPayload, validarBorrador, publicarEnPausa } from '@/lib/mercadolibre/borradores'

export const maxDuration = 60

const CAMPOS = ['catalogo_producto_id', 'catalogo_nombre', 'titulo', 'descripcion', 'categoria_id', 'categoria_nombre', 'precio', 'cantidad', 'tipo_publicacion', 'dias_entrega', 'gtin', 'sku', 'imagenes', 'atributos', 'enlace_compra']

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
        .select('id, nombre, codigo_barras, stock, imagen_url, galeria, descripcion, costo').eq('id', Number(b.producto_id)).maybeSingle()
      if (!pr) return NextResponse.json({ ok: false, mensaje: 'Ese producto no existe en el catálogo' })
      const imagenes = [pr.imagen_url, ...(pr.galeria || [])].filter(u => /^https:\/\//.test(u || ''))
      const { data, error } = await supabase.from('ml_borradores').insert({
        producto_id: pr.id, titulo: String(pr.nombre).slice(0, 60), descripcion: pr.descripcion || null,
        cantidad: Math.max(1, pr.stock || 1), gtin: /^\d{8}$|^\d{12,14}$/.test(String(pr.codigo_barras || '').trim()) ? String(pr.codigo_barras).trim() : null, sku: String(pr.codigo_barras || pr.id), costo: pr.costo,
        imagenes, creado_por: sesion.nombre || String(sesion.id),
      }).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, borrador: data })
    }

    // Borrador desde una oportunidad de mercado: se arma con lo que ya se sabe del producto.
    if (b.accion === 'desde_oportunidad') {
      const { data: op } = await supabase.from('ml_oportunidades').select('*').eq('oferta_id', b.oferta_id).maybeSingle()
      if (!op || !op.ml_producto_id) return NextResponse.json({ ok: false, mensaje: 'Esa oportunidad no existe' })
      // Si ya hay un borrador de este producto, se reutiliza (no se duplica).
      const { data: previo } = await supabase.from('ml_borradores').select('*').eq('catalogo_producto_id', op.ml_producto_id).neq('estado', 'descartado').limit(1).maybeSingle()
      if (previo) {
        await supabase.from('ml_oportunidades').update({ borrador_id: previo.id }).eq('oferta_id', op.oferta_id)
        return NextResponse.json({ ok: true, existente: true, borrador: previo })
      }
      const { data: oferta } = await supabase.from('ofertas').select('imagen_url').eq('id', op.oferta_id).maybeSingle()
      const { token } = await obtenerAcceso(supabase)
      const { _gtin, ...nuevo } = await armarBorradorDeOportunidad(token, op, oferta)
      const { data: creado, error: errIns } = await supabase.from('ml_borradores').insert({ ...nuevo, producto_id: null, creado_por: sesion.nombre || String(sesion.id) }).select('*').single()
      if (errIns) throw new Error(errIns.message)
      // MercadoLibre lo revisa SIN publicar, para decirte de una vez qué falta.
      let borrador = creado, validacion = null
      try {
        validacion = await validarBorrador(token, creado)
        // La categoría del producto de catálogo puede exigir código de barras: se usa el del propio catálogo de MercadoLibre.
        if (!validacion.ok && _gtin && validacion.errores.some(e => /GTIN/i.test(e))) {
          const conGtin = { ...creado, atributos: { ...(creado.atributos || {}), GTIN: _gtin } }
          const v2 = await validarBorrador(token, conGtin)
          if (v2.ok) { validacion = v2; await supabase.from('ml_borradores').update({ atributos: conGtin.atributos }).eq('id', creado.id) }
        }
        const { data: act } = await supabase.from('ml_borradores').update({ estado: validacion.ok ? 'validado' : 'borrador', validacion, actualizado_en: new Date().toISOString() }).eq('id', creado.id).select('*').single()
        if (act) borrador = act
      } catch {}
      await supabase.from('ml_oportunidades').update({ borrador_id: creado.id }).eq('oferta_id', op.oferta_id)
      return NextResponse.json({ ok: true, existente: false, borrador, validacion })
    }

    const id = Number(b.id)
    if (!Number.isInteger(id)) return NextResponse.json({ ok: false, mensaje: 'Falta el borrador' }, { status: 400 })
    const { data: bor } = await supabase.from('ml_borradores').select('*').eq('id', id).maybeSingle()
    if (!bor) return NextResponse.json({ ok: false, mensaje: 'Ese borrador no existe' })
    if (bor.estado === 'publicado' && b.accion !== 'descartar') return NextResponse.json({ ok: false, mensaje: 'Ese borrador ya se publicó' })

    // Pega el enlace de la tienda donde se compra: trae nombre, descripción, fotos y código de barras.
    if (b.accion === 'desde_enlace') {
      const pag = await leerPaginaTienda(b.url)
      if (!pag.ok) return NextResponse.json({ ok: false, mensaje: pag.mensaje, bloqueada: Boolean(pag.bloqueada) })
      const at = { ...(bor.atributos || {}) }
      const cambios = { enlace_compra: pag.url, tienda_compra: pag.tienda, precio_tienda_usd: pag.precio_usd, estado: 'borrador', validacion: null, actualizado_en: new Date().toISOString() }
      const resumen = []
      const tengo = new Set(bor.imagenes || [])
      const nuevas = []
      const hay = (bor.imagenes || []).length
      for (let i = 0; i < pag.imagenes.length && hay + nuevas.length < 10; i++) {
        const url = await guardarFoto(supabase, pag.imagenes[i], String(id), i, pag.url)
        if (url && !tengo.has(url)) nuevas.push(url)
      }
      if (nuevas.length) { cambios.imagenes = [...(bor.imagenes || []), ...nuevas]; resumen.push(`${nuevas.length} foto(s) agregadas`) }
      else if (pag.imagenes.length) resumen.push('No pude copiar las fotos (la tienda las protege): súbelas a mano o pásamelas por el chat')
      if (!(bor.descripcion || '').trim() && pag.descripcion) { cambios.descripcion = pag.descripcion; resumen.push('descripción') }
      if (!bor.gtin && pag.gtin) { cambios.gtin = pag.gtin; resumen.push('código de barras ' + pag.gtin) }
      if (pag.marca && !at.BRAND) { at.BRAND = pag.marca; cambios.atributos = at; resumen.push('marca ' + pag.marca) }
      if (!((bor.titulo || '').trim().length > 3) && pag.titulo) { cambios.titulo = pag.titulo.slice(0, 60); resumen.push('título') }
      if (bor.costo == null && pag.precio_usd) { cambios.costo = Math.round(pag.precio_usd * 18.5 * 1.086 * 100) / 100; resumen.push(`costo estimado $${cambios.costo} MXN (USD ${pag.precio_usd})`) }
      const { data, error } = await supabase.from('ml_borradores').update(cambios).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, borrador: data, resumen, tienda: pag.tienda, titulo_tienda: pag.titulo, precio_usd: pag.precio_usd })
    }

    if (b.accion === 'guardar') {
      const cambios = {}
      for (const k of CAMPOS) if (b.cambios && k in b.cambios) cambios[k] = b.cambios[k]
      if ('titulo' in cambios) cambios.titulo = String(cambios.titulo).slice(0, 60)
      const { data, error } = await supabase.from('ml_borradores')
        .update({ ...cambios, estado: 'borrador', validacion: null, actualizado_en: new Date().toISOString() }).eq('id', id).select('*').single()
      if (error) throw new Error(error.message)
      // Mismos datos en el catálogo del sitio: descripción (si no tenía) y medidas.
      if (data.producto_id) {
        const at = data.atributos || {}
        const n = (k) => { const v = parseFloat(String(at[k] || '').replace(',', '.')); return Number.isFinite(v) ? v : null }
        const { data: pr } = await supabase.from('productos_tienda').select('descripcion').eq('id', data.producto_id).maybeSingle()
        const act = {}
        if (data.descripcion && !(pr?.descripcion || '').trim()) act.descripcion = data.descripcion
        if (n('SELLER_PACKAGE_HEIGHT')) act.alto_cm = n('SELLER_PACKAGE_HEIGHT')
        if (n('SELLER_PACKAGE_WIDTH')) act.ancho_cm = n('SELLER_PACKAGE_WIDTH')
        if (n('SELLER_PACKAGE_LENGTH')) act.largo_cm = n('SELLER_PACKAGE_LENGTH')
        if (n('SELLER_PACKAGE_WEIGHT')) act.peso_g = n('SELLER_PACKAGE_WEIGHT')
        if (Object.keys(act).length) await supabase.from('productos_tienda').update(act).eq('id', data.producto_id)
      }
      return NextResponse.json({ ok: true, borrador: data })
    }
    if (b.accion === 'descartar') {
      await supabase.from('ml_borradores').update({ estado: 'descartado', actualizado_en: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    const { token } = await obtenerAcceso(supabase)
    if (b.accion === 'categorias') return NextResponse.json({ ok: true, categorias: await sugerirCategorias(token, bor.titulo, bor.gtin, b.consulta) })
    if (b.accion === 'catalogo') {
      const productos = await buscarEnCatalogoML(token, b.gtin || bor.gtin)
      return NextResponse.json({ ok: true, productos })
    }
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
    if (b.accion === 'probar') {
      // Solo diagnóstico (admin): manda a /items/validate el payload con ajustes. NO publica.
      const { mlPost } = await import('@/lib/mercadolibre/api')
      const base = armarPayload(bor, b.familia !== false)
      const payload = { ...base, ...(b.ajustes || {}) }
      for (const k of b.quitar || []) delete payload[k]
      try {
        await mlPost(token, '/items/validate', payload)
        return NextResponse.json({ ok: true, resultado: 'aceptado', payload })
      } catch (e) {
        return NextResponse.json({ ok: true, resultado: 'rechazado', detalle: e.detalle || e.message })
      }
    }
    if (b.accion === 'publicar') {
      if (b.confirmar !== true) return NextResponse.json({ ok: false, mensaje: 'Falta tu confirmación' }, { status: 400 })
      if (bor.estado !== 'validado') return NextResponse.json({ ok: false, mensaje: 'Primero hay que validarlo con MercadoLibre' })
      const r = await publicarEnPausa(token, bor)
      await supabase.from('ml_borradores').update({
        estado: 'publicado', item_id_publicado: r.item_id, enlace_publicado: r.enlace, publicado_en: new Date().toISOString(),
      }).eq('id', id)
      // Si el borrador vino de Oportunidades, queda guardado dónde se compra (para el guardián y Por comprar).
      try {
        const { data: op } = await supabase.from('ml_oportunidades').select('url_oferta, tienda, precio_usd').eq('borrador_id', id).limit(1).maybeSingle()
        const enlaceFicha = bor.enlace_compra || op?.url_oferta
        if (enlaceFicha) {
          await supabase.from('ml_fichas_compra').upsert({ item_id: r.item_id, variacion_id: 0, tienda: bor.tienda_compra || op?.tienda || null, enlace_compra: enlaceFicha, costo_usd: bor.precio_tienda_usd || op?.precio_usd || null, notas: bor.enlace_compra ? 'Del enlace pegado en el borrador' : 'Automático desde Oportunidades', actualizada_en: new Date().toISOString(), disponible: true, revisada_en: new Date().toISOString() }, { onConflict: 'item_id,variacion_id' })
        }
      } catch {}
      await supabase.from('ml_acciones').insert({ item_id: r.item_id, accion: 'publicar_borrador', valor: String(id), antes: null, ok: true, mensaje: r.aviso.join(' ') || null, hecho_por: sesion.id })
      return NextResponse.json({ ok: true, item_id: r.item_id, enlace: r.enlace, aviso: r.aviso })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
