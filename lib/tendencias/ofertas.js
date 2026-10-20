import Anthropic from '@anthropic-ai/sdk'
import { traerTodo } from '@/lib/traerTodo'
import { leerFuentes } from './fuentes'
import { TEMPORADAS, FAMILIAS } from './comun'

// ---------------------------------------------------------------------------
// Ofertas del día: feeds de ofertas → Haiku → tabla `ofertas` → puntaje.
//
// Costo: solo se manda a la IA lo que no se había visto antes. Una corrida
// normal son 50–150 ofertas nuevas ≈ US$0.05–0.15 con Haiku.
// El puntaje (qué tanto le conviene a Denog) NO se guarda: se calcula al
// mostrar, con el historial de ventas del momento (ver puntuarOfertas).
// ---------------------------------------------------------------------------

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = 'claude-haiku-4-5-20251001'
const LOTE = 35
const MAX_NUEVAS = 180

export const TIENDAS_DENOG = ['Amazon', 'Walmart', 'Target', 'Costco', "Sam's", 'Bath & Body Works', 'Five Below', 'Old Navy', 'JCPenney', 'eBay', 'Ross', 'TJ Maxx', 'Marshalls', 'Burlington', 'Kohl\'s', 'Ulta', 'Sephora', 'Nike', 'Adidas', 'Carter\'s', 'Gap', 'Victoria\'s Secret']

function instrucciones(tipos) {
  return `Eres el comprador de Denog USA Compras (Hermosillo, Sonora). Denog compra en tiendas de EE.UU., recibe en Nogales, Arizona, y revende por WhatsApp con entrega cada 15 días.
Te paso ofertas publicadas hoy por sitios de ofertas de EE.UU. Para cada una decide si sirve para revender en México y clasifícala.

"util": true SOLO si se cumple todo:
- Se compra en una tienda física/en línea de EE.UU. que envíe a Arizona. Tiendas preferidas: ${TIENDAS_DENOG.join(', ')}.
- Es un producto físico concreto (no servicios, suscripciones, apps, viajes, tarjetas de regalo, cupones sin producto, rifas, "freebies" por encuesta).
- Se puede pasar a México sin problema: nada de alcohol, armas, cuchillos de caza, medicamentos con receta, carne o productos frescos, muebles grandes, colchones, llantas.
- Precio del producto entre US$2 y US$60 (si no se sabe el precio, false).

Para cada una devuelve:
- "tienda": la tienda donde se compra (normalizada, ej. "Amazon", "Walmart", "Costco", "Sam's").
- "nombre": título del producto EN INGLÉS, como aparece en la tienda pero corto y limpio (marca + producto + presentación, ej. "Champion Powerblend Hoodie", "Bath & Body Works Champagne Toast Body Mist 8 oz"). Sin precio, sin "deal", sin "shipped". Máximo 70 caracteres.
- "precio_usd": precio de oferta por pieza o paquete (número).
- "precio_antes_usd": precio regular si lo dicen (número o null).
- "tipo": tipo de producto genérico en español, singular, sin marca. Reutiliza uno de estos si aplica: ${tipos.slice(0, 80).join(' | ') || '(ninguno)'}.
- "familia": una de: ${FAMILIAS.join(' | ')}.
- "temporadas": llaves de: ${Object.keys(TEMPORADAS).join(', ')} ("todo_el_ano" si no es de temporada).
- "tallas": las tallas disponibles si es ropa/calzado y la oferta lo dice (ej. "S a XXL", "Niña 4 a 12", "Talla única"), o null.
- "colores": los colores o sabores/aromas disponibles si la oferta los menciona, escritos EN ESPAÑOL (ej. "Negro, gris y rosa"; los nombres de aroma de marca como "Champagne Toast" se dejan igual), o null. Las tallas también en español ("Niña", "Talla única").
- "gancho": una línea corta y antojable para WhatsApp en español de Sonora, sin precio, máximo 1 emoji.
Si "util" es false, solo devuelve {"i":n,"util":false}.
Responde SOLO un arreglo JSON.`
}

function parsearArreglo(texto) {
  const a = texto.indexOf('['), b = texto.lastIndexOf(']')
  if (a < 0 || b < 0) return []
  try { return JSON.parse(texto.slice(a, b + 1)) } catch { return [] }
}

const num = (x) => { const n = Number(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

function filaClasificada(item, r) {
  const util = !!r?.util && !!r?.nombre && num(r?.precio_usd) != null
  return {
    fuente: item.fuente, guid: item.guid, titulo_original: item.titulo?.slice(0, 300) || null,
    url_fuente: item.link || null, url: item.link || null, imagen_url: item.imagen || null,
    publicado_fuente: item.fecha || null, procesada: true, util,
    tienda: util ? String(r.tienda || item.tiendaFuente || '').slice(0, 40) : null,
    nombre: util ? String(r.nombre).slice(0, 120) : null,
    precio_usd: util ? num(r.precio_usd) : null,
    precio_antes_usd: util ? num(r.precio_antes_usd) : null,
    tipo: util && r.tipo ? String(r.tipo).slice(0, 60) : null,
    familia: util && FAMILIAS.includes(r.familia) ? r.familia : (util ? 'Otro' : null),
    temporadas: util && Array.isArray(r.temporadas) ? r.temporadas.filter(t => TEMPORADAS[t]) : [],
    gancho: util && r.gancho ? String(r.gancho).slice(0, 200) : null,
    tallas: util && r.tallas ? String(r.tallas).slice(0, 80) : null,
    colores: util && r.colores ? String(r.colores).slice(0, 120) : null,
  }
}

async function clasificarLote(items, tipos) {
  const lineas = items.map((it, i) => `${i}\t${it.titulo}${it.precioFuente ? ` | precio: ${it.precioFuente}` : ''}${it.tiendaFuente ? ` | tienda: ${it.tiendaFuente}` : ''}${it.texto ? ` | ${it.texto.slice(0, 280)}` : ''}`).join('\n')
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 8000, system: instrucciones(tipos),
    messages: [{ role: 'user', content: lineas }],
  })
  const arr = parsearArreglo(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''))
  const porI = new Map(arr.map(r => [Number(r.i), r]))
  return items.map((it, i) => filaClasificada(it, porI.get(i)))
}

// Un artículo (ej. cuponera de Costco) trae decenas de productos.
async function extraerDeArticulo(item, tipos) {
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 12000,
    system: instrucciones(tipos) + `\n\nOJO: esta vez te paso UN artículo de ${item.fuenteNombre} que lista MUCHOS productos en oferta${item.tiendaFuente ? ` de ${item.tiendaFuente}` : ''}. Saca cada producto como un elemento del arreglo, numerados desde 0 en "i". Solo devuelve los útiles (no incluyas los "util": false). Usa el precio ya con el descuento.`,
    messages: [{ role: 'user', content: `${item.titulo}\n\n${item.articulo}` }],
  })
  const arr = parsearArreglo(msg.content.filter(b => b.type === 'text').map(b => b.text).join(''))
  return arr.filter(r => r?.util !== false).map((r, i) => filaClasificada(
    { ...item, guid: `${item.guid}#${i}`, titulo: r.nombre || item.titulo, imagen: null },
    { ...r, util: true, tienda: r.tienda || item.tiendaFuente },
  ))
}

export async function actualizarOfertas(supabase) {
  const { items, errores } = await leerFuentes()

  // ¿Qué ya se había visto? (las ofertas viejas se quedan; solo se procesa lo nuevo)
  const desde = new Date(Date.now() - 45 * 86400000).toISOString()
  const vistas = await traerTodo((a, b) => supabase.from('ofertas').select('fuente, guid').gte('creado_en', desde).range(a, b))
  const ya = new Set(vistas.map(v => `${v.fuente}|${v.guid}`))

  const unicos = new Map()
  for (const it of items) {
    const k = `${it.fuente}|${it.guid}`
    if (!ya.has(k) && !unicos.has(k)) unicos.set(k, it)
  }
  const nuevos = [...unicos.values()]
  const sueltos = nuevos.filter(x => !x.articulo).slice(0, MAX_NUEVAS)
  const articulos = nuevos.filter(x => x.articulo)

  const etiquetas = await traerTodo((a, b) => supabase.from('producto_etiquetas').select('tipo').not('tipo', 'is', null).range(a, b))
  const conteo = new Map()
  for (const e of etiquetas) conteo.set(e.tipo, (conteo.get(e.tipo) || 0) + 1)
  const tipos = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)

  const filas = []
  const lotes = []
  for (let i = 0; i < sueltos.length; i += LOTE) lotes.push(sueltos.slice(i, i + LOTE))
  // De 3 en 3 en paralelo: rápido sin pegarle al límite de la API.
  for (let i = 0; i < lotes.length; i += 3) {
    const res = await Promise.allSettled(lotes.slice(i, i + 3).map(l => clasificarLote(l, tipos)))
    res.forEach((r, j) => {
      if (r.status === 'fulfilled') filas.push(...r.value)
      else errores.push(`IA: ${r.reason?.message || r.reason}`)
      void j
    })
  }
  for (const art of articulos) {
    try {
      const productos = await extraerDeArticulo(art, tipos)
      filas.push(...productos)
      // Marca del artículo, para no volver a procesarlo.
      filas.push({ fuente: art.fuente, guid: art.guid, titulo_original: art.titulo, url_fuente: art.link, url: art.link, procesada: true, util: false, temporadas: [] })
    } catch (e) { errores.push(`IA artículo: ${e.message}`) }
  }

  if (filas.length) {
    for (let i = 0; i < filas.length; i += 200) {
      const { error } = await supabase.from('ofertas').upsert(filas.slice(i, i + 200), { onConflict: 'fuente,guid', ignoreDuplicates: true })
      if (error) errores.push(`Guardar: ${error.message}`)
    }
  }
  return {
    leidas: items.length, nuevas: sueltos.length + articulos.length,
    utiles: filas.filter(f => f.util).length, errores,
  }
}

// ── Puntaje 0–100: qué tanto le conviene a Denog publicar esta oferta ──
export function puntuarOfertas(ofertas, resumen) {
  const porTipo = new Map()
  const porFamilia = new Map()
  for (const t of [...resumen.masVendidos, ...resumen.masUtilidad, ...resumen.subiendo, ...(resumen.todosTipos || [])]) {
    porTipo.set(t.tipo.toLowerCase(), t)
  }
  for (const t of resumen.todosTipos || []) {
    if (!t.familia) continue
    porFamilia.set(t.familia, (porFamilia.get(t.familia) || 0) + t.piezas90)
  }
  const maxFam = Math.max(1, ...porFamilia.values())
  const activas = new Set(resumen.calendario.filter(e => e.activo).map(e => e.clave))

  return ofertas.map(o => {
    let p = 35
    const razones = []
    const t = o.tipo ? porTipo.get(o.tipo.toLowerCase()) : null
    if (t && t.piezas90 > 0) {
      p += Math.min(30, 8 + t.piezas90 * 0.6)
      razones.push(`${t.tipo}: ${t.piezas90} vendidos en 90 días`)
      if (t.subiendo) { p += 5; razones.push('va subiendo') }
    } else if (t) {
      p += 6; razones.push(`Ya has vendido ${t.tipo.toLowerCase()}`)
    }
    const fam = o.familia ? porFamilia.get(o.familia) || 0 : 0
    p += Math.round((fam / maxFam) * 12)
    const temp = (o.temporadas || []).find(s => activas.has(s))
    if (temp) { p += 14; razones.push(`temporada: ${TEMPORADAS[temp]}`) }
    if (o.precio_antes_usd && o.precio_usd && o.precio_antes_usd > o.precio_usd) {
      const pct = Math.round((1 - o.precio_usd / o.precio_antes_usd) * 100)
      p += Math.min(14, Math.round(pct / 4))
      if (pct >= 30) razones.push(`${pct}% de descuento`)
    }
    const usd = Number(o.precio_usd)
    if (usd >= 3 && usd <= 25) p += 5
    else if (usd > 40) p -= 12
    if (!o.imagen_url) p -= 4
    return { ...o, puntaje: Math.max(0, Math.min(100, Math.round(p))), razones }
  })
}
