import { mlGet, mlPost } from '@/lib/mercadolibre/api'

// Borradores de publicación: se arman en el sitio a partir del catálogo,
// se validan con MercadoLibre SIN publicar (/items/validate) y solo se
// publican cuando el admin lo confirma. Al publicar quedan EN PAUSA.

// Categorías sugeridas por MercadoLibre a partir del título.
export async function sugerirCategorias(token, titulo, gtin, consulta) {
  const salida = []
  const ver = new Set()
  const agregar = (r, origen) => {
    for (const x of Array.isArray(r) ? r : []) {
      if (!x.category_id || ver.has(x.category_id)) continue
      ver.add(x.category_id)
      salida.push({ categoria_id: x.category_id, categoria_nombre: x.category_name, dominio: `${x.domain_name}${origen ? ` · ${origen}` : ''}` })
    }
  }
  // Si el código de barras ya existe en el catálogo de MercadoLibre, su categoría
  // va primero (MercadoLibre exige que coincida con la del código).
  if (/^\d{8}$|^\d{12,14}$/.test(String(gtin || ''))) {
    try {
      const prods = await mlGet(token, '/products/search', { status: 'active', site_id: 'MLM', product_identifier: String(gtin) })
      for (const pr of (prods.results || []).slice(0, 2)) {
        const r = await mlGet(token, '/sites/MLM/domain_discovery/search', { q: String(pr.name || '').slice(0, 120), limit: 2 })
        agregar(r, 'según el código de barras')
      }
    } catch {}
    // También se busca el código entre las publicaciones de MercadoLibre: su
    // categoría es la que MercadoLibre espera para ese código.
    try {
      const bus = await mlGet(token, '/sites/MLM/search', { q: String(gtin), limit: 5 })
      const conteo = new Map()
      for (const it of bus.results || []) conteo.set(it.category_id, (conteo.get(it.category_id) || 0) + 1)
      for (const [cat] of [...conteo].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
        if (ver.has(cat)) continue
        let nombre = cat
        try { nombre = (await mlGet(token, `/categories/${cat}`)).name || cat } catch {}
        ver.add(cat)
        salida.unshift({ categoria_id: cat, categoria_nombre: nombre, dominio: 'donde ya se vende este código' })
      }
    } catch {}
  }
  // Lo que el admin escribió a mano va primero.
  if (consulta && String(consulta).trim().length > 2) {
    try { agregar(await mlGet(token, '/sites/MLM/domain_discovery/search', { q: String(consulta).slice(0, 120), limit: 5 }), 'según lo que escribiste') } catch {}
  }
  const r = await mlGet(token, '/sites/MLM/domain_discovery/search', { q: String(titulo).slice(0, 120), limit: 4 })
  agregar(r, '')
  return salida
}

// Atributos de la categoría marcados como obligatorios.
export async function atributosObligatorios(token, categoriaId) {
  const lista = await mlGet(token, `/categories/${categoriaId}/attributes`)
  return (Array.isArray(lista) ? lista : [])
    .filter(a => a.tags?.required || a.tags?.catalog_required)
    .map(a => ({
      id: a.id, nombre: a.name, tipo: a.value_type,
      opciones: (a.values || []).slice(0, 12).map(v => v.name),
    }))
}

// Arma lo que se le manda a MercadoLibre.
// familia=true: MercadoLibre (categorías con "productos de usuario") pide
// family_name en lugar de title.
export function armarPayload(b, familia = false) {
  const attrs = []
  const ya = new Set()
  const poner = (id, valor) => {
    if (valor === undefined || valor === null || String(valor).trim() === '' || ya.has(id)) return
    ya.add(id); attrs.push({ id, value_name: String(valor) })
  }
  for (const [id, v] of Object.entries(b.atributos || {})) poner(id, v)
  // Solo códigos de barras reales (8, 12, 13 o 14 dígitos). Los códigos internos
  // del catálogo (ej. GEN-123) hacen que MercadoLibre rechace la publicación.
  const gtinBueno = /^\d{8}$|^\d{12,14}$/.test(String(b.gtin || '').trim())
  // Ligado a un producto del catálogo de ML: el catálogo ya trae el código, no se manda.
  if (b.catalogo_producto_id) { /* sin GTIN */ }
  else if (gtinBueno) poner('GTIN', String(b.gtin).trim())
  else if (!ya.has('EMPTY_GTIN_REASON')) { ya.add('EMPTY_GTIN_REASON'); attrs.push({ id: 'EMPTY_GTIN_REASON', value_id: '17055160' }) }
  poner('SELLER_SKU', b.sku)
  const p = {
    ...(familia ? { family_name: b.titulo } : { title: b.titulo }),
    ...(b.catalogo_producto_id ? { catalog_product_id: b.catalogo_producto_id } : {}),
    category_id: b.categoria_id,
    price: Number(b.precio),
    currency_id: 'MXN',
    available_quantity: Number(b.cantidad) || 1,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: b.tipo_publicacion || 'gold_special',
    pictures: (b.imagenes || []).slice(0, 10).map(source => ({ source })),
    attributes: attrs,
    shipping: { mode: 'me2', local_pick_up: false, free_shipping: false },
  }
  if (b.dias_entrega) p.sale_terms = [{ id: 'MANUFACTURING_TIME', value_name: `${b.dias_entrega} días` }]
  return p
}

// Pide a MercadoLibre que revise el borrador sin crearlo.
export async function validarBorrador(token, b) {
  const faltan = []
  if (!b.categoria_id) faltan.push('Elige la categoría')
  if (!(Number(b.precio) > 0)) faltan.push('Falta el precio')
  if (!(b.imagenes || []).length) faltan.push('Falta al menos una foto')
  if (faltan.length) return { ok: false, errores: faltan }
  const intentar = async (familia) => {
    try {
      await mlPost(token, '/items/validate', armarPayload(b, familia))
      return { ok: true, errores: [], familia }
    } catch (e) {
      const todas = e.detalle?.cause || []
      const causas = todas.filter(c => c.type !== 'warning').map(c => c.message || c.code)
      // MercadoLibre contesta 400 aunque solo haya avisos; sin errores, el borrador sirve.
      if (e.detalle?.error === 'validation_error' && todas.length && !causas.length) {
        return { ok: true, errores: [], avisos: todas.map(c => c.message || c.code), familia }
      }
      return { ok: false, errores: causas.length ? causas : [e.message], familia, detalle: JSON.stringify(e.detalle || {}).slice(0, 1500) }
    }
  }
  let r = await intentar(false)
  if (!r.ok && r.errores.some(x => /family_name/i.test(x))) r = await intentar(true)
  return r
}

// Publica y la deja en pausa. Devuelve { item_id, enlace }.
export async function publicarEnPausa(token, b) {
  const creada = await mlPost(token, '/items', armarPayload(b, !!b.validacion?.familia))
  const item_id = creada.id
  const aviso = []
  if (b.descripcion) {
    try { await mlPost(token, `/items/${item_id}/description`, { plain_text: b.descripcion }) }
    catch (e) { aviso.push(`La descripción no se pudo guardar: ${e.message}`) }
  }
  try {
    await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    })
  } catch { aviso.push('No se pudo pausar; revísala en MercadoLibre.') }
  return { item_id, enlace: creada.permalink || null, aviso }
}


// Productos del catálogo de MercadoLibre que tienen este código de barras.
export async function buscarEnCatalogoML(token, gtin) {
  const g = String(gtin || '').trim()
  if (!g) return []
  const r = await mlGet(token, '/products/search', { status: 'active', site_id: 'MLM', product_identifier: g })
  const lista = []
  for (const x of (r.results || []).slice(0, 5)) {
    let det = {}
    try { det = await mlGet(token, `/products/${x.id}`) } catch {}
    lista.push({ id: x.id, nombre: det.name || x.name || x.id, dominio: det.domain_id || x.domain_id || null, categoria_id: det.category_id || null, foto: det.pictures?.[0]?.url || null })
  }
  return lista
}
