// Envío saliente por WhatsApp Cloud API: subir una imagen y mandarla, libre
// o dentro de una plantilla aprobada.
//
// Dos formas de mandar algo:
//  - "libre": el chat tiene la ventana de 24h abierta (el cliente escribió
//    hace menos de un día). Se manda la imagen tal cual, con su pie de foto.
//    No hace falta plantilla ni aprobación de Meta.
//  - "plantilla": la ventana está cerrada. Solo se puede mandar una de las
//    plantillas que Meta ya aprobó, con sus variables en el orden exacto que
//    se dio de alta.
//
// Quién decide cuál usar es enviarDocumentos.js, no este archivo: aquí solo
// están las tres llamadas a la API de Meta.

const GRAPH = 'https://graph.facebook.com/v21.0'

function phoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) throw new Error('Falta WHATSAPP_PHONE_NUMBER_ID')
  return id
}

function token() {
  const t = process.env.WHATSAPP_TOKEN
  if (!t) throw new Error('Falta WHATSAPP_TOKEN')
  return t
}

async function leerRespuesta(res) {
  const cuerpo = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = cuerpo?.error?.message || cuerpo?.error?.error_data?.details || `Meta contestó ${res.status}`
    const err = new Error(msg)
    err.metaError = cuerpo?.error || null
    throw err
  }
  return cuerpo
}

// Sube el PNG a los servidores de Meta y devuelve el media_id. Ese id sirve
// UNA sola vez, para el siguiente mensaje que lo referencia — no es una URL
// reutilizable.
export async function subirMediaWhatsapp(buffer, mimeType = 'image/png', nombreArchivo = 'imagen.png') {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('file', new Blob([buffer], { type: mimeType }), nombreArchivo)

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  })
  const data = await leerRespuesta(res)
  if (!data?.id) throw new Error('Meta no devolvió media_id')
  return data.id
}

// waId: el número tal como lo espera Meta, "52" + 10 dígitos (ver
// lib/whatsapp/telefono.js → paraWaMe).
export async function enviarImagenLibre(waId, mediaId, caption) {
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: waId,
      type: 'image',
      image: { id: mediaId, caption },
    }),
  })
  const data = await leerRespuesta(res)
  return data?.messages?.[0]?.id || null
}

// plantilla: uno de los objetos de lib/whatsapp/plantillas.js.
// parametrosCuerpo: arreglo de strings, en el mismo orden que {{1}}, {{2}}...
export async function enviarPlantillaConImagen(waId, plantilla, mediaId, parametrosCuerpo) {
  const components = []
  if (plantilla.tieneHeaderImagen) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] })
  }
  components.push({
    type: 'body',
    parameters: parametrosCuerpo.map((texto) => ({ type: 'text', text: String(texto ?? '') })),
  })

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: waId,
      type: 'template',
      template: { name: plantilla.nombre, language: { code: plantilla.idioma }, components },
    }),
  })
  const data = await leerRespuesta(res)
  return data?.messages?.[0]?.id || null
}

// ¿Este cliente nos escribió en las últimas 24 horas? Si nunca hay registro
// (nunca nos ha escrito, o es un cliente viejo de antes de este cambio), la
// ventana se considera cerrada — se manda la plantilla, que es lo seguro.
const VEINTICUATRO_HORAS_MS = 24 * 60 * 60 * 1000

export async function ventanaAbierta(supabase, telefono10) {
  if (!telefono10) return false
  const { data } = await supabase
    .from('whatsapp_ventana')
    .select('ultimo_mensaje_en')
    .eq('telefono', telefono10)
    .maybeSingle()
  if (!data?.ultimo_mensaje_en) return false
  return Date.now() - new Date(data.ultimo_mensaje_en).getTime() < VEINTICUATRO_HORAS_MS
}
