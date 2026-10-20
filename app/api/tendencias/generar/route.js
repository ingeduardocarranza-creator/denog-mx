import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarResumen } from '@/lib/tendencias/resumen'
import { fechaCorta } from '@/lib/tendencias/comun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Del más nuevo al más viejo: si la llave no tiene acceso a uno, usa el siguiente.
const MODELOS = [process.env.TENDENCIAS_MODELO, 'claude-sonnet-5-5', 'claude-sonnet-4-5'].filter(Boolean)
const MAX_BUSQUEDAS = 12

// ---------------------------------------------------------------------------
// POST /api/tendencias/generar — arma la lista de qué publicar.
//
// Claude busca en internet (ofertas, liquidaciones, best sellers, lo que se
// está viralizando) con el contexto de lo que a Denog ya le funciona y las
// temporadas que vienen. Devuelve productos con link, precio en dólares y
// un texto corto para el grupo. El precio en pesos lo calcula la pantalla
// con el factor de Lalo, para que se pueda ajustar sin volver a buscar.
//
// Costo aproximado por lista: 12 búsquedas (US$0.12) + tokens (~US$0.30–0.60).
// body: { enfoque?: string }
// ---------------------------------------------------------------------------
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { enfoque } = await req.json().catch(() => ({}))

  try {
    const r = await cargarResumen(supabase)
    const contexto = armarContexto(r, (enfoque || '').trim().slice(0, 300))

    const { texto, busquedas, fuentes } = await correrBusqueda(contexto)
    const productos = extraerProductos(texto, fuentes)
    if (!productos.length) throw new Error('La búsqueda no regresó productos. Intenta de nuevo.')

    await ponerFotos(productos)

    const { data, error } = await supabase.from('tendencias_listas').insert({
      creado_por: sesion.id, enfoque: enfoque || null, productos, busquedas,
    }).select().single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, lista: data })
  } catch (e) {
    console.error('[tendencias/generar] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}

function armarContexto(r, enfoque) {
  const fmtTipo = (t) => `- ${t.tipo}${t.marca ? ` (marca más vendida: ${t.marca})` : ''}: ${t.piezas} piezas en total, ${t.piezas90} en 90 días; compra típica US$${t.usd?.toFixed(2) ?? '?'} en ${t.tienda}, venta típica $${Math.round(t.venta || 0)} MXN`
  const activos = r.calendario.filter(e => e.activo || e.faltan <= 75).slice(0, 5)
  return `Hoy es ${r.hoy}. La próxima entrega a clientes es el ${fechaCorta(r.proximaEntrega)}; después hay entrega cada ~14 días.

LO QUE MÁS LE VENDE A DENOG (últimos 90 días):
${r.masVendidos.slice(0, 12).map(fmtTipo).join('\n') || '- (todavía sin etiquetar)'}

LO QUE MÁS UTILIDAD DEJA POR PIEZA:
${r.masUtilidad.slice(0, 6).map(fmtTipo).join('\n') || '- (sin datos)'}

VA SUBIENDO EN LOS ÚLTIMOS 30 DÍAS:
${r.subiendo.map(t => `- ${t.tipo}: ${t.piezas30} piezas vs ${t.piezasPrev30} el mes anterior`).join('\n') || '- (nada claro)'}

MARCAS FAVORITAS DE SUS CLIENTES: ${r.marcas.slice(0, 8).map(m => m.marca).join(', ') || '(sin datos)'}

FECHAS QUE VIENEN:
${activos.map(e => `- ${e.nombre} (${fechaCorta(e.fecha)}): ${e.estado}${e.tuyos.length ? `. Ya vendió: ${e.tuyos.map(t => t.tipo).join(', ')}` : ''}`).join('\n')}

PRECIOS: Denog vende a unos $${r.precios.factor} MXN por cada dólar del precio en la tienda. Le funcionan productos de US$2 a US$40.
${enfoque ? `\nENFOQUE QUE PIDE LALO PARA ESTA LISTA: ${enfoque}\n` : ''}`
}

const SISTEMA = `Eres el comprador estrella de Denog USA Compras, un negocio de Hermosillo, Sonora, México. Denog compra en tiendas en línea de EE.UU., recibe en una bodega en Nogales, Arizona, y entrega a sus clientes cada ~15 días. Las ventas se hacen publicando productos en un grupo de WhatsApp; el cliente aparta con anticipo.

Tu trabajo: buscar en internet AHORA MISMO y armar la lista de 15 a 20 productos que Lalo debe publicar en esta venta. Mezcla tres tipos:
- "temporada": para las fechas que vienen y que todavía alcanzan a llegar.
- "tendencia": lo que se está comprando mucho o se está viralizando (TikTok, Instagram, Facebook, Amazon Best Sellers / Movers & Shakers, "TikTok made me buy it", artículos de tendencias).
- "funciona": ofertas actuales de los TIPOS de producto que ya le venden bien (abajo viene su historial).

Busca en: Walmart, Target, Amazon, Costco, Sam's Club, Bath & Body Works, Five Below, Old Navy. Prioriza ofertas, rollbacks, clearance y precios bajos reales.

Reglas:
- Productos que se pueden pasar a México sin problema: nada de alcohol, armas, medicamentos con receta, carne ni productos frescos. Preferir artículos que no sean enormes ni muy pesados.
- Rango sano: US$2 a US$40 por pieza (algo más caro solo si es muy buscado).
- Cada producto debe ser específico (marca, presentación) y tener un link a la página del producto en la tienda, tomado de tus resultados de búsqueda. Si no encuentras la página exacta, usa el link de búsqueda de esa tienda con el nombre del producto.
- precio_usd: el precio que viste; si no lo viste, null. No inventes precios.
- No repitas el mismo producto. Varía tiendas y familias.

Al terminar, responde ÚNICAMENTE con un bloque así (sin texto antes ni después):
<json>
[
  {
    "nombre": "título del producto EN INGLÉS, corto y limpio, como aparece en la tienda (marca + producto + presentación)",
    "tienda": "Walmart",
    "url": "https://...",
    "precio_usd": 4.98,
    "tipo": "temporada" | "tendencia" | "funciona",
    "etiqueta": "Temporada · Navidad" | "Tendencia · TikTok" | "Te funciona" (corto),
    "porque": "una frase en español con la evidencia: por qué este y por qué ahora",
    "tallas": "tallas disponibles si es ropa o calzado (ej. \"S a XXL\"), si no null",
    "colores": "colores, sabores o aromas disponibles si aplica, EN ESPAÑOL (ej. \"Negro, gris y rosa\"), si no null",
    "gancho": "una línea corta y antojable para el grupo de WhatsApp, español de Sonora, sin precio, máximo 1 emoji",
    "imagen_url": "url de la foto si la viste en los resultados, si no null"
  }
]
</json>`

async function correrBusqueda(contexto) {
  let ultimoError
  for (const model of MODELOS) {
    try {
      const messages = [{ role: 'user', content: contexto }]
      let busquedas = 0
      const fuentes = new Set()
      let texto = ''
      // pause_turn: la API pausa turnos largos de búsqueda; se le regresa el
      // mensaje tal cual para que continúe.
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const resp = await client.messages.create({
          model,
          max_tokens: 12000,
          system: SISTEMA,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_BUSQUEDAS, user_location: { type: 'approximate', country: 'US', region: 'Arizona', city: 'Nogales' } }],
          messages,
        })
        for (const b of resp.content) {
          if (b.type === 'server_tool_use' && b.name === 'web_search') busquedas++
          if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) if (x.url) fuentes.add(x.url)
        }
        texto = resp.content.filter(b => b.type === 'text').map(b => b.text).join('')
        if (resp.stop_reason !== 'pause_turn') break
        messages.push({ role: 'assistant', content: resp.content })
      }
      return { texto, busquedas, fuentes }
    } catch (e) {
      ultimoError = e
      const noExiste = e?.status === 404 || /not_found|model/i.test(e?.message || '')
      if (!noExiste) throw e
    }
  }
  throw ultimoError || new Error('No hay modelo disponible')
}

const TIPOS = new Set(['temporada', 'tendencia', 'funciona'])
function extraerProductos(texto, fuentes) {
  const m = texto.match(/<json>([\s\S]*?)<\/json>/i)
  let crudo = m ? m[1] : texto
  const a = crudo.indexOf('['), b = crudo.lastIndexOf(']')
  if (a < 0 || b < 0) return []
  let arr
  try { arr = JSON.parse(crudo.slice(a, b + 1)) } catch { return [] }
  const vistos = new Set()
  return arr.filter(p => p && p.nombre).map((p, i) => {
    let url = typeof p.url === 'string' && /^https?:\/\//.test(p.url) ? p.url : null
    const precio = Number(p.precio_usd)
    return {
      clave: `p${i}`,
      nombre: String(p.nombre).slice(0, 120),
      tienda: String(p.tienda || '').slice(0, 40),
      url,
      urlVerificada: !!(url && fuentes.has(url)),
      precio_usd: Number.isFinite(precio) && precio > 0 ? Math.round(precio * 100) / 100 : null,
      tipo: TIPOS.has(p.tipo) ? p.tipo : 'tendencia',
      etiqueta: String(p.etiqueta || '').slice(0, 40),
      porque: String(p.porque || '').slice(0, 300),
      gancho: String(p.gancho || '').slice(0, 200),
      tallas: p.tallas ? String(p.tallas).slice(0, 80) : null,
      colores: p.colores ? String(p.colores).slice(0, 120) : null,
      imagen_url: typeof p.imagen_url === 'string' && /^https:\/\//.test(p.imagen_url) ? p.imagen_url : null,
    }
  }).filter(p => {
    const k = p.nombre.toLowerCase()
    if (vistos.has(k)) return false
    vistos.add(k); return true
  })
}

// Foto: la misma que muestra WhatsApp cuando pegas un link (og:image). Si la
// tienda no la da a tiempo, la tarjeta queda sin foto y el link sigue igual.
async function ponerFotos(productos) {
  await Promise.allSettled(productos.map(async (p) => {
    if (p.imagen_url || !p.url) return
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(p.url, {
        signal: ctrl.signal, redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsApp/2.23) facebookexternalhit/1.1', 'Accept-Language': 'en-US,en;q=0.9' },
      })
      if (!res.ok) return
      const html = (await res.text()).slice(0, 400000)
      const m = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i)
      if (m && /^https:\/\//.test(m[1])) p.imagen_url = m[1].replace(/&amp;/g, '&')
    } catch {} finally { clearTimeout(t) }
  }))
}
