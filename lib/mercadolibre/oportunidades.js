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

// Analiza UNA oferta y devuelve la fila a guardar.
export async function analizarOferta(token, oferta, { tc = TC_DEFAULT, envioMediano = 0 } = {}) {
  const base = {
    oferta_id: oferta.id, nombre: oferta.nombre, tienda: oferta.tienda, precio_usd: oferta.precio_usd,
    imagen_url: oferta.imagen_url || null, url_oferta: oferta.url_tienda || oferta.url || null, familia: oferta.familia || null,
    actualizado_en: new Date().toISOString(),
  }
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
  const costo = Math.round(Number(oferta.precio_usd) * tc * (1 + IMPUESTO_US) * 100) / 100
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
