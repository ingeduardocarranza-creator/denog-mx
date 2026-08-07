// El "asistente que toma nota" — lee UN mensaje entrante de WhatsApp y
// decide si merece un pendiente. Ver docs/PLAN.md.
//
// Regla de oro: ante la duda, NO generar pendiente. Este módulo solo avisa —
// nunca contesta al cliente, nunca aprueba pagos, nunca decide nada por sí
// mismo. Lo usa app/api/whatsapp/webhook (B5) por cada mensaje que llega.
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_SISTEMA = `Eres el asistente que toma nota para Denog, una tienda que importa
ropa y artículos de tiendas de EE.UU. (Ross, TJ Maxx, Marshalls) y los revende en México
por WhatsApp.

CÓMO VENDE DENOG (contexto, no es algo sobre lo que debas actuar):
Suben fotos con precio a un grupo de difusión de solo lectura. El cliente reenvía la foto
que le interesa a este chat 1 a 1 y ahí se cierra la venta. Ese flujo YA FUNCIONA BIEN y
NO es tu trabajo ayudar con él ni contestar nada. Tu único trabajo es detectar dos cosas
que se pierden cuando el equipo está ocupado atendiendo a otro cliente:

1. "comprobante": el cliente mandó o avisó que mandó un pago — captura de transferencia,
   foto de depósito, o texto tipo "ya te transferí", "te mando el comprobante", "ahí va el
   pago". Alguien del equipo tiene que conciliarlo a mano; tú nunca apruebas ni concilias,
   solo avisas.

2. "pedido_especifico": el cliente pide algo de OTRA tienda que Denog no ha publicado en
   su grupo. Puede llegar como texto ("¿me consigues unos Nike talla 8?"), un link (Amazon,
   SHEIN, etc.) o una foto/captura de un producto de otra tienda o página. La señal es que
   el producto NO es uno que Denog ya subió a su grupo.

QUÉ NUNCA DEBE GENERAR PENDIENTE (responde "ninguna"):
- El cliente reenviando una foto que Denog publicó en su grupo, o diciendo que le
  interesa / lo aparta / lo quiere sobre ESE producto — es la venta normal.
- Preguntas de talla, color o disponibilidad sobre un producto que Denog ya publicó.
- Mensajes de cortesía: gracias, saludos, buenos días, emojis sueltos.
- Preguntas sobre el estado de algo que ya está en curso ("¿ya llegó lo mío?", "¿cuándo me
  toca?") — no es información nueva que anotar.
- Cualquier caso donde no estés seguro. Ante la duda, NO generes pendiente: es preferible
  que se te escape uno a que llenes la lista de ruido y el equipo deje de confiar en ella.

Responde SOLO con JSON válido, sin texto adicional ni explicaciones, con esta forma exacta:
{
  "accion": "ninguna" | "comprobante" | "pedido_especifico",
  "resumen": "una línea concisa para leer sin abrir el chat (\"\" si accion es ninguna)",
  "monto": número o null (solo si accion es "comprobante" y el monto se ve o se menciona),
  "detalle": objeto con campos libres relevantes, o null si accion es "ninguna".
    Para comprobante: { banco, referencia, ordenante } (los que se alcancen a leer).
    Para pedido_especifico: { marca, modelo, talla, color, cantidad, link } (los que apliquen).
}`

// entrada:
//  texto        — texto del mensaje, o null si es solo imagen.
//  imagenUrl    — URL pública de la imagen adjunta, si la hay.
//  esReenviada  — true si WhatsApp marcó el mensaje como reenviado
//                 (context.forwarded en el payload del webhook). Ayuda a
//                 distinguir "reenvió la foto del grupo" (venta normal) de
//                 "reenvió una foto de otra tienda" (pedido específico).
//
// salida: null (no merece pendiente) o { tipo, resumen, monto, detalle }.
export async function clasificarMensaje({ texto, imagenUrl, esReenviada }) {
  if (!texto && !imagenUrl) return null

  const contenido = []
  if (imagenUrl) contenido.push({ type: 'image', source: { type: 'url', url: imagenUrl } })

  const nota = esReenviada
    ? '\n(Nota: WhatsApp marcó este mensaje como reenviado. Si la imagen se ve como un ' +
      'producto con foto y precio al estilo de lo que Denog publica en su grupo, es muy ' +
      'probablemente la venta normal — responde "ninguna".)'
    : ''

  contenido.push({
    type: 'text',
    text: `Mensaje del cliente:\n"${texto || '(sin texto, solo imagen adjunta)'}"${nota}`,
  })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: PROMPT_SISTEMA,
      messages: [{ role: 'user', content: contenido }],
    })

    const raw = message.content[0]?.text?.trim() || ''
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())

    if (json.accion !== 'comprobante' && json.accion !== 'pedido_especifico') return null

    return {
      tipo: json.accion,
      resumen: json.resumen || '(sin resumen)',
      monto: json.accion === 'comprobante' && json.monto != null ? Number(json.monto) : null,
      // El monto "no coincide" se decide en B4 al conciliar contra lo que
      // debe el cliente — aquí no hay con qué compararlo todavía.
      detalle: json.detalle || null,
    }
  } catch (err) {
    console.error('[clasificador] error:', err?.message)
    // Ante un error de la IA, mejor no crear pendiente que tumbar el webhook.
    return null
  }
}
