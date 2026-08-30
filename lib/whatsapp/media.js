// Descarga imágenes que llegan por WhatsApp (los links que da Meta expiran
// a las pocas horas) y las guarda en el bucket privado 'whatsapp-media' de
// Supabase Storage, para poder verlas después desde /admin/pendientes.
const GRAPH = 'https://graph.facebook.com/v21.0'

function extensionDeMime(mime) {
  const tipo = (mime || 'image/jpeg').split(';')[0].split('/')[1]
  return tipo || 'jpg'
}

export async function descargarYGuardarMedia(mediaId, supabase, carpeta = 'comprobantes') {
  const token = process.env.WHATSAPP_TOKEN
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
  const meta = await metaRes.json()
  if (!meta.url) throw new Error(meta.error?.message || 'No se pudo obtener la URL del archivo')

  const archivoRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!archivoRes.ok) throw new Error(`Descarga falló: ${archivoRes.status}`)
  const buffer = Buffer.from(await archivoRes.arrayBuffer())

  const path = `${carpeta}/${Date.now()}-${mediaId}.${extensionDeMime(meta.mime_type)}`
  const { error } = await supabase.storage.from('whatsapp-media').upload(path, buffer, {
    contentType: meta.mime_type || 'image/jpeg',
  })
  if (error) throw error
  return path
}

// URL temporal para mostrar la imagen (en el admin, o para pasársela al
// clasificador). El bucket es privado, así que no hay URL pública fija.
export async function urlFirmada(supabase, path, segundos = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrl(path, segundos)
  if (error) { console.error('[media] no se pudo firmar la URL:', error.message); return null }
  return data?.signedUrl || null
}
