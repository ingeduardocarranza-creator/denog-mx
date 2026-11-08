import { mlGet, mlPost } from '@/lib/mercadolibre/api'

// Borradores de publicación: se arman en el sitio a partir del catálogo,
// se validan con MercadoLibre SIN publicar (/items/validate) y solo se
// publican cuando el admin lo confirma. Al publicar quedan EN PAUSA.

// Categorías sugeridas por MercadoLibre a partir del título.
export async function sugerirCategorias(token, titulo) {
  const r = await mlGet(token, '/sites/MLM/domain_discovery/search', { q: String(titulo).slice(0, 120), limit: 4 })
  return (Array.isArray(r) ? r : []).map(x => ({
    categoria_id: x.category_id, categoria_nombre: x.category_name, dominio: x.domain_name,
  }))
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
  poner('GTIN', b.gtin)
  poner('SELLER_SKU', b.sku)
  const p = {
    ...(familia ? { family_name: b.titulo } : { title: b.titulo }),
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
      const causas = (e.detalle?.cause || []).filter(c => c.type !== 'warning').map(c => c.message || c.code)
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
