import Anthropic from '@anthropic-ai/sdk'
import { TEMPORADAS, FAMILIAS, TIENDAS_DENOG } from './comun'
import { encontrarEnlace, esDeTienda, urlBusqueda } from './enlaces'

// ---------------------------------------------------------------------------
// Virales en Instagram (pestaña "Redes sociales").
//
// Usa la búsqueda OFICIAL de hashtags de Instagram (Graph API, con el token
// del usuario del sistema "Sistema Denog" y la cuenta de IG denog.mx). No es
// scraping: es la API que Meta da para esto.
//
// Casi nadie escribe el producto en el texto ("comenta LINK y te lo mando"):
// el producto está en la FOTO. Por eso la IA mira las fotos (hasta 4 del
// carrusel) junto con el texto, y saca cada producto que se pueda identificar
// con marca y nombre: empaque, etiqueta de precio, letrero de Costco con su
// número de artículo, etc. Una publicación puede dar varios productos.
// Si no se distingue un producto concreto, no se guarda nada.
//
// Se guarda en `ofertas` con fuente 'instagram':
//  · una fila "marca" por publicación (guid = id de IG, util=false) para no
//    volverla a mandar a la IA;
//  · una fila por producto (guid = id#n).
//
// Límite de Meta: máximo 30 hashtags distintos cada 7 días por cuenta.
// ---------------------------------------------------------------------------

const VERSION = process.env.INSTAGRAM_API_VERSION || 'v23.0'
const GRAPH = `https://graph.facebook.com/${VERSION}`
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = process.env.VIRALES_MODELO || 'claude-haiku-4-5-20251001'
const DIAS = 30            // las más populares duran semanas; el producto sigue en tienda
const FOTOS_POR_POST = 4
const EN_PARALELO = 8

// hashtag → tienda donde se compra
export const HASHTAGS = {
  costcofinds: 'Costco',
  samsclubfinds: "Sam's",
  walmartfinds: 'Walmart',
  amazonfinds: 'Amazon',
  targetfinds: 'Target',
  fivebelowfinds: 'Five Below',
  costcobuys: 'Costco',
  costcodeals: 'Costco',
  samsclub: "Sam's",
  walmartdeals: 'Walmart',
  targetdeals: 'Target',
  amazonmusthaves: 'Amazon',
}

export const instagramConfigurado = () => !!process.env.INSTAGRAM_TOKEN

async function graph(ruta, params = {}, ms = 45000) {
  const u = ruta.startsWith('https://') ? new URL(ruta) : new URL(`${GRAPH}/${ruta}`)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  u.searchParams.set('access_token', String(process.env.INSTAGRAM_TOKEN || '').trim())
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(u, { signal: ctrl.signal, cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) {
      const e = new Error(j.error?.message || `HTTP ${r.status}`)
      e.codigo = j.error?.code
      throw e
    }
    return j
  } finally { clearTimeout(t) }
}

// La cuenta de Instagram de Denog (la que "busca" los hashtags).
let cuentaIg = null
export async function cuentaInstagram() {
  if (process.env.INSTAGRAM_USER_ID) return { id: process.env.INSTAGRAM_USER_ID, username: null }
  if (cuentaIg) return cuentaIg
  const j = await graph('me/accounts', { fields: 'name,instagram_business_account{id,username}' })
  const pag = (j.data || []).find(p => p.instagram_business_account)
  if (!pag) throw new Error('El token no tiene ninguna página de Facebook con Instagram conectado')
  cuentaIg = { id: pag.instagram_business_account.id, username: pag.instagram_business_account.username, pagina: pag.name }
  return cuentaIg
}

const CAMPOS = 'id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp'
const pesado = (e) => /reduce the amount|aborted|timeout/i.test(e.message) || e.codigo === 100 || e.codigo === 1

async function publicacionesDe(hashtag, userId) {
  const h = await graph('ig_hashtag_search', { user_id: userId, q: hashtag })
  const hid = h.data?.[0]?.id
  if (!hid) return []
  // Instagram tarda mucho con páginas grandes: de 25 en 25 (2 páginas), con
  // las fotos del carrusel. Si se queja, sin carrusel; si aún se queja, de 10.
  const intentos = [
    { fields: `${CAMPOS},children{media_type,media_url}`, limit: '25' },
    { fields: CAMPOS, limit: '25' },
    { fields: CAMPOS, limit: '10' },
  ]
  let j = null, usado = null
  for (const p of intentos) {
    try { j = await graph(`${hid}/top_media`, { user_id: userId, ...p }); usado = p; break }
    catch (e) { if (!pesado(e)) throw e }
  }
  if (!j) throw new Error('Instagram no respondió')
  const datos = [...(j.data || [])]
  if (j.paging?.next && usado.limit === '25') {
    try { const j2 = await graph(j.paging.next); datos.push(...(j2.data || [])) } catch { /* con la primera basta */ }
  }
  const corte = Date.now() - DIAS * 86400000
  return datos
    .filter(m => !m.timestamp || new Date(m.timestamp).getTime() >= corte)
    .map(m => {
      const fotos = []
      if (m.media_type !== 'VIDEO' && m.media_url) fotos.push(m.media_url)
      for (const c of m.children?.data || []) if (c.media_type === 'IMAGE' && c.media_url && !fotos.includes(c.media_url)) fotos.push(c.media_url)
      return {
        id: m.id, hashtag, tienda: HASHTAGS[hashtag], caption: m.caption || '', fotos: fotos.slice(0, FOTOS_POR_POST),
        permalink: m.permalink, likes: m.like_count ?? null, comentarios: m.comments_count ?? null,
        fecha: m.timestamp || null, video: m.media_type === 'VIDEO',
      }
    })
}

export async function leerInstagram() {
  const errores = []
  const cuenta = await cuentaInstagram()
  // De 3 en 3: Instagram se satura si se le piden todos los hashtags al mismo tiempo.
  const lista = Object.keys(HASHTAGS)
  const res = []
  for (let i = 0; i < lista.length; i += 3) {
    res.push(...await Promise.allSettled(lista.slice(i, i + 3).map(h => publicacionesDe(h, cuenta.id))))
  }
  const vistos = new Map()
  res.forEach((r, i) => {
    if (r.status === 'rejected') { errores.push(`Instagram #${lista[i]}: ${r.reason?.message || r.reason}`); return }
    for (const m of r.value) if (!vistos.has(m.id)) vistos.set(m.id, m)
  })
  return { publicaciones: [...vistos.values()], errores, cuenta }
}

// ── IA con visión: qué productos concretos hay en la publicación ──

function instrucciones(tipos) {
  return `Eres el comprador de Denog USA Compras (Hermosillo, Sonora). Denog compra en tiendas de EE.UU., recibe en Nogales, Arizona, y revende por WhatsApp con entrega cada 15 días.
Te paso UNA publicación viral de Instagram de compradores de EE.UU. (#costcofinds, #walmartfinds, etc.): sus fotos y su texto. Tu trabajo es decir QUÉ PRODUCTOS CONCRETOS se ven, para que Denog los busque en la tienda sin tener que ver la publicación.

Reglas:
- Mira bien las FOTOS: empaques, marcas, etiquetas y letreros de precio (en Costco el letrero trae precio y número de artículo; en Target la etiqueta trae precio).
- Solo incluye productos que alguien pueda encontrar EXACTOS en la tienda: con MARCA visible o dicha (ej. "Kirkland Signature Women's Shearling Slipper", "LEGO Halloween Minifigure Storage Head", "Stanley Quencher H2.0 40 oz", "Disney Stitch Plush Purse"). Si no se sabe la marca ni el nombre exacto ("suéter rojo", "camiseta blanca de niña", "set de ajedrez de madera", "dispensador de jabón"), NO lo incluyas: es imposible encontrarlo igual.
- VARIANTES = UN SOLO PRODUCTO: si son el mismo producto en varios colores, sabores, personajes o modelos (ej. 4 cabezas LEGO distintas, 3 sabores del mismo pan, llaveros de varios personajes), devuelve UNO solo y pon las variantes en "colores" (ej. "Calabaza, Esqueleto, Esqueleto verde y Zombie").
- Solo tiendas de EE.UU. Si la publicación es de otro país (Costco México, Japón, India, Reino Unido, Canadá…), o las marcas son de otro país, devuelve [].
- No sirven: comida congelada, refrigerada o preparada (burritos, pizzas, panes de pastelería, helado, carne, lácteos), alcohol, armas, medicamentos, muebles, lámparas, electrodomésticos (freidoras, licuadoras, máquinas de helado), colchones, boletos, servicios, tarjetas de regalo. Botanas, dulces y snacks empacados que no necesitan refrigeración SÍ sirven.
- Precio: si se ve o se dice, ponlo en "precio_usd". Si NO se ve, pon tu mejor estimado del precio normal en esa tienda en "precio_aprox" (número) y deja precio_usd en null.
- Solo productos de US$2 a US$60 (por el precio visto o el estimado). Si cuesta más, no lo incluyas.
- Máximo 6 productos por publicación. Si no hay ninguno concreto, devuelve [].

"Cada producto (los 3 primeros campos son OBLIGATORIOS y se revisan uno por uno):
- "pais": país de la publicación/tienda ("EE.UU.", "México", "India", "Japón"…).
- "conservacion": "ambiente" si se guarda en la alacena o el clóset; "refrigerado" o "congelado" si va en el refri/congelador (burritos, pizzas, masa, pan de pastelería, helado, lácteos, carne).
- "marca": la MARCA exacta del producto como viene en el empaque o la etiqueta (ej. "LEGO", "Kirkland Signature", "Botanist", "Wonder Nation", "Joyspun", "Cat & Jack", "EOS", "Squishmallows"). Si no se ve ni se dice la marca, null. El nombre de la tienda ("Walmart", "Amazon", "Target") NO es marca. "Estilo Miu Miu" o "inspirado en Free People" tampoco: eso es null.
- "nombre": EN INGLÉS, como se llama en la tienda (marca + producto + presentación/tamaño si se ve). Máximo 70 caracteres. Sin emojis.
- "tienda": dónde se compra ("Costco", "Sam's", "Walmart", "Target", "Amazon", "Five Below"…). Si no se ve, la del hashtag. Tiendas de Denog: ${TIENDAS_DENOG.join(', ')}.
- "articulo": número de artículo de la tienda si se ve (Costco "Item 1234567", Target DPCI "123-45-6789", Sam's "Item #"), o null.
- "busqueda": el texto EXACTO que escribirías en el buscador de esa tienda para que salga este producto de primero (marca + nombre del producto, en inglés).
- "precio_usd": número que se ve/dice, o null. "precio_aprox": tu estimado si no se ve, o null. "precio_antes_usd": número o null.
- "foto": número de la foto (empezando en 0) donde mejor se ve.
- "tipo": tipo de producto genérico en español, singular, sin marca (ej. "Organizador LEGO", "Llavero", "Pantuflas"). Reutiliza uno de estos SOLO si de verdad es lo mismo; si no, crea uno exacto: ${tipos.slice(0, 80).join(' | ') || '(ninguno)'}.
- "familia": una de: ${FAMILIAS.join(' | ')}.
- "temporadas": llaves de: ${Object.keys(TEMPORADAS).join(', ')} ("todo_el_ano" si no es de temporada).
- "tallas": tallas en español si es ropa/calzado y se ven o se dicen, o null.
- "colores": colores/sabores/aromas EN ESPAÑOL si se ven o se dicen (los nombres de aroma de marca se dejan igual), o null.
- "gancho": una línea corta y antojable para WhatsApp en español de Sonora, sin precio, máximo 1 emoji.
Responde SOLO un arreglo JSON.`
}

function parsearArreglo(texto) {
  const a = texto.indexOf('['), b = texto.lastIndexOf(']')
  if (a < 0 || b < 0) return []
  try { const r = JSON.parse(texto.slice(a, b + 1)); return Array.isArray(r) ? r : [] } catch { return [] }
}
const num = (x) => { const n = Number(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

async function bajarFoto(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 12000)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    const tipo = (r.headers.get('content-type') || '').split(';')[0]
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 4.5 * 1024 * 1024) return null
    return { type: 'image', source: { type: 'base64', media_type: tipo, data: buf.toString('base64') } }
  } catch { return null } finally { clearTimeout(t) }
}

async function productosDe(m, tipos) {
  const fotos = (await Promise.all(m.fotos.map(bajarFoto)))
  const bloques = []
  fotos.forEach((f, i) => { if (f) bloques.push({ type: 'text', text: `Foto ${i}:` }, f) })
  if (!bloques.length && m.caption.trim().length < 25) return []   // ni foto ni texto: nada que ver
  bloques.push({ type: 'text', text: `Hashtag: #${m.hashtag} (tienda probable: ${m.tienda})${m.video ? ' · es un VIDEO (no hay foto, solo el texto)' : ''}\nTexto de la publicación:\n${m.caption.slice(0, 1500)}` })
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 3000, system: instrucciones(tipos),
    messages: [{ role: 'user', content: bloques }],
  })
  return parsearArreglo(msg.content.filter(b => b.type === 'text').map(b => b.text).join('')).slice(0, 6)
}

const TIENDA_COMO_MARCA = /^(walmart|amazon|target|costco|sam'?s( club)?|five below|generic|gen[eé]rico|unbranded|sin marca|n\/?a|none|null|unknown|desconocida)$/i
const IMITACION = /\b(style|inspired|dupe|look ?for ?less|estilo|inspirad[oa])\b/i
const DE_EEUU = /ee\.?\s?uu|usa|u\.s\.|estados unidos|united states|^us$/i

// Filtros que la IA a veces se salta: sin marca, imitaciones, comida de refri, otros países.
function pasaFiltros(r) {
  const marca = String(r?.marca || '').trim()
  if (!marca || TIENDA_COMO_MARCA.test(marca) || IMITACION.test(marca)) return false
  if (IMITACION.test(String(r?.nombre || ''))) return false
  if (r?.conservacion && r.conservacion !== 'ambiente') return false
  if (r?.pais && !DE_EEUU.test(String(r.pais))) return false
  return true
}

function filaProducto(m, r, n) {
  if (!pasaFiltros(r)) return null
  const visto = num(r?.precio_usd)
  const aprox = visto == null ? num(r?.precio_aprox) : null
  const precio = visto ?? aprox
  if (!r?.nombre || (precio != null && (precio < 2 || precio > 60))) return null
  const foto = m.fotos[Number(r.foto)] || m.fotos[0] || null
  return {
    fuente: 'instagram', guid: `${m.id}#${n}`, titulo_original: m.caption.slice(0, 300),
    url_fuente: m.permalink || null, url: m.permalink || null, imagen_url: foto,
    publicado_fuente: m.fecha, procesada: true, util: true,
    me_gusta: m.likes, comentarios: m.comentarios, hashtag: m.hashtag,
    tienda: String(r.tienda || m.tienda).slice(0, 40),
    nombre: String(r.nombre).slice(0, 120),
    precio_usd: precio,
    precio_aprox: aprox != null,
    precio_antes_usd: num(r.precio_antes_usd),
    tipo: r.tipo ? String(r.tipo).slice(0, 60) : null,
    familia: FAMILIAS.includes(r.familia) ? r.familia : 'Otro',
    temporadas: Array.isArray(r.temporadas) ? r.temporadas.filter(t => TEMPORADAS[t]) : [],
    gancho: r.gancho ? String(r.gancho).slice(0, 200) : null,
    tallas: r.tallas ? String(r.tallas).slice(0, 80) : null,
    colores: r.colores ? String(r.colores).slice(0, 120) : null,
    _articulo: articuloLimpio(r.articulo),
    _busqueda: r.busqueda ? String(r.busqueda).slice(0, 90) : null,
  }
}

// "Item 2089827" → "2089827"; DPCI de Target "123-45-6789" se queda con guiones.
function articuloLimpio(a) {
  const s = String(a || '').match(/\d[\d-]{4,}\d/)?.[0]
  return s && s.replace(/\D/g, '').length >= 5 ? s : null
}

// Un link de tienda escrito en el texto (ej. "amazon.com/dp/…"), si viene.
function linkEnTexto(caption) {
  for (const m of String(caption).matchAll(/https?:\/\/[^\s)]+|(?:www\.)?(?:amazon|walmart|target|costco|samsclub|fivebelow)\.com\/[^\s)]+/gi)) {
    const u = m[0].startsWith('http') ? m[0] : `https://${m[0]}`
    if (esDeTienda(u)) return u
  }
  return null
}

async function conLimite(lista, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) { const x = lista[i++]; await fn(x) }
  }))
}

// Corre todo: lee hashtags, manda a la IA lo nuevo (lo más viral primero), guarda.
// `max` = cuántas publicaciones nuevas revisar en esta corrida.
export async function actualizarVirales(supabase, tipos = [], { max = 100 } = {}) {
  if (!instagramConfigurado()) return { configurado: false, leidas: 0, nuevas: 0, utiles: 0, errores: [] }
  const { publicaciones, errores } = await leerInstagram()

  const ids = publicaciones.map(p => p.id)
  const ya = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('ofertas').select('guid').eq('fuente', 'instagram').in('guid', ids.slice(i, i + 200))
    for (const r of data || []) ya.add(r.guid)
  }
  const pendientes = publicaciones.filter(p => !ya.has(p.id)).sort((a, b) => (b.likes || 0) - (a.likes || 0))
  const nuevas = pendientes.slice(0, max)

  const filas = []
  let fallas = 0
  await conLimite(nuevas, EN_PARALELO, async (m) => {
    try {
      const productos = await productosDe(m, tipos)
      productos.forEach((r, n) => { const f = filaProducto(m, r, n); if (f) filas.push(f) })
      // Marca de la publicación: ya se revisó.
      filas.push({ fuente: 'instagram', guid: m.id, titulo_original: m.caption.slice(0, 300), url_fuente: m.permalink || null, url: m.permalink || null, imagen_url: m.fotos[0] || null, publicado_fuente: m.fecha, procesada: true, util: false, precio_aprox: false, temporadas: [], me_gusta: m.likes, comentarios: m.comentarios, hashtag: m.hashtag })
    } catch (e) {
      // Sin marca: se reintenta en la siguiente corrida.
      if (fallas++ < 3) errores.push(`IA Instagram: ${e.message}`)
    }
  })

  // Link a la tienda: el del texto si viene; si no, la búsqueda en la tienda
  // con el número de artículo (Costco/Target/Sam's) o el nombre exacto.
  const porId = new Map(nuevas.map(m => [m.id, m]))
  const utiles = filas.filter(f => f.util)
  await Promise.all(utiles.map(async f => {
    const link = linkEnTexto(porId.get(f.guid.split('#')[0])?.caption || '')
    if (link) {
      const e = await encontrarEnlace({ urlNota: link, tienda: f.tienda, nombre: f.nombre })
      if (e.tipo === 'producto') { f.url_tienda = e.url; f.enlace_tipo = 'producto' }
    }
    if (!f.url_tienda) {
      const porArticulo = f._articulo && /costco|sam|target/i.test(f.tienda)
      f.url_tienda = urlBusqueda(f.tienda, porArticulo ? f._articulo : (f._busqueda || f.nombre))
      f.enlace_tipo = 'busqueda'
    }
  }))
  for (const f of filas) { delete f._articulo; delete f._busqueda }

  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await supabase.from('ofertas').upsert(filas.slice(i, i + 200), { onConflict: 'fuente,guid', ignoreDuplicates: true, defaultToNull: false })
    if (error) errores.unshift(`Guardar Instagram: ${error.message}`)
  }

  // Likes al día de las que ya se tenían (las virales siguen subiendo).
  const viejas = publicaciones.filter(p => ya.has(p.id) && p.likes != null).slice(0, 150)
  await conLimite(viejas, 10, p => supabase.from('ofertas').update({ me_gusta: p.likes, comentarios: p.comentarios })
    .eq('fuente', 'instagram').like('guid', `${p.id}%`))

  return {
    configurado: true, leidas: publicaciones.length, nuevas: nuevas.length,
    faltan: Math.max(0, pendientes.length - nuevas.length), utiles: utiles.length, errores,
  }
}
