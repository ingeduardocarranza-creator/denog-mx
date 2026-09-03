// Piezas de extracción para el registro de ventas por WhatsApp. Este archivo
// NO decide a qué venta pertenece cada mensaje — de eso se encarga
// lib/whatsapp/ventasBandeja.js, en orden y con candado. Aquí solo vive lo que
// se puede sacar de un mensaje mirándolo solo.
//
// FORMATO REAL DE LOS MENSAJES (confirmado con los logs de producción del
// 2 sep 2026; corrige lo que suponía el diseño original de tres mensajes):
//   1. La foto reenviada trae el precio de venta en pesos pegado como caption:
//      "$335", "$165", "$295 / 6 pack". A veces el caption es una descripción
//      de catálogo con el precio adentro ("... Good & Gather || $65").
//   2. Luego un texto con cliente + costo en dólares + talla opcional:
//      "Martha Figueroa \n $8.99", "Rocio Sandoval, $11 , talla M".
// De vez en cuando el precio llega como su propio mensaje de solo número
// ("190", "$165"), así que ese caso se sigue reconociendo.
//
// Ver claude/ventas-whatsapp-preaprobacion-diseno.md y
// claude/ventas-whatsapp-desfase.md (proyecto "Sitio web Denog").
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function limpiarJson(raw) {
  return (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

// ─── Lista blanca ──────────────────────────────────────────────────────────
// Separada de `clientes` a propósito — ver la migración para el porqué.
// `origen` dice en qué SENTIDO cuenta el número (ver la migración
// 2026-09-03_ventas_por_eco.sql):
//   'entrante' — lo que ESE número le manda a Denog (el reenvío de siempre).
//   'eco'      — lo que DENOG le manda a ese número (la bitácora del propio
//                celular; llega por smb_message_echoes).
// Un número puede estar en un sentido y no en el otro, y eso es a propósito:
// si estuviera en los dos, la misma venta podría entrar dos veces.
export async function esVendedorVentas(supabase, telefono10Digitos, origen = 'entrante') {
  if (!telefono10Digitos) return false
  const { data, error } = await supabase
    .from('vendedores_whatsapp_ventas')
    .select('telefono')
    .eq('telefono', telefono10Digitos)
    .eq('origen', origen)
    .eq('activo', true)
    .maybeSingle()
  if (error) { console.error('[ventasWhatsapp] error consultando lista blanca:', error.message); return false }
  return !!data
}

// ─── Clasificación de mensajes de texto ────────────────────────────────────
// El mensaje de precio es SOLO un número (con "$"/"MX$"/"pesos" opcional
// alrededor) y nada más — sin letras, sin nombre. Cualquier otra cosa se
// trata como el mensaje de cliente+costo.
export function esSoloPrecioMXN(texto) {
  if (!texto) return false
  const limpio = texto.trim()
    .replace(/^(mx\$|\$)\s*/i, '')
    .replace(/\s*pesos$/i, '')
    .trim()
  return /^\d+(\.\d{1,2})?$/.test(limpio)
}

export function parsePrecioMXN(texto) {
  const limpio = texto.trim()
    .replace(/^(mx\$|\$)\s*/i, '')
    .replace(/\s*pesos$/i, '')
    .trim()
  return Number(limpio)
}

// El caption de la foto sirve para UNA sola cosa: sacar el precio de venta en
// pesos. Puede venir solo ("$335") o metido entre otro texto ("$295 / 6 pack",
// "... Good & Gather || $65", "HOMBRE // TALLA M // $310"), así que se busca el
// primer "$<número>" en cualquier parte.
//
// Lo demás que traiga el caption NO se usa como título del artículo (decisión
// de Eduardo, 3 sep 2026): esos textos son sobras del reenvío —"/ 6 pack",
// "Esta por favor talla M", la pregunta de una clienta— y daban títulos
// malísimos. El título siempre lo hace la IA mirando la foto; el texto original
// se guarda aparte, en las notas del borrador, para no perderlo.
export function extraerPrecioDeCaption(caption) {
  if (!caption) return null
  if (esSoloPrecioMXN(caption)) return parsePrecioMXN(caption)
  const m = caption.match(/\$\s*(\d+(?:\.\d{1,2})?)/)
  return m ? Number(m[1]) : null
}

// ─── Mensaje foto: descripción y categoría del producto ────────────────────
// El precio NO se le pide a este análisis de visión — si viene, ya se
// extrajo del caption por texto plano (ver procesarMensajeVentaFoto) antes
// de llegar aquí; pedírselo también a la IA de imagen solo duplicaba
// trabajo y podía contradecirse.
export async function extraerDeFoto({ imagenUrl }) {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imagenUrl } },
          {
            type: 'text',
            text: `Esta es una foto de un producto que Denog (tienda de importaciones de
EE.UU.) va a revender.

Responde SOLO con JSON válido, sin texto adicional:
{
  "descripcion": "título descriptivo en español, máximo 60 caracteres, incluye marca si
    se ve, tipo de prenda/artículo y color. NO incluyas talla aquí — se agrega después.",
  "categoria": "una de estas opciones exactas: Ropa, Calzado, Comida / Snacks, Artículos de Hogar, Cuidado Personal, Electrónica, Juguetes, Otro"
}`,
          },
        ],
      }],
    })
    const json = JSON.parse(limpiarJson(message.content[0]?.text))
    return {
      descripcion: json.descripcion || null,
      categoria: json.categoria || null,
    }
  } catch (err) {
    console.error('[ventasWhatsapp] error en extraerDeFoto:', err?.message)
    return { descripcion: null, categoria: null }
  }
}

// ─── Mensaje texto: cliente / costo / piezas / talla ───────────────────────
export async function extraerDeTexto({ texto }) {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Eduardo, de Denog, acaba de vender un artículo y escribió este mensaje
con los datos de la venta: "${texto}"

El patrón normal es "nombre del cliente" + "número" (ej. "Monserrat Ibarra 6",
"Claudia Maldonado 13"). Ese número casi siempre es el COSTO en dólares, NO
la talla — es una confusión común y hay que evitarla:
- Un número suelto al final del mensaje (sin ninguna palabra que indique
  talla) es SIEMPRE precio_usd. Ejemplo: "Monserrat Ibarra 6" → cliente
  "Monserrat Ibarra", precio_usd 6, talla null.
- Solo es talla si el mensaje lo dice explícitamente con la palabra "talla"
  o "size" (ej. "talla 6", "size 10"), o si el valor es una letra/medida que
  no podría ser un precio (ej. "M", "XL", "7Y", "32").
- Si el mensaje trae DOS números (uno de costo y otro de talla), el que
  vaya pegado a la palabra "talla"/"size" es la talla; el otro es el costo.

Extrae SOLO con JSON válido, sin texto adicional:
{
  "cliente_nombre": "nombre del cliente tal como lo escribió, o null si no se menciona",
  "precio_usd": número (costo en dólares por pieza, lo que Denog pagó en la tienda de EE.UU.), o null si no se menciona ningún número que pueda ser el costo,
  "cantidad": número de piezas, o 1 si no se menciona ninguna cantidad,
  "talla": "la talla, SOLO si el mensaje la indica explícitamente según las reglas de arriba — de lo contrario null"
}`,
      }],
    })
    const json = JSON.parse(limpiarJson(message.content[0]?.text))
    return {
      cliente_nombre: json.cliente_nombre || null,
      precio_usd: json.precio_usd != null ? Number(json.precio_usd) : null,
      cantidad: json.cantidad != null ? Number(json.cantidad) : 1,
      talla: json.talla || null,
    }
  } catch (err) {
    console.error('[ventasWhatsapp] error en extraerDeTexto:', err?.message)
    return { cliente_nombre: null, precio_usd: null, cantidad: 1, talla: null }
  }
}

// ─── Resolución de cliente por nombre ──────────────────────────────────────
// Nombre claro (una sola coincidencia razonable) → se asigna. Ambiguo o sin
// coincidencia → se deja null; el staff lo resuelve a mano en la revisión
// (ahí mismo puede buscar o dar de alta un cliente nuevo).
export function normalizarNombre(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// ─── El emparejamiento ya no vive aquí ─────────────────────────────────────
// Hasta el 2 sep 2026 este archivo emparejaba "al vuelo": cada mensaje que
// llegaba buscaba en `pedidos` el borrador más viejo al que le faltara su
// casilla. Como los mensajes llegan en peticiones paralelas y una foto tarda
// 3-5 s contra ~1 s de un texto, los textos ganaban la carrera y el cliente se
// pegaba a la foto de otra venta — de ahí en adelante toda la lista quedaba
// recorrida un lugar. Ese emparejamiento se movió a
// lib/whatsapp/ventasBandeja.js, donde se hace después, en un solo proceso y
// en orden estricto de llegada. Aquí solo quedan las piezas que extraen datos
// de un mensaje suelto, que no dependen del orden.
