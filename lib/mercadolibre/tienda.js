// Lee la página de un producto en una tienda (Amazon, Walmart, Target, Costco…) y saca
// nombre, marca, descripción, fotos, código de barras y precio. SOLO LEE la página pública.
// Varias tiendas bloquean a los programas automáticos: en ese caso se avisa claramente.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export function urlSegura(texto) {
  let u
  try { u = new URL(String(texto || '').trim()) } catch { return null }
  if (!['http:', 'https:'].includes(u.protocol)) return null
  const h = u.hostname.toLowerCase()
  if (!h.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|lan)$/.test(h)) return null
  return u
}

export function nombreTienda(u) {
  const h = u.hostname.replace(/^www\./, '').toLowerCase()
  const mapa = [['amazon', 'Amazon'], ['walmart', 'Walmart'], ['target', 'Target'], ['costco', 'Costco'], ['samsclub', "Sam's Club"], ['tjmaxx', 'TJ Maxx'], ['marshalls', 'Marshalls'], ['rossstores', 'Ross'], ['fivebelow', 'Five Below'], ['iherb', 'iHerb'], ['ulta', 'Ulta'], ['sephora', 'Sephora'], ['bestbuy', 'Best Buy'], ['homedepot', 'Home Depot'], ['uniqlo', 'Uniqlo']]
  for (const [k, n] of mapa) if (h.includes(k)) return n
  return h.split('.').slice(-2, -1)[0] || h
}

const ENT = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#x27;': "'" }
const limpiar = (t) => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&(amp|quot|#39|apos|lt|gt|nbsp|#x27);/g, m => ENT[m] || m).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()

function gtinValido(v) { const s = String(v || '').replace(/\D/g, ''); return /^\d{8}$|^\d{12,14}$/.test(s) ? s : null }
const aLista = (x) => x == null ? [] : Array.isArray(x) ? x : [x]

function productosJsonLd(html) {
  const salida = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  const visitar = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(visitar)
    const tipo = aLista(n['@type']).map(String)
    if (tipo.some(t => /Product/i.test(t))) salida.push(n)
    if (n['@graph']) visitar(n['@graph'])
  }
  while ((m = re.exec(html))) { try { visitar(JSON.parse(m[1].trim())) } catch {} }
  return salida
}

const meta = (html, prop) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'gi')
  const salida = []
  let m
  while ((m = re.exec(html))) salida.push(limpiar(m[1] ?? m[2]))
  return salida
}

export async function leerPaginaTienda(textoUrl) {
  const u0 = urlSegura(textoUrl)
  if (!u0) return { ok: false, mensaje: 'Ese enlace no es válido. Pega la dirección completa del producto (https://…).' }
  let u = u0, r, html = ''
  try {
    for (let salto = 0; salto < 4; salto++) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 14000)
      r = await fetch(u.toString(), { signal: ctrl.signal, redirect: 'manual', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } })
      clearTimeout(t)
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        const sig = urlSegura(new URL(r.headers.get('location'), u).toString())
        if (!sig) return { ok: false, mensaje: 'La tienda redirigió a una dirección no permitida.' }
        u = sig; continue
      }
      break
    }
    html = (await r.text()).slice(0, 3_000_000)
  } catch {
    return { ok: false, mensaje: 'La tienda no respondió a tiempo. Intenta de nuevo o pásame el enlace por el chat.', bloqueada: true }
  }
  const tienda = nombreTienda(u)
  const bloqueo = [403, 429, 503, 401].includes(r.status) || /captcha|robot check|are you a human|access denied|px-captcha|automated access/i.test(html.slice(0, 6000))
  const prods = productosJsonLd(html)
  const p = prods[0] || {}
  const ofertas = aLista(p.offers).flatMap(o => o?.offers ? aLista(o.offers) : [o])
  const precios = ofertas.filter(o => !o?.priceCurrency || /USD/i.test(o.priceCurrency)).map(o => parseFloat(o?.price ?? o?.lowPrice)).filter(x => x > 0)
  const og = (k) => meta(html, k)

  let imagenes = []
  for (const im of aLista(p.image)) imagenes.push(typeof im === 'string' ? im : im?.url || im?.contentUrl)
  imagenes.push(...og('og:image'))
  // Amazon: fotos grandes dentro del script de la galería
  for (const m of html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)) imagenes.push(m[1])
  imagenes = [...new Set(imagenes.filter(x => typeof x === 'string' && /^https?:\/\//.test(x)).map(x => x.replace(/^http:/, 'https:')))].slice(0, 10)

  const titulo = limpiar(p.name || og('og:title')[0] || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || '')
  const marcaRaw = typeof p.brand === 'string' ? p.brand : p.brand?.name
  const descripcion = limpiar(p.description || og('og:description')[0] || og('description')[0] || '').slice(0, 1800)
  const gtin = gtinValido(p.gtin13 || p.gtin12 || p.gtin14 || p.gtin8 || p.gtin || p.isbn)
  const mxn = ofertas.some(o => /MXN/i.test(o?.priceCurrency || '')) || /\.mx$/.test(u.hostname)
  const precio = mxn ? null : precios.length ? Math.min(...precios) : (parseFloat(og('product:price:amount')[0]) || null)

  if (r.status === 404 || r.status === 410 || /not found|404|page unavailable|oops|something went wrong|just a moment|attention required/i.test(titulo.slice(0, 80))) {
    return { ok: false, mensaje: `${tienda} dice que esa página no existe o no está disponible. Revisa el enlace.` }
  }
  if (!titulo || (bloqueo && !prods.length && !imagenes.length)) {
    return { ok: false, bloqueada: true, mensaje: `${tienda} no me dejó leer la página (suele bloquear a los programas automáticos). Pásame el enlace por el chat y lo leo desde tu Chrome.` }
  }
  return { ok: true, tienda, url: u.toString(), titulo, marca: marcaRaw ? limpiar(marcaRaw) : null, descripcion, imagenes, gtin, precio_usd: precio }
}

// Descarga una foto de la tienda y la guarda en el almacenamiento propio (MercadoLibre necesita
// una dirección pública y estable). Devuelve la URL pública o null.
export async function guardarFoto(supabase, urlFoto, carpeta, n, referer) {
  const u = urlSegura(urlFoto)
  if (!u) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(u.toString(), { signal: ctrl.signal, headers: { 'User-Agent': UA, Referer: referer || u.origin, Accept: 'image/*' } })
    clearTimeout(t)
    const tipo = (r.headers.get('content-type') || '').split(';')[0]
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length < 4000 || bytes.length > 8 * 1024 * 1024) return null
    const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg'
    const ruta = `ml-borradores/${carpeta}/${Date.now()}-${n}.${ext}`
    const { error } = await supabase.storage.from('productos').upload(ruta, bytes, { contentType: tipo, upsert: false })
    if (error) return null
    return supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
  } catch { return null }
}
