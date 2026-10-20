// ---------------------------------------------------------------------------
// Link directo a la tienda.
//
// Los sitios de ofertas (Hip2Save, DealNews) enlazan a su propia nota; la
// nota trae el botón a la tienda. Aquí se abre la nota (una vez por oferta,
// al traerla) y se saca el link de la tienda — quitando envolturas de
// afiliados que traen la URL real dentro (…?u=https%3A%2F%2Fwww.walmart.com…)
// y la basura de rastreo. No se siguen redirecciones de terceros.
//
// Si no se encuentra el producto exacto, se usa la BÚSQUEDA de esa tienda con
// el nombre del producto: casi siempre sale primero.
// ---------------------------------------------------------------------------

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 DenogOfertas/1.0'

// Página de producto de cada tienda → { tienda, limpiar(url) }
const TIENDAS = [
  { tienda: 'Amazon', re: /(^|\.)amazon\.com$/i, producto: (u) => { const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i); return m ? `https://www.amazon.com/dp/${m[1].toUpperCase()}` : null } },
  { tienda: 'Walmart', re: /(^|\.)walmart\.com$/i, producto: (u) => /\/ip\//.test(u.pathname) ? `https://www.walmart.com${u.pathname}` : null },
  { tienda: 'Target', re: /(^|\.)target\.com$/i, producto: (u) => /\/p\//.test(u.pathname) ? `https://www.target.com${u.pathname}` : null },
  { tienda: 'Costco', re: /(^|\.)costco\.com$/i, producto: (u) => /\.product\./.test(u.pathname) ? `https://www.costco.com${u.pathname}` : null },
  { tienda: "Sam's", re: /(^|\.)samsclub\.com$/i, producto: (u) => /\/p\//.test(u.pathname) ? `https://www.samsclub.com${u.pathname}` : null },
  { tienda: 'Bath & Body Works', re: /(^|\.)bathandbodyworks\.com$/i, producto: (u) => /\/p\//.test(u.pathname) ? `https://www.bathandbodyworks.com${u.pathname}` : null },
  { tienda: 'Five Below', re: /(^|\.)fivebelow\.com$/i, producto: (u) => /\/products\//.test(u.pathname) ? `https://www.fivebelow.com${u.pathname}` : null },
  { tienda: 'Old Navy', re: /(^|\.)oldnavy\.gap\.com$/i, producto: (u) => u.searchParams.get('pid') ? `https://oldnavy.gap.com/browse/product.do?pid=${u.searchParams.get('pid')}` : null },
  { tienda: "Kohl's", re: /(^|\.)kohls\.com$/i, producto: (u) => /\/product\//.test(u.pathname) ? `https://www.kohls.com${u.pathname}` : null },
  { tienda: 'Ulta', re: /(^|\.)ulta\.com$/i, producto: (u) => /\/p\//.test(u.pathname) ? `https://www.ulta.com${u.pathname}` : null },
  { tienda: 'eBay', re: /(^|\.)ebay\.com$/i, producto: (u) => { const m = u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/); return m ? `https://www.ebay.com/itm/${m[1]}` : null } },
  { tienda: 'JCPenney', re: /(^|\.)jcpenney\.com$/i, producto: (u) => /\/p\//.test(u.pathname) ? `https://www.jcpenney.com${u.pathname}` : null },
  { tienda: 'Nike', re: /(^|\.)nike\.com$/i, producto: (u) => /\/t\//.test(u.pathname) ? `https://www.nike.com${u.pathname}` : null },
]

const BUSQUEDA = {
  Amazon: (q) => `https://www.amazon.com/s?k=${q}`,
  Walmart: (q) => `https://www.walmart.com/search?q=${q}`,
  Target: (q) => `https://www.target.com/s?searchTerm=${q}`,
  Costco: (q) => `https://www.costco.com/s?keyword=${q}`,
  "Sam's": (q) => `https://www.samsclub.com/s/${q}`,
  'Bath & Body Works': (q) => `https://www.bathandbodyworks.com/search?q=${q}`,
  'Five Below': (q) => `https://www.fivebelow.com/search?q=${q}`,
  'Old Navy': (q) => `https://oldnavy.gap.com/browse/search.do?searchText=${q}`,
  "Kohl's": (q) => `https://www.kohls.com/search.jsp?search=${q}`,
  Ulta: (q) => `https://www.ulta.com/search?search=${q}`,
  eBay: (q) => `https://www.ebay.com/sch/i.html?_nkw=${q}`,
  JCPenney: (q) => `https://www.jcpenney.com/s?searchTerm=${q}`,
  Nike: (q) => `https://www.nike.com/w?q=${q}`,
}

function normalizarTienda(t) {
  const s = String(t || '').toLowerCase()
  if (s.includes('sam')) return "Sam's"
  if (s.includes('bath') || s === 'bbw') return 'Bath & Body Works'
  if (s.includes('kohl')) return "Kohl's"
  if (s.includes('old navy')) return 'Old Navy'
  if (s.includes('five below')) return 'Five Below'
  if (s.includes('jcp') || s.includes('penney')) return 'JCPenney'
  if (s.includes('ebay')) return 'eBay'
  for (const k of Object.keys(BUSQUEDA)) if (s.includes(k.toLowerCase())) return k
  return null
}

export function urlBusqueda(tienda, nombre) {
  const q = encodeURIComponent(String(nombre || '').replace(/\s+/g, ' ').trim().slice(0, 90))
  const t = normalizarTienda(tienda)
  if (t && BUSQUEDA[t]) return BUSQUEDA[t](q)
  return `https://www.google.com/search?tbm=shop&q=${q}`
}

// Desenvuelve links de afiliado que traen la URL real como parámetro.
function desenvolver(href, profundidad = 0) {
  let u
  try { u = new URL(href) } catch { return null }
  if (profundidad < 3) {
    for (const k of ['u', 'url', 'murl', 'dest', 'destination', 'redirect', 'redirect_url', 'r', 'ued', 'lp', 'goto']) {
      const v = u.searchParams.get(k)
      if (v && /^https?:/i.test(v)) { const d = desenvolver(v, profundidad + 1); if (d) return d }
    }
  }
  return u
}

export function aEnlaceTienda(href) {
  const u = desenvolver(String(href || '').replace(/&amp;/g, '&'))
  if (!u) return null
  const t = TIENDAS.find(x => x.re.test(u.hostname))
  if (!t) return null
  const producto = t.producto(u)
  return producto ? { tienda: t.tienda, url: producto } : null
}

const palabras = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2))

// Abre la nota y devuelve { url, tipo: 'producto' | 'busqueda' }.
export async function encontrarEnlace({ urlNota, tienda, nombre }) {
  const tiendaN = normalizarTienda(tienda)
  try {
    if (urlNota && /^https:\/\//.test(urlNota)) {
      const directo = aEnlaceTienda(urlNota)
      if (directo) return { url: directo.url, tipo: 'producto' }
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(urlNota, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html' } }).finally(() => clearTimeout(t))
      if (res.ok) {
        const html = (await res.text()).slice(0, 600000)
        const cuerpo = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0]
        const objetivo = palabras(nombre)
        const candidatos = []
        const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
        let m
        while ((m = re.exec(cuerpo))) {
          const e = aEnlaceTienda(m[1])
          if (!e) continue
          const texto = palabras(m[2].replace(/<[^>]+>/g, ' '))
          let comunes = 0
          for (const w of texto) if (objetivo.has(w)) comunes++
          candidatos.push({ ...e, comunes, orden: candidatos.length, mismaTienda: !tiendaN || e.tienda === tiendaN })
        }
        candidatos.sort((a, b) => (b.mismaTienda - a.mismaTienda) || (b.comunes - a.comunes) || (a.orden - b.orden))
        if (candidatos[0]) return { url: candidatos[0].url, tipo: 'producto' }
      }
    }
  } catch { /* se cae a la búsqueda */ }
  return { url: urlBusqueda(tienda, nombre), tipo: 'busqueda' }
}
