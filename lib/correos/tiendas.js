import Anthropic from '@anthropic-ai/sdk'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { TEMPORADAS, FAMILIAS } from '@/lib/tendencias/comun'
import { limpiarTexto } from '@/lib/tendencias/fuentes'
import { limpiarGuia, detectarPaqueteria } from '@/lib/bodega/guias'

// ---------------------------------------------------------------------------
// El Gmail donde Lalo tiene sus cuentas de las tiendas (CORREO_TIENDAS).
// Se lee por IMAP con una "contraseña de aplicación" de Google
// (CORREO_TIENDAS_CLAVE), SOLO LECTURA: nunca se borra ni se marca nada.
//
// Cada correo nuevo se manda a uno de dos lados:
//  · Aviso de pedido (confirmado / enviado / entregado) → pedidos_en_linea,
//    que se cruza con lo que la bodega escanea (Paquetes Nogales).
//  · Boletín de ofertas → tabla ofertas (Tendencias → Ofertas del día).
// Cada correo se procesa una vez (correos_procesados, por Message-ID).
// ---------------------------------------------------------------------------

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = 'claude-haiku-4-5-20251001'
const DIAS_MAX = 25      // tope de la ventana que se revisa
const MAX_CORREOS = 120  // por corrida; lo que falte se toma en la siguiente (la pantalla repite sola)

export const correoConfigurado = () => !!(process.env.CORREO_TIENDAS && process.env.CORREO_TIENDAS_CLAVE)

const REMITENTES = [
  [/walmart/i, 'Walmart'], [/target/i, 'Target'], [/costco/i, 'Costco'], [/samsclub|sam's club|sams club/i, "Sam's"],
  [/bathandbodyworks|bath & body/i, 'Bath & Body Works'], [/fivebelow|five below/i, 'Five Below'], [/oldnavy|old navy/i, 'Old Navy'],
  [/amazon/i, 'Amazon'], [/kohls|kohl's/i, "Kohl's"], [/ulta/i, 'Ulta'], [/jcpenney/i, 'JCPenney'], [/ross/i, 'Ross'],
  [/tjmaxx|tj maxx/i, 'TJ Maxx'], [/marshalls/i, 'Marshalls'], [/burlington/i, 'Burlington'], [/nike/i, 'Nike'], [/ebay/i, 'eBay'],
  [/carters|carter's/i, "Carter's"], [/gap\.com|\bgap\b/i, 'Gap'], [/shein/i, 'Shein'], [/temu/i, 'Temu'],
]
function tiendaDe(texto) {
  for (const [re, t] of REMITENTES) if (re.test(texto || '')) return t
  return null
}

// Asuntos que casi siempre son de un pedido (en inglés y español).
const ASUNTO_PEDIDO = /\b(order|ordered|shipped|shipping|shipment|delivered|delivery|out for delivery|arriving|arrived|is here|on (its|the) way|package|tracking|picked up|ready for pickup|cancel+ed|refund|return|pedido|env[ií]o|enviado|entregado|en camino|paquete)\b/i
const ASUNTO_PROMO = /\b(\d+% off|sale|deals?|save|savings|coupon|clearance|rollback|new arrivals|just dropped|shop now|limited time|ofertas?|descuento)\b/i

// ── Lectura de correos nuevos ────────────────────────────────────────────
// La ventana empieza donde empezó la venta en curso: el día de la última
// entrega que ya pasó (la venta arranca justo después). Tope: DIAS_MAX.
async function inicioDeVenta(supabase) {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.from('entregas').select('fecha_entrega').lte('fecha_entrega', hoy)
    .order('fecha_entrega', { ascending: false }).limit(1)
  const tope = new Date(Date.now() - DIAS_MAX * 86400000)
  const ultima = data?.[0]?.fecha_entrega ? new Date(data[0].fecha_entrega + 'T00:00:00-07:00') : null
  return ultima && ultima > tope ? ultima : tope
}

async function leerNuevos(supabase, max = MAX_CORREOS) {
  const desde = await inicioDeVenta(supabase)
  const { data: hechos } = await supabase.from('correos_procesados').select('message_id, tipo').gte('fecha', new Date(desde.getTime() - 2 * 86400000).toISOString()).limit(50000)
  // tipo 'reintentar' = se marcó para volver a leerse (p. ej. tras mejorar la lectura).
  const ya = new Set((hechos || []).filter(h => h.tipo !== 'reintentar').map(h => h.message_id))

  const imap = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true, logger: false,
    // Google muestra la clave en 4 grupos separados por espacios "angostos"
    // (no el espacio normal); al copiarla se cuelan. La clave solo lleva letras.
    auth: { user: String(process.env.CORREO_TIENDAS).trim(), pass: String(process.env.CORREO_TIENDAS_CLAVE).replace(/[^A-Za-z0-9]/g, '') },
  })
  const correos = []
  let pendientes = 0
  await imap.connect()
  try {
    const candado = await imap.getMailboxLock('INBOX', { readOnly: true })
    try {
      const uids = (await imap.search({ since: desde }, { uid: true })) || []
      // Sobres primero (ligero) para saber cuáles faltan; luego solo esos completos.
      const faltan = []
      for await (const m of imap.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
        const id = m.envelope?.messageId
        if (id && !ya.has(id)) faltan.push({ uid: m.uid, id, fecha: m.envelope.date })
      }
      // Del más nuevo al más viejo: lo de hoy aparece primero. El orden no
      // importa para los pedidos: el estado solo avanza (ver RANGO).
      faltan.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      pendientes = Math.max(0, faltan.length - max)
      for (const f of faltan.slice(0, max)) {
        const msg = await imap.fetchOne(f.uid, { source: true, envelope: true }, { uid: true })
        const parsed = await simpleParser(msg.source)
        const remitente = (msg.envelope.from || []).map(x => `${x.name || ''} ${x.address || ''}`).join(' ')
        correos.push({
          id: f.id,
          asunto: parsed.subject || '',
          remitente,
          fecha: (parsed.date || f.fecha) ? new Date(parsed.date || f.fecha).toISOString() : null,
          tienda: tiendaDe(remitente) || tiendaDe(parsed.subject),
          html: parsed.html ? String(parsed.html).slice(0, 400000) : '',
          texto: (parsed.text || limpiarTexto(parsed.html || '')).replace(/\s+/g, ' ').slice(0, 9000),
        })
      }
    } finally { candado.release() }
  } finally {
    try { await imap.logout() } catch {}
  }
  return { correos, pendientes }
}

// ── Avisos de pedido ─────────────────────────────────────────────────────
const RANGO = { confirmado: 1, listo_pickup: 2, enviado: 2, en_reparto: 3, entregado: 4, cancelado: 9 }

const GUIAS_EN_TEXTO = [/\b1Z[0-9A-Z]{16}\b/g, /\bTB[ACM]\d{12}\b/g, /\b9[2-5]\d{20,24}\b/g, /\b\d{12}\b|\b\d{15}\b|\b96\d{20}\b/g]

async function leerPedido(correo) {
  const posibles = new Set()
  for (const re of GUIAS_EN_TEXTO) for (const m of correo.texto.toUpperCase().match(re) || []) posibles.add(m)
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 2500,
    system: `Lees correos de tiendas de EE.UU. (Walmart, Amazon, Target, Costco, Sam's…) sobre pedidos en línea.
Responde SOLO un objeto JSON:
{"es_pedido": true|false, "tienda": "...", "numero_pedido": "...", "estado": "confirmado|enviado|en_reparto|entregado|listo_pickup|cancelado",
 "envios": [{"guia": "número de rastreo o null", "paqueteria": "UPS|USPS|FedEx|Amazon|OnTrac|… o null"}],
 "productos": [{"nombre": "título en inglés, corto", "cantidad": 1, "precio_usd": 0}],
 "total_usd": 0, "fecha_estimada": "YYYY-MM-DD o null"}
- es_pedido=true para cualquier aviso del estado de una compra (confirmada, enviada, en camino, entregada/arrived, lista para recoger, cancelada), aunque no traiga número de pedido.
- es_pedido=false si es publicidad, encuesta, reseña, recibo de membresía o algo que no sea el estado de una compra.
- "numero_pedido": el número tal cual (sin #), o null si no viene.
- "en_reparto" = out for delivery / arriving today. "entregado" = delivered. "listo_pickup" = ready for pickup.
- La guía solo si aparece escrita en el correo (no la inventes). Números que parecen guía en el texto: ${[...posibles].slice(0, 10).join(', ') || 'ninguno'}.`,
    messages: [{ role: 'user', content: `De: ${correo.remitente}\nAsunto: ${correo.asunto}\nFecha: ${correo.fecha}\n\n${correo.texto}` }],
  })
  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const a = raw.indexOf('{'), z = raw.lastIndexOf('}')
  try { return JSON.parse(raw.slice(a, z + 1)) } catch { return null }
}

async function guardarPedido(supabase, correo, p) {
  // Un solo nombre por tienda ("Sam's Club" y "Sam's" son la misma).
  const tienda = (correo.tienda || tiendaDe(p.tienda) || String(p.tienda || 'Otra')).slice(0, 40)
  const guiaPrimera = (Array.isArray(p.envios) ? p.envios : []).map(e => e?.guia).find(Boolean)
  // Avisos sin número de pedido ("Your package has arrived"): se guardan
  // con la guía o, si tampoco hay, con la fecha del correo.
  const numero = (String(p.numero_pedido || '').replace(/^#/, '').trim()
    || (guiaPrimera ? `sin número · ${limpiarGuia(guiaPrimera)}` : `sin número · ${String(correo.fecha || '').slice(0, 16)}`)).slice(0, 60)
  const estado = RANGO[p.estado] ? p.estado : 'confirmado'
  const productos = (Array.isArray(p.productos) ? p.productos : []).filter(x => x?.nombre).slice(0, 40)
    .map(x => ({ nombre: String(x.nombre).slice(0, 120), cantidad: Number(x.cantidad) || 1, precio_usd: Number(x.precio_usd) || null }))
  const envios = (Array.isArray(p.envios) && p.envios.length ? p.envios : [{ guia: null }])
    .map(e => ({ guia: e?.guia ? limpiarGuia(e.guia) : '', paqueteria: e?.paqueteria || null }))
    .map(e => ({ ...e, paqueteria: e.paqueteria || (e.guia ? detectarPaqueteria(e.guia) : null) }))

  const { data: existentes } = await supabase.from('pedidos_en_linea').select('*').eq('tienda', tienda).eq('numero_pedido', numero)
  let n = 0
  for (const e of envios) {
    // Si ya existía el pedido sin guía y ahora llega la guía, se completa esa fila.
    let fila = (existentes || []).find(x => x.guia === e.guia) || (e.guia ? (existentes || []).find(x => x.guia === '') : null)
    // Un aviso sin guía (p. ej. "entregado") actualiza todos los envíos del pedido.
    const objetivos = !e.guia && existentes?.length ? existentes : (fila ? [fila] : [])
    if (!objetivos.length) {
      await supabase.from('pedidos_en_linea').insert({
        tienda, numero_pedido: numero, guia: e.guia, paqueteria: e.paqueteria, estado,
        productos, total_usd: Number(p.total_usd) || null, fecha_estimada: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_estimada || '') ? p.fecha_estimada : null,
        entregado_en: estado === 'entregado' ? correo.fecha : null, primer_correo: correo.fecha, ultimo_correo: correo.fecha,
      })
      n++; continue
    }
    for (const f of objetivos) {
      const avanza = estado === 'cancelado' || (RANGO[estado] || 0) > (RANGO[f.estado] || 0)
      await supabase.from('pedidos_en_linea').update({
        guia: f.guia || e.guia, paqueteria: f.paqueteria || e.paqueteria,
        estado: avanza ? estado : f.estado,
        productos: (f.productos?.length ? f.productos : productos),
        total_usd: f.total_usd ?? (Number(p.total_usd) || null),
        fecha_estimada: f.fecha_estimada || (/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_estimada || '') ? p.fecha_estimada : null),
        entregado_en: f.entregado_en || (estado === 'entregado' ? correo.fecha : null),
        ultimo_correo: correo.fecha, actualizado_en: new Date().toISOString(),
      }).eq('id', f.id)
      n++
    }
  }
  return n
}

// ── Boletines de ofertas ─────────────────────────────────────────────────
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
    if (/logo|icon|facebook|instagram|twitter|tiktok|youtube|pinterest|spacer|pixel|blank|app-?store|google-?play/i.test(src + ' ' + alt)) continue
    const ancho = Number((img[0].match(/width=["']?(\d+)/i) || [])[1] || 0)
    if (ancho && ancho < 80) continue
    const despues = limpiarTexto(html.slice(m.index + m[0].length, m.index + m[0].length + 700)).slice(0, 220)
    bloques.push({ href, img: src, texto: [limpiarTexto(alt), limpiarTexto(m[2]).slice(0, 160), despues].filter(Boolean).join(' | ').slice(0, 380) })
  }
  return bloques
}

const num = (x) => { const n = Number(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }

async function leerPromocion(correo, tipos) {
  const bloques = bloquesDeProducto(correo.html)
  if (!bloques.length) return []
  const msg = await client.messages.create({
    model: MODELO, max_tokens: 8000,
    system: `Te paso los bloques con imagen de un correo de ofertas de ${correo.tienda || 'una tienda de EE.UU.'}. Denog (Hermosillo, Sonora) compra en EE.UU. y revende por WhatsApp.
Saca SOLO los bloques que son un producto concreto con precio visible (no banners genéricos, categorías, cupones o servicios).
Reglas: producto físico de US$2 a US$60; nada de alcohol, armas, medicamentos con receta, carne o productos frescos, muebles grandes.
Para cada producto: "i" (número del bloque), "nombre" (título EN INGLÉS, corto: marca + producto + presentación), "precio_usd", "precio_antes_usd" (o null),
"tipo" (genérico en español, singular, sin marca; reutiliza uno de estos si aplica: ${tipos.slice(0, 60).join(' | ') || '(ninguno)'}),
"familia" (una de: ${FAMILIAS.join(' | ')}), "temporadas" (llaves de: ${Object.keys(TEMPORADAS).join(', ')}),
"tallas" y "colores" en español si se ven (o null), "gancho" (una línea para WhatsApp, sin precio).
Responde SOLO un arreglo JSON (puede ser []).`,
    messages: [{ role: 'user', content: `Asunto: ${correo.asunto}\n\n${bloques.map((b, i) => `${i}\t${b.texto}`).join('\n')}` }],
  })
  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const a = raw.indexOf('['), z = raw.lastIndexOf(']')
  let arr = []
  try { arr = a >= 0 ? JSON.parse(raw.slice(a, z + 1)) : [] } catch { arr = [] }
  const vistos = new Set()
  // El rango de precio se aplica aquí también: la IA a veces deja pasar caros.
  return arr.filter(r => r && r.nombre && num(r.precio_usd) != null && num(r.precio_usd) >= 2 && num(r.precio_usd) <= 60)
    .filter(r => bloques[Number(r.i)] && !vistos.has(Number(r.i)) && vistos.add(Number(r.i)))
    .map(r => {
      const b = bloques[Number(r.i)]
      return {
        fuente: 'correo', guid: `${correo.id}#${r.i}`, titulo_original: correo.asunto?.slice(0, 300) || null,
        url_fuente: null, url: null, url_tienda: b.href, enlace_tipo: 'producto', imagen_url: b.img,
        publicado_fuente: correo.fecha, procesada: true, util: true, tienda: correo.tienda || null,
        nombre: String(r.nombre).slice(0, 120), precio_usd: num(r.precio_usd), precio_antes_usd: num(r.precio_antes_usd),
        tipo: r.tipo ? String(r.tipo).slice(0, 60) : null, familia: FAMILIAS.includes(r.familia) ? r.familia : 'Otro',
        temporadas: Array.isArray(r.temporadas) ? r.temporadas.filter(t => TEMPORADAS[t]) : [],
        tallas: r.tallas ? String(r.tallas).slice(0, 80) : null, colores: r.colores ? String(r.colores).slice(0, 120) : null,
        gancho: r.gancho ? String(r.gancho).slice(0, 200) : null,
      }
    })
}

// ── Punto de entrada: lo usan Ofertas del día y Paquetes Nogales ───────────
// tipos: tipos de producto de Denog (para que la IA reutilice los mismos nombres).
export async function procesarCorreosTiendas(supabase, tipos = [], { max } = {}) {
  const res = { correos: 0, pedidos: 0, avisos: 0, ofertas: 0, pendientes: 0, errores: [] }
  if (!correoConfigurado()) return res
  let lote
  try { lote = await leerNuevos(supabase, max || MAX_CORREOS) } catch (e) {
    // imapflow dice solo "Command failed"; el detalle viene en responseText.
    const detalle = e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials/i.test(e.responseText || '')
      ? 'Gmail rechazó el correo o la clave de aplicación. Revisa que CORREO_TIENDAS sea el Gmail correcto y genera una clave de aplicación nueva.'
      : `${e.message}${e.responseText ? ` — ${e.responseText}` : ''}${e.code ? ` (${e.code})` : ''}`
    console.error('[correo tiendas]', e.message, e.responseText, e.code, e.responseStatus)
    res.errores.push(`Correo: ${detalle}`)
    return res
  }
  res.correos = lote.correos.length
  res.pendientes = lote.pendientes

  const marcas = []
  const ofertas = []
  // De 6 en 6 en paralelo.
  for (let i = 0; i < lote.correos.length; i += 6) {
    await Promise.all(lote.correos.slice(i, i + 6).map(async (c) => {
      let tipo = 'otro'
      try {
        const pareceP = ASUNTO_PEDIDO.test(c.asunto) && !(ASUNTO_PROMO.test(c.asunto) && !/order|pedido|shipped|delivered/i.test(c.asunto))
        if (pareceP) {
          const p = await leerPedido(c)
          if (p?.es_pedido) { tipo = 'pedido'; res.avisos++; res.pedidos += await guardarPedido(supabase, c, p) }
        } else if (c.html && c.tienda) {
          // Solo boletines de las tiendas donde compra Denog; el resto se ignora.
          const filas = await leerPromocion(c, tipos)
          tipo = 'promocion'; ofertas.push(...filas)
        }
        marcas.push({ message_id: c.id, tipo, tienda: c.tienda, asunto: c.asunto?.slice(0, 300), fecha: c.fecha })
      } catch (e) {
        res.errores.push(`IA (${c.asunto?.slice(0, 40)}): ${e.message}`)   // sin marca: se reintenta la próxima vez
      }
    }))
  }
  if (ofertas.length) {
    const { error } = await supabase.from('ofertas').upsert(ofertas, { onConflict: 'fuente,guid', ignoreDuplicates: true })
    if (error) res.errores.push(`Guardar ofertas: ${error.message}`)
    res.ofertas = ofertas.length
  }
  if (marcas.length) await supabase.from('correos_procesados').upsert(marcas, { onConflict: 'message_id' })
  return res
}
