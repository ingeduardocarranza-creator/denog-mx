// ---------------------------------------------------------------------------
// Fuentes de ofertas en volumen.
//
// En vez de que la IA busque producto por producto (caro), se leen los
// "feeds" (RSS) de sitios de ofertas de EE.UU. que ya juntan, todos los días,
// las rebajas de Amazon, Walmart, Target, Costco, etc. Un feed RSS es una
// lista pública hecha justamente para que otros programas la lean — no es
// scraping. Después Haiku (el modelo barato) traduce, filtra a las tiendas de
// Denog y clasifica (ver lib/tendencias/ofertas.js).
//
// Para agregar una fuente: un objeto más en FUENTES. Tipos:
//  · 'rss'      → cada <item> es una oferta.
//  · 'articulos'→ cada <item> es un artículo con MUCHOS productos (cuponeras
//                de Costco): se abre la página y la IA saca todos.
// ---------------------------------------------------------------------------

export const FUENTES = [
  { id: 'hip2save', nombre: 'Hip2Save', tipo: 'rss', url: 'https://hip2save.com/feed/' },
  { id: 'hip2save', nombre: 'Hip2Save', tipo: 'rss', url: 'https://hip2save.com/feed/?paged=2' },
  { id: 'dealnews', nombre: 'DealNews', tipo: 'rss', url: 'https://www.dealnews.com/?rss=1' },
  { id: 'costcoinsider', nombre: 'Costco Insider', tipo: 'articulos', url: 'https://www.costcoinsider.com/feed/', maxArticulos: 2, tienda: 'Costco' },
]

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 DenogOfertas/1.0'

async function bajar(url, ms = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8' }, cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally { clearTimeout(t) }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' }
export function limpiarTexto(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z0-9#]+);/gi, (m, k) => ENT[k.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, ' ')   // HTML que venía escapado (&lt;img…&gt;)
    .replace(/\s+/g, ' ').trim()
}

function etiqueta(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1] : ''
}
function atributo(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}\\s[^>]*${attr}=["']([^"']+)["']`, 'i'))
  return m ? m[1].replace(/&amp;/g, '&') : ''
}

function imagenDeItem(xml) {
  const thumb = limpiarTexto(etiqueta(xml, 'thumbnail-image'))
  // Hip2Save manda la miniatura (?resize=306,182); sin el parámetro es la foto completa.
  if (/^https:\/\//.test(thumb)) return thumb.replace(/\?resize=[\d,%C]+$/i, '')
  let img = atributo(xml, 'media:content', 'url') || atributo(xml, 'media:thumbnail', 'url') || atributo(xml, 'enclosure', 'url')
  if (!img) {
    const m = (etiqueta(xml, 'content:encoded') + etiqueta(xml, 'description')).match(/<img[^>]+src=["']([^"']+)["']/i)
      || (etiqueta(xml, 'content:encoded') + etiqueta(xml, 'description')).match(/&lt;img[^&]+src=(?:&quot;|")([^&"]+)/i)
    if (m) img = m[1].replace(/&amp;/g, '&')
  }
  // DealNews manda miniaturas de 250 px; se pide más grande.
  if (/d\.dlnws\.com/.test(img)) img = img.replace(/[?&]h=\d+&w=\d+/, '?h=600&w=600')
  return /^https:\/\//.test(img) ? img : null
}

export function leerRss(xml) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  return items.map(it => {
    const link = limpiarTexto(etiqueta(it, 'link'))
    const guid = limpiarTexto(etiqueta(it, 'guid')) || link
    const precio = limpiarTexto(etiqueta(it, 'dealnews:price'))
    const tienda = limpiarTexto(etiqueta(it, 'dealnews:retailer'))
    const fecha = limpiarTexto(etiqueta(it, 'pubDate'))
    return {
      guid,
      titulo: limpiarTexto(etiqueta(it, 'title')),
      link,
      texto: limpiarTexto(etiqueta(it, 'description')).slice(0, 600),
      tiendaFuente: tienda || null,
      precioFuente: precio || null,
      imagen: imagenDeItem(it),
      fecha: fecha && !isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : null,
    }
  }).filter(x => x.guid && x.titulo)
}

// Devuelve [{ fuente, guid, titulo, link, texto, imagen, fecha, ... , articulo?: texto largo }]
export async function leerFuentes() {
  const resultado = []
  const errores = []
  await Promise.all(FUENTES.map(async (f) => {
    try {
      const xml = await bajar(f.url)
      const items = leerRss(xml)
      if (f.tipo === 'rss') {
        for (const it of items) resultado.push({ ...it, fuente: f.id, fuenteNombre: f.nombre })
      } else {
        for (const it of items.slice(0, f.maxArticulos || 2)) {
          try {
            const html = await bajar(it.link, 20000)
            const cuerpo = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0]
            resultado.push({ ...it, fuente: f.id, fuenteNombre: f.nombre, tiendaFuente: f.tienda || null, articulo: limpiarTexto(cuerpo).slice(0, 24000) })
          } catch (e) { errores.push(`${f.nombre}: ${e.message}`) }
        }
      }
    } catch (e) { errores.push(`${f.nombre}: ${e.message}`) }
  }))
  return { items: resultado, errores }
}
