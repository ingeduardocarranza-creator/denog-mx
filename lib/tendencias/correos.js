import Anthropic from '@anthropic-ai/sdk'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { TEMPORADAS, FAMILIAS } from './comun'
import { limpiarTexto } from './fuentes'

// ---------------------------------------------------------------------------
// Ofertas que llegan por correo, directo de las tiendas.
//
// Un Gmail solo para esto (OFERTAS_CORREO) está suscrito a los boletines de
// Walmart, Target, Costco, Sam's, etc. Aquí se leen los correos de los
// últimos días por IMAP (con una "contraseña de aplicación" de Google,
// OFERTAS_CORREO_CLAVE — nunca la contraseña normal) y Haiku saca cada
// producto: nombre, precio, foto y el link de la tienda que trae el correo.
//
// Solo se lee; nunca se borra ni se marca nada en el correo. Cada correo se
// procesa una sola vez (se recuerda por su Message-ID en la tabla ofertas).
// ---------------------------------------------------------------------------

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = 'claude-haiku-4-5-20251001'
const DIAS = 4
const MAX_CORREOS = 20

export const correoConfigurado = () => !!(process.env.OFERTAS_CORREO && process.env.OFERTAS_CORREO_CLAVE)

// Qué tienda manda el correo, por el dominio del remitente.
const REMITENTES = [
  [/walmart/i, 'Walmart'], [/target/i, 'Target'], [/costco/i, 'Costco'], [/samsclub|sams club/i, "Sam's"],
  [/bathandbodyworks|bath & body/i, 'Bath & Body Works'], [/fivebelow/i, 'Five Below'], [/oldnavy|gap\.com/i, 'Old Navy'],
  [/amazon/i, 'Amazon'], [/kohls/i, "Kohl's"], [/ulta/i, 'Ulta'], [/jcpenney/i, 'JCPenney'], [/rossstores|ross/i, 'Ross'],
  [/tjmaxx|tjx/i, 'TJ Maxx'], [/marshalls/i, 'Marshalls'], [/burlington/i, 'Burlington'], [/nike/i, 'Nike'], [/carters/i, "Carter's"],
]
function tiendaDe(remitente) {
  for (const [re, t] of REMITENTES) if (re.test(remitente || '')) return t
  return null
}

// Cada bloque <a> con imagen = un producto posible: link, foto, texto alrededor.
function bloquesDeProducto(html) {
  const bloques = []
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html)) && bloques.length < 80) {
    const href = m[1].replace(/&amp;/g, '&')
    if (!/^https:\/\//.test(href)) continue
    const img = m[2].match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
    if (!img) continue
    const src = img[1].replace(/&amp;/g, '&')
    const alt = (img[0].match(/alt=["']([^"']*)["']/i) || [])[1] || ''
    // Logos, íconos y botones de redes no son productos.
    if (/logo|icon|facebook|instagram|twitter|tiktok|youtube|pinterest|spacer|pixel|blank|app-?store|google-?play/i.test(src + ' ' + alt)) continue
    const ancho = Number((img[0].match(/width=["']?(\d+)/i) || [])[1] || 0)
    if (ancho && ancho < 80) continue
    // Texto cercano (después del link), donde suelen venir nombre y precio.
    const despues = limpiarTexto(html.slice(m.index + m[0].length, m.index + m[0].length + 700)).slice(0, 220)
    const dentro = limpiarTexto(m[2]).slice(0, 160)
    bloques.push({ href, img: src, texto: [limpiarTexto(alt), dentro, despues].filter(Boolean).join(' | ').slice(0, 380) })
  }
  return bloques
}

function instrucciones(tienda, tipos) {
  return `Te paso los bloques con imagen de un correo de ofertas de ${tienda || 'una tienda de EE.UU.'}. Denog (Hermosillo, Sonora) compra en EE.UU. y revende por WhatsApp.
Saca SOLO los bloques que son un producto concreto con precio visible (no banners genéricos tipo "Shop now", "Up to 50% off", categorías, cupones o servicios).
Reglas: producto físico de US$2 a US$60; nada de alcohol, armas, medicamentos con receta, carne o productos frescos, muebles grandes.
Para cada producto devuelve:
- "i": el número del bloque
- "nombre": título EN INGLÉS, corto y limpio (marca + producto + presentación)
- "precio_usd": precio de oferta (número), "precio_antes_usd": precio regular o null
- "tipo": tipo genérico en español, singular, sin marca. Reutiliza uno de estos si aplica: ${tipos.slice(0, 60).join(' | ') || '(ninguno)'}
- "familia": una de: ${FAMILIAS.join(' | ')}
- "temporadas": llaves de: ${Object.keys(TEMPORADAS).join(', ')}
- "tallas": tallas en español si es ropa/calzado y se ven, o null; "colores": colores en español si se ven, o null
- "gancho": una línea corta para WhatsApp, español de Sonora, sin precio
Responde SOLO un arreglo JSON (puede ser []).`
}

const num = (x) => { const n = Number(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

async function extraerDeCorreo(correo, tipos) {
  const bloques = bloquesDeProducto(correo.html)
  if (!bloques.length) return []
  const lineas = bloques.map((b, i) => `${i}\t${b.texto}`).join('\n')
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 8000, system: instrucciones(correo.tienda, tipos),
    messages: [{ role: 'user', content: `Asunto: ${correo.asunto}\n\n${lineas}` }],
  })
  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const a = raw.indexOf('['), z = raw.lastIndexOf(']')
  let arr = []
  try { arr = a >= 0 ? JSON.parse(raw.slice(a, z + 1)) : [] } catch { arr = [] }
  const vistos = new Set()
  return arr.filter(r => r && r.nombre && num(r.precio_usd) != null && bloques[Number(r.i)]).filter(r => {
    if (vistos.has(Number(r.i))) return false
    vistos.add(Number(r.i)); return true
  }).map(r => {
    const b = bloques[Number(r.i)]
    return {
      fuente: 'correo', guid: `${correo.id}#${r.i}`, titulo_original: correo.asunto?.slice(0, 300) || null,
      url_fuente: null, url: null, url_tienda: b.href, enlace_tipo: 'producto', imagen_url: b.img,
      publicado_fuente: correo.fecha, procesada: true, util: true,
      tienda: correo.tienda || String(r.tienda || '').slice(0, 40) || null,
      nombre: String(r.nombre).slice(0, 120), precio_usd: num(r.precio_usd), precio_antes_usd: num(r.precio_antes_usd),
      tipo: r.tipo ? String(r.tipo).slice(0, 60) : null,
      familia: FAMILIAS.includes(r.familia) ? r.familia : 'Otro',
      temporadas: Array.isArray(r.temporadas) ? r.temporadas.filter(t => TEMPORADAS[t]) : [],
      tallas: r.tallas ? String(r.tallas).slice(0, 80) : null,
      colores: r.colores ? String(r.colores).slice(0, 120) : null,
      gancho: r.gancho ? String(r.gancho).slice(0, 200) : null,
    }
  })
}

// Lee los correos nuevos. `yaVistos`: Set de Message-ID ya procesados.
export async function leerCorreosDeOfertas(yaVistos, tipos) {
  const errores = []
  const filas = []
  const imap = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: process.env.OFERTAS_CORREO, pass: process.env.OFERTAS_CORREO_CLAVE },
  })
  const correos = []
  try {
    await imap.connect()
    const candado = await imap.getMailboxLock('INBOX', { readOnly: true })
    try {
      const desde = new Date(Date.now() - DIAS * 86400000)
      const uids = (await imap.search({ since: desde }, { uid: true })) || []
      for (const uid of uids.slice(-120).reverse()) {
        if (correos.length >= MAX_CORREOS) break
        const msg = await imap.fetchOne(uid, { envelope: true, source: true }, { uid: true })
        const id = msg?.envelope?.messageId
        if (!id || yaVistos.has(id)) continue
        const remitente = msg.envelope.from?.map(f => `${f.name || ''} ${f.address || ''}`).join(' ') || ''
        const parsed = await simpleParser(msg.source)
        if (!parsed.html) { correos.push({ id, vacio: true }); continue }
        correos.push({ id, asunto: parsed.subject || '', fecha: parsed.date ? parsed.date.toISOString() : null, tienda: tiendaDe(remitente), html: String(parsed.html).slice(0, 400000) })
      }
    } finally { candado.release() }
  } catch (e) {
    errores.push(`Correo: ${e.message}`)
  } finally {
    try { await imap.logout() } catch {}
  }

  for (const c of correos) {
    // Marca del correo (para no volver a procesarlo), sirva o no.
    filas.push({ fuente: 'correo', guid: c.id, titulo_original: c.asunto?.slice(0, 300) || null, procesada: true, util: false, temporadas: [] })
    if (c.vacio) continue
    try { filas.push(...await extraerDeCorreo(c, tipos)) }
    catch (e) { errores.push(`IA correo: ${e.message}`) }
  }
  return { filas, correos: correos.length, errores }
}
