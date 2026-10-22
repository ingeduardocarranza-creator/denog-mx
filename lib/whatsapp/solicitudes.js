// ---------------------------------------------------------------------------
// Solicitudes de producto por WhatsApp ("lo que te piden").
//
// El grupo es cerrado: el cliente no escribe "lo quiero", manda la FOTO del
// producto (reenviada del grupo o del estado) con su texto y precio. El equipo
// contesta con el sticker del perrito ("Disponible, aquí lo llevo") o, si ya
// no hay, con un texto ("ya no hay", "agotado").
//
// Aquí se guarda cada foto de producto que manda un cliente
// (whatsapp_solicitudes) y, por los ecos del celular de Denog, cómo se le
// contestó. Con eso Tendencias sabe qué se pide, qué se confirma y qué se
// agota — de TODO lo que se publica, no solo de lo que sale de la página.
//
// No cambia nada del flujo de comprobantes ni del de ventas: solo agrega un
// renglón aparte, y si algo falla aquí, se ignora.
// ---------------------------------------------------------------------------

const PRECIO = /\$\s?(\d{1,3}(?:,\d{3})+|\d{2,5})(?:\.\d+)?/
// Fotos de pago que traen un monto en el texto: ésas son comprobantes, no productos.
const PAGO = /transfer|dep[oó]sit|pago|pagu[eé]|abono|abon[eé]|comprobante|spei|oxxo|liquid|saldo|cuenta|tarjeta/i
const AGOTADO = /agotad|ya no (hay|tengo|tenemos|qued|alcan)|no (hay|tengo|tenemos|qued[oóa]|alcanz)|se (acab|termin)|sin existencia|ya se vendi/i
const VENTANA_RESPUESTA_H = 24

// "*Great Value Chips*\nColor: Rojo\n💵 Precio: $85" → "Great Value Chips"
export function tituloDeCaption(caption) {
  const lineas = String(caption || '').split('\n')
    .map(l => l
      .replace(/\p{Extended_Pictographic}|️/gu, '')
      .replace(/precio\s*:?/i, '')
      .replace(/\$\s?[\d,]+(?:\.\d+)?/g, '')
      .replace(/[*_~]/g, '')
      .replace(/\s+/g, ' ').trim())
    .filter(l => l && !/^(color|colores|talla|tallas|sabor|aroma)\s*:/i.test(l))
  return (lineas[0] || '').slice(0, 200)
}

export function precioDeCaption(caption) {
  const m = String(caption || '').match(PRECIO)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

// ¿Este mensaje entrante es la foto de un producto publicado?
export function esSolicitudProducto(msg) {
  if (msg?.type !== 'image') return false
  const cap = msg.image?.caption
  if (!cap || precioDeCaption(cap) == null || PAGO.test(cap)) return false
  return tituloDeCaption(cap).replace(/[^a-záéíóúñ]/gi, '').length >= 5
}

export async function registrarSolicitud(supabase, { msg, telefono10, nombre, imagenPath }) {
  try {
    const cap = msg.image.caption
    let cliente_id = null
    if (telefono10) {
      const { data } = await supabase.from('clientes').select('id').eq('telefono', telefono10).maybeSingle()
      cliente_id = data?.id || null
    }
    const recibido = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString()
    const { error } = await supabase.from('whatsapp_solicitudes').upsert({
      mensaje_wa_id: msg.id, telefono: telefono10, cliente_id, nombre_whatsapp: nombre,
      texto: cap.slice(0, 600), titulo: tituloDeCaption(cap), precio: precioDeCaption(cap),
      imagen_path: imagenPath || null,
      reenviada: !!(msg.context?.forwarded || msg.context?.frequently_forwarded),
      recibido_en: recibido,
    }, { onConflict: 'mensaje_wa_id', ignoreDuplicates: true })
    if (error) console.error('[solicitudes] no se pudo guardar:', error.message)
  } catch (e) {
    console.error('[solicitudes] error:', e?.message)
  }
}

// Eco de Denog a un cliente: sticker = "disponible"; texto de "ya no hay" = "agotada".
// Se aplica a la solicitud pendiente más vieja de ese cliente (el equipo
// contesta en orden), dentro de las últimas 24 h.
export async function registrarRespuestaEco(supabase, eco, telefono10) {
  try {
    if (!telefono10) return
    let estado = null
    if (eco.type === 'sticker') estado = 'disponible'
    else if (eco.type === 'text' && AGOTADO.test(eco.text?.body || '')) estado = 'agotada'
    if (!estado) return
    const desde = new Date(Date.now() - VENTANA_RESPUESTA_H * 3600000).toISOString()
    const { data } = await supabase.from('whatsapp_solicitudes').select('id')
      .eq('telefono', telefono10).eq('estado', 'pedida').gte('recibido_en', desde)
      .order('recibido_en', { ascending: true }).limit(1)
    if (!data?.[0]) return
    const respondida = eco.timestamp ? new Date(Number(eco.timestamp) * 1000).toISOString() : new Date().toISOString()
    await supabase.from('whatsapp_solicitudes').update({ estado, respondida_en: respondida }).eq('id', data[0].id).eq('estado', 'pedida')
  } catch (e) {
    console.error('[solicitudes] eco:', e?.message)
  }
}
