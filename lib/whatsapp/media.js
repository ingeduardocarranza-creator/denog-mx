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

// Firma MUCHAS rutas de una vez.
//
// Por qué existe: firmar es una consulta a la base, y las pantallas pedían una
// firma por foto en paralelo. La entrega del 5 de septiembre tiene 384 fotos:
// eran 384 consultas simultáneas, 3.7 segundos, y Storage rechazaba ~14 con
// "429 too_many_connections". Las rechazadas volvían como null, la pantalla
// caía a la ruta del bucket —que no es una URL— y se veía la foto rota. En
// Empacado eso significa no saber qué producto va en la bolsa.
//
// createSignedUrls (plural) hace lo mismo en una sola llamada. Se trocea por si
// la lista es enorme, y se quitan repetidas antes de pedir.
// Lotes de 50: uno de 100 sigue siendo un mordisco grande para Storage y,
// cuando falla, se lleva las 100 fotos de una vez.
const LOTE = 50
const REINTENTOS = 3

const esperar = (ms) => new Promise(r => setTimeout(r, ms))

export async function urlsFirmadas(supabase, paths, segundos = 3600) {
  const limpias = [...new Set((paths || []).filter(p => p && !String(p).startsWith('http')))]
  const mapa = {}
  if (limpias.length === 0) return mapa

  for (let i = 0; i < limpias.length; i += LOTE) {
    const trozo = limpias.slice(i, i + LOTE)

    // El error que devuelve Storage cuando se satura es literalmente
    // 'SlowDown' / too_many_connections: es una petición de que esperemos, no
    // una falla definitiva. Rendirse al primer intento dejaba medio centenar
    // de artículos sin foto. Se reintenta con esperas crecientes.
    for (let intento = 1; intento <= REINTENTOS; intento++) {
      const { data, error } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrls(trozo, segundos)

      if (!error) {
        for (const fila of data || []) {
          if (fila?.path && fila?.signedUrl) mapa[fila.path] = fila.signedUrl
          else if (fila?.error) console.error('[media] ruta sin firmar:', fila.path, fila.error)
        }
        break
      }

      if (intento === REINTENTOS) {
        console.error(`[media] lote de ${trozo.length} sin firmar tras ${REINTENTOS} intentos:`, error.message)
      } else {
        await esperar(250 * intento)
      }
    }
  }
  return mapa
}
