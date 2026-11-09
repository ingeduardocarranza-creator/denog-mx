// Oportunidades (Fase 4): toma las ofertas de EE. UU. que ya trae el sitio, las busca en el
// catálogo de MercadoLibre México y calcula cuántos vendedores hay, a qué precio se vende
// y cuánto te quedaría de ganancia. SOLO LEE de MercadoLibre.
import { mlGet } from './api'
import { calcularDinero } from './dinero'

export const TC_DEFAULT = 18.5      // tipo de cambio como en el cotizador
export const IMPUESTO_US = 0.086    // impuesto de compra en EE. UU. que usa el catálogo (8.6 %)
export const MARGEN_MIN = 15        // % de ganancia sobre costo para considerarla oportunidad

const PARASITAS = new Set(['pack', 'piece', 'pieces', 'count', 'set', 'with', 'for', 'and', 'the', 'men', 'womens', 'mens', 'women', 'kids', 'size', 'inch', 'ounce', 'oz', 'pk', 'ct', 'new', 'free', 'from'])
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const palabras = (s) => normal(s).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !PARASITAS.has(w) && !/^\d+$/.test(w))

const mediana = (arr) => { const a = [...arr].sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
const percentil = (arr, p) => { const a = [...arr].sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(a.length * p))] }

// Búsqueda en el catálogo de MercadoLibre y la mejor coincidencia por palabras.
async function mejorCoincidencia(token, nombre) {
  const buscar = palabras(nombre).slice(0, 7).join(' ')
  if (!buscar) return null
  const r = await mlGet(token, '/products/search', { status: 'active', site_id: 'MLM', q: buscar, limit: '5' })
  const mias = new Set(palabras(nombre))
  let mejor = null
  for (const p of r.results || []) {
    const marcaTxt = (p.attributes || []).find(a => a.id === 'BRAND')?.value_name || ''
    const marca = palabras(marcaTxt)
    const suyas = new Set(palabras(`${p.name || ''} ${marcaTxt} ${(p.attributes || []).filter(a => ['MODEL', 'LINE'].includes(a.id)).map(a => a.value_name).join(' ')}`))
    const comunes = [...mias].filter(w => suyas.has(w)).length
    // 1) Mi nombre debe compartir ≥60 % de sus palabras clave con el de MercadoLibre.
    const cuota = comunes / Math.max(2, Math.min(mias.size, 5))
    // 2) …y el de MercadoLibre debe parecerse a mí (evita "Bounce hair bands" ↔ "Bounce pet hair sheets").
    const suyasN = palabras(p.name || '').slice(0, 8)
    const inversa = suyasN.length ? suyasN.filter(w => mias.has(w)).length / suyasN.length : 0
    // 3) La marca de MercadoLibre debe aparecer en mi nombre (o coincidir casi todo si no tiene marca).
    const marcaOk = marca.length ? marca.every(w => mias.has(w)) : cuota >= 0.85
    if (comunes >= 2 && cuota >= 0.6 && inversa >= 0.35 && marcaOk) {
      const puntaje = cuota + inversa
      if (!mejor || puntaje > mejor.puntaje) mejor = { p, puntaje }
    }
  }
  return mejor?.p || null
}

const cacheCat = new Map() // categoría → { ranking: Map(id→pos), tendencias: [kw] }
async function senalesDeCategoria(token, cat) {
  if (cacheCat.has(cat)) return cacheCat.get(cat)
  const [h, t] = await Promise.all([
    mlGet(token, `/highlights/MLM/category/${cat}`).catch(() => null),
    mlGet(token, `/trends/MLM/${cat}`).catch(() => null),
  ])
  const ranking = new Map((h?.content || []).map(x => [x.id, x.position]))
  const tendencias = (Array.isArray(t) ? t : []).map(x => normal(x.keyword))
  const v = { ranking, tendencias }
  cacheCat.set(cat, v)
  return v
}

// ¿Ya tienes este producto en tu catálogo? Se compara por palabras clave (en cualquier idioma, marcas y números).
export function buscarEnMiCatalogo(catalogo, nombre) {
  const mias = new Set(palabras(nombre))
  if (mias.size < 2) return null
  let mejor = null
  for (const p of catalogo || []) {
    const suyas = new Set(palabras(p.nombre))
    const comunes = [...mias].filter(w => suyas.has(w)).length
    if (comunes < 2) continue
    const cuota = comunes / Math.min(mias.size, 5), inversa = comunes / Math.min(suyas.size || 1, 5)
    if (Math.max(cuota, inversa) < 0.6) continue
    const puntaje = cuota + inversa
    if (!mejor || puntaje > mejor.puntaje) mejor = { p, puntaje }
  }
  return mejor?.p || null
}

// Analiza UNA oferta y devuelve la fila a guardar.
export async function analizarOferta(token, oferta, { tc = TC_DEFAULT, envioMediano = 0, catalogo = [] } = {}) {
  const base = {
    oferta_id: oferta.id, nombre: oferta.nombre, tienda: oferta.tienda, precio_usd: oferta.precio_usd,
    imagen_url: oferta.imagen_url || null, url_oferta: oferta.url_tienda || oferta.url || null, familia: oferta.familia || null,
    actualizado_en: new Date().toISOString(),
  }
  // Si ya lo tienes en el catálogo, el costo es el real (no el estimado) y se avisa cuántas piezas hay.
  const mio = buscarEnMiCatalogo(catalogo, oferta.nombre)
  if (mio) { base.producto_id = mio.id; base.stock_catalogo = mio.stock ?? 0 }
  const prod = await mejorCoincidencia(token, oferta.nombre)
  if (!prod) return { ...base, tipo: 'sin_coincidencia' }

  const of = await mlGet(token, `/products/${prod.id}/items`, { limit: '50' }).catch(() => ({ results: [] }))
  const ofertas = of.results || []
  const vendedores = new Set(ofertas.map(o => o.seller_id)).size
  const precios = ofertas.map(o => Number(o.price)).filter(n => n > 0)
  const categoria = ofertas[0]?.category_id || null
  const fila = {
    ...base, ml_producto_id: prod.id, ml_nombre: prod.name || null, ml_foto: prod.pictures?.[0]?.url?.replace(/^http:/, 'https:') || null,
    ml_categoria: categoria, vendedores,
    precio_min: precios.length ? Math.min(...precios) : null, precio_mediana: mediana(precios), precio_max: precios.length ? Math.max(...precios) : null,
    envio_gratis_pct: ofertas.length ? Math.round(100 * ofertas.filter(o => o.shipping?.free_shipping).length / ofertas.length) : null,
  }
  const estimado = Math.round(Number(oferta.precio_usd) * tc * (1 + IMPUESTO_US) * 100) / 100
  const costo = mio && Number(mio.costo) > 0 ? Number(mio.costo) : estimado
  fila.costo_fuente = mio && Number(mio.costo) > 0 ? 'catalogo' : 'estimado'
  if (!vendedores || !precios.length) return { ...fila, tipo: 'sin_vendedores', costo_mxn: costo }

  // Demanda: ¿está entre los 20 más vendidos de su categoría o en las búsquedas en tendencia?
  if (categoria) {
    const s = await senalesDeCategoria(token, categoria)
    fila.ranking = s.ranking.get(prod.id) ?? null
    const mias = palabras(prod.name)
    fila.tendencia = s.tendencias.some(k => { const kw = k.split(/\s+/).filter(w => w.length > 2); return kw.length && kw.every(w => mias.includes(w)) })
  }

  // Precio al que venderías: nicho → la mediana; mucha competencia → el 25 % más barato para competir.
  const tipo = vendedores <= 4 ? 'nicho' : vendedores >= 10 ? 'competida' : 'intermedia'
  const objetivo = tipo === 'competida' ? percentil(precios, 0.25) : mediana(precios)

  let comisionPct = null
  if (categoria && objetivo) {
    const lp = await mlGet(token, '/sites/MLM/listing_prices', { price: String(objetivo), category_id: categoria, listing_type_id: 'gold_special' }).catch(() => null)
    const fee = Array.isArray(lp) ? lp[0]?.sale_fee_amount : lp?.sale_fee_amount
    if (fee != null) comisionPct = Math.round(fee / objetivo * 10000) / 100
  }
  // MercadoLibre solo obliga a pagar el envío al vendedor en ventas de $299 o más.
  const envio = objetivo >= 299 ? envioMediano : 0
  const din = calcularDinero({ precio: objetivo, costo, comisionPct, envio })
  return {
    ...fila, tipo, costo_mxn: costo, precio_objetivo: objetivo, comision_pct: comisionPct, envio_est: envio,
    ganancia: din?.ganancia ?? null, sobre_costo_pct: din?.sobre_costo_pct ?? null, margen_pct: din?.margen_pct ?? null,
  }
}

// ── Borrador desde una oportunidad ─────────────────────────────────────────
// Medidas ESTIMADAS por tipo de producto (ancho, alto, largo en cm; peso en g). El admin las ajusta.
const MEDIDAS = {
  'Juguetes': [20, 10, 25, 500], 'Comida y snacks': [15, 10, 20, 500], 'Hogar y cocina': [25, 15, 30, 900],
  'Accesorios y bolsas': [25, 10, 30, 500], 'Decoración de temporada': [20, 8, 25, 400], 'Útiles escolares y libros': [20, 5, 25, 350],
}
const MEDIDAS_BASE = [15, 10, 20, 400]
const ATRIBUTOS_OMITIDOS = new Set(['GTIN', 'ITEM_CONDITION', 'SELLER_SKU', 'EMPTY_GTIN_REASON', 'PRODUCT_FEATURES', 'ALPHANUMERIC_MODEL'])

const recortar = (t, n) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim()
  if (s.length <= n) return s
  const corte = s.slice(0, n)
  return corte.slice(0, Math.max(corte.lastIndexOf(' '), 20)).replace(/[\s,.;:+-]+$/, '')
}

// Arma el borrador con lo que ya se sabe del producto en el catálogo de MercadoLibre.
export async function armarBorradorDeOportunidad(token, op, oferta, { dias = 9 } = {}) {
  const prod = await mlGet(token, `/products/${op.ml_producto_id}`).catch(() => ({}))
  const gtinCatalogo = (prod.attributes || []).find(a => a.id === 'GTIN')?.value_name?.split(',')[0]?.trim() || null
  // Se omiten los códigos internos (ASIN de Amazon, etc.) que no le dicen nada al comprador.
  const attrs = (prod.attributes || []).filter(a => a.value_name && !ATRIBUTOS_OMITIDOS.has(a.id) && !/^B0[A-Z0-9]{8}$/.test(String(a.value_name)))
  const marca = attrs.find(a => a.id === 'BRAND')?.value_name || null

  // Fotos: las del producto en MercadoLibre primero y la de la oferta de EE. UU. al final
  // (las de Instagram caducan, no se usan).
  const imagenes = (prod.pictures || []).map(p => String(p.url || '').replace(/^http:/, 'https:')).filter(Boolean).slice(0, 4)
  if (op.ml_foto && !imagenes.includes(op.ml_foto)) imagenes.unshift(String(op.ml_foto).replace(/^http:/, 'https:'))
  const us = oferta?.imagen_url
  if (us && /^https:\/\//.test(us) && !/cdninstagram|fbcdn/.test(us)) imagenes.push(us)

  // Categoría y su nombre.
  let categoria_id = op.ml_categoria || null
  let categoria_nombre = null
  if (!categoria_id) {
    const { sugerirCategorias } = await import('./borradores')
    const sug = await sugerirCategorias(token, op.ml_nombre || op.nombre, null, null).catch(() => [])
    categoria_id = sug[0]?.categoria_id || null
    categoria_nombre = sug[0]?.categoria_nombre || null
  }
  if (categoria_id && !categoria_nombre) categoria_nombre = (await mlGet(token, `/categories/${categoria_id}`).catch(() => ({}))).name || categoria_id

  const [ancho, alto, largo, peso] = MEDIDAS[op.familia] || MEDIDAS_BASE
  const atributos = {
    ...(marca ? { BRAND: marca } : {}),
    SELLER_PACKAGE_WIDTH: `${ancho} cm`, SELLER_PACKAGE_HEIGHT: `${alto} cm`, SELLER_PACKAGE_LENGTH: `${largo} cm`, SELLER_PACKAGE_WEIGHT: `${peso} g`,
  }
  const titulo = recortar(op.ml_nombre || op.nombre, 60)
  const caract = attrs.filter(a => a.id !== 'BRAND').slice(0, 8).map(a => `• ${a.name}: ${String(a.value_name).slice(0, 80)}`)
  const descripcion = [
    titulo,
    '',
    'Producto original importado de Estados Unidos.',
    marca ? `Marca: ${marca}.` : null,
    caract.length ? '\nCaracterísticas:\n' + caract.join('\n') : null,
    `\nSe importa bajo pedido: la entrega es de aproximadamente ${dias} días. Envío por Mercado Envíos a todo México.`,
    '\nPregúntanos antes de comprar, con gusto te ayudamos.',
  ].filter(x => x != null).join('\n')

  return {
    titulo, descripcion, categoria_id, categoria_nombre,
    precio: op.precio_objetivo ? Math.ceil(Number(op.precio_objetivo)) : null,
    cantidad: 10, dias_entrega: dias, gtin: null, sku: null,
    costo: op.costo_mxn, imagenes, atributos,
    catalogo_producto_id: op.ml_producto_id, catalogo_nombre: op.ml_nombre || null,
    _gtin: /^\d{8}$|^\d{12,14}$/.test(gtinCatalogo || '') ? gtinCatalogo : null,
  }
}


// ── Proceso por lotes (lo usan la pantalla y la corrida automática) ─────────
const EXCLUIDAS = ['Ropa', 'Calzado']
const CAMPOS_OFERTA = 'id, nombre, tienda, precio_usd, imagen_url, url, url_tienda, familia, descartado'

export async function envioMedianoDe(supabase) {
  const { data } = await supabase.from('ml_ventas').select('envio_costo').not('envio_costo', 'is', null).gt('envio_costo', 0).order('fecha_venta', { ascending: false }).limit(60)
  const a = (data || []).map(x => Number(x.envio_costo)).sort((x, y) => x - y)
  return a.length ? a[a.length >> 1] : 0
}

// Supabase entrega máximo 1,000 filas por consulta: se lee por páginas.
async function leerTodo(armar, tope = 20000) {
  const filas = []
  for (let desde = 0; desde < tope; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return filas
}

// Ofertas de EE. UU. que todavía no se han analizado (las más nuevas primero).
export async function pendientesDe(supabase, max) {
  const hechas = await leerTodo(() => supabase.from('ml_oportunidades').select('oferta_id').order('oferta_id'))
  const ya = new Set(hechas.map(x => x.oferta_id))
  const todas = await leerTodo(() => supabase.from('ofertas').select(CAMPOS_OFERTA).gt('precio_usd', 0).not('nombre', 'is', null).order('creado_en', { ascending: false }).order('id'))
  const lista = todas.filter(o => !ya.has(o.id) && !o.descartado && !EXCLUIDAS.includes(o.familia))
  return { lista: lista.slice(0, max), total: lista.length }
}

// Oportunidades ya encontradas cuyo precio tiene más de 7 días: se vuelven a revisar para que no se desactualicen.
export async function viejasDe(supabase, max) {
  const limite = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data: filas } = await supabase.from('ml_oportunidades').select('oferta_id')
    .in('tipo', ['nicho', 'intermedia', 'competida']).eq('descartada', false).lt('actualizado_en', limite).order('actualizado_en').limit(max)
  const ids = (filas || []).map(x => x.oferta_id)
  if (!ids.length) return []
  const { data } = await supabase.from('ofertas').select(CAMPOS_OFERTA).in('id', ids)
  return data || []
}

// Analiza una lista de ofertas con 4 en paralelo y guarda el resultado.
export async function analizarYGuardar(supabase, token, lista, { tc = TC_DEFAULT } = {}) {
  const envio = await envioMedianoDe(supabase)
  const { data: catalogo } = await supabase.from('productos_tienda').select('id, nombre, costo, stock').eq('activo', true).limit(2000)
  const filas = []
  let i = 0
  const trabajador = async () => {
    while (i < lista.length) {
      const o = lista[i++]
      try { filas.push(await analizarOferta(token, o, { tc, envioMediano: envio, catalogo: catalogo || [] })) }
      catch (e) { console.error('oportunidad', o.id, e.message) }
    }
  }
  await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()])
  if (filas.length) {
    const { error } = await supabase.from('ml_oportunidades').upsert(filas, { onConflict: 'oferta_id' })
    if (error) throw new Error(error.message)
  }
  return filas
}
