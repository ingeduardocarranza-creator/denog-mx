// Fase 7 — Gastos del negocio capturados por WhatsApp.
//
// Eduardo manda la foto de un ticket (gasolina, hotel, comida, casetas) al
// WhatsApp del negocio, con la palabra "gasto" en el texto o en el pie de
// foto (ej. "gasto gasolina", "gasto - cena con proveedor"). Este módulo
// SOLO detecta y extrae — igual que clasificador.js, nunca aprueba nada por
// sí mismo. El gasto nace en estado "pendiente" y hay que aprobarlo a mano
// en /admin/gastos antes de que cuente como real.
//
// Separado de clasificador.js a propósito: ese prompt es para mensajes de
// CLIENTES (comprobantes de pago, pedidos específicos) y mezclar ahí la
// idea de "gasto del negocio" habría confundido ambas clasificaciones — un
// ticket de gasolina también "parece" un comprobante de pago a simple vista.
// Aquí no hay ambigüedad: solo se activa para el número de Eduardo y solo
// si él mismo escribe la palabra "gasto".
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Único número autorizado a registrar gastos por WhatsApp — el de Eduardo.
export const NUMERO_GASTOS = '6623533906'

export const CATEGORIAS_GASTO = ['Gasolina', 'Hotel', 'Comida', 'Casetas/Peaje', 'Otro']

// Mismo cálculo que ya usan los pedidos (precio_usd, tipo_cambio,
// impuesto_pct → costo_mxn): si el ticket es en dólares, se le suma el
// impuesto y se multiplica por el tipo de cambio del día. Si ya es en
// pesos, el monto es el monto — no hay nada que convertir.
export function calcularMontoMxn({ monto, moneda, tipo_cambio, impuesto_pct }) {
  const m = Number(monto) || 0
  if (moneda !== 'USD') return m
  const tc = Number(tipo_cambio) || 0
  const imp = (Number(impuesto_pct) || 0) / 100
  if (tc <= 0) return null // sin tipo de cambio no se puede convertir todavía
  return m * (1 + imp) * tc
}

// Detección por palabra clave (decisión de Eduardo, 13/sep/2026): sin la
// palabra "gasto" en el texto o en el pie de foto, el mensaje no se toca —
// así una foto cualquiera que mande por otra razón no se cuela como gasto.
export function esMensajeGasto(texto) {
  if (!texto) return false
  return /\bgastos?\b/i.test(texto)
}

// entrada: texto (con la palabra "gasto"), imagenUrl (foto del ticket, si la hay).
// salida: { monto, categoria, descripcion } — todo puede salir null/genérico
// si la IA no logra leer el ticket; se corrige a mano al aprobar.
export async function extraerGasto({ texto, imagenUrl }) {
  const contenido = []
  if (imagenUrl) contenido.push({ type: 'image', source: { type: 'url', url: imagenUrl } })
  contenido.push({
    type: 'text',
    text: `Mensaje de Eduardo (dueño del negocio) reportando un gasto: "${texto || '(sin texto, solo foto del ticket)'}"`,
  })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `Lees el ticket/recibo de un gasto de negocio (Denog, importaciones EE.UU.-México)
y el texto que lo acompaña. Extrae los datos para un registro de gastos.

Responde SOLO con JSON válido, sin texto adicional, con esta forma exacta:
{
  "monto": número (el total del ticket, tal como aparece impreso, SIN convertir de moneda)
    o null si no se alcanza a leer,
  "moneda": "MXN" o "USD" — la regla es el IDIOMA del ticket: si el texto impreso
    en el ticket está en inglés, es "USD"; si está en español, es "MXN". No lo decidas
    por el nombre de la tienda ni por el símbolo "$" (los dos usan "$") — solo por el idioma
    del texto que aparece impreso en el ticket.
  "categoria": una de estas opciones EXACTAS: "Gasolina", "Hotel", "Comida", "Casetas/Peaje", "Otro",
  "descripcion": "una línea breve, ej. \\"Gasolina - Circle K\\" o \\"Cena con proveedor\\"" (máx 60 caracteres)
}`,
      messages: [{ role: 'user', content: contenido }],
    })

    const raw = message.content[0]?.text?.trim() || ''
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())

    return {
      monto: json.monto != null ? Number(json.monto) : null,
      moneda: json.moneda === 'USD' ? 'USD' : 'MXN',
      categoria: CATEGORIAS_GASTO.includes(json.categoria) ? json.categoria : 'Otro',
      descripcion: json.descripcion || null,
    }
  } catch (err) {
    console.error('[gastos] error extrayendo:', err?.message)
    // Ante un error de la IA, igual se crea el pendiente — con los campos
    // en null/"Otro" para que Eduardo los llene a mano al aprobar. Mejor
    // un gasto a medio llenar que perder el ticket por completo.
    return { monto: null, moneda: 'MXN', categoria: 'Otro', descripcion: null }
  }
}
