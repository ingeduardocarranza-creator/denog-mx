import { createClient } from '@supabase/supabase-js'
import { NextResponse, after } from 'next/server'
import crypto from 'crypto'
import { clasificarMensaje } from '@/lib/whatsapp/clasificador'
import { a10Digitos } from '@/lib/whatsapp/telefono'
import { descargarYGuardarMedia, urlFirmada } from '@/lib/whatsapp/media'
import { esVendedorVentas } from '@/lib/whatsapp/ventasWhatsapp'
import { encolarMensajeVenta, enriquecerFila, textoDeMensaje } from '@/lib/whatsapp/ventasBandeja'

// Enriquecer un mensaje (bajar el adjunto de Meta, subirlo a Storage,
// mirarlo con la IA) se lleva varios segundos. Con el tope default de 10 s la
// función se cortaba a media descarga en las ráfagas grandes y ese mensaje se
// perdía. El trabajo corre en after(), o sea DESPUÉS de contestarle a Meta.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Meta llama a esto UNA vez, al guardar la URL del webhook en el panel de
// desarrolladores, para confirmar que el endpoint es tuyo.
// La lista blanca se consulta en CADA mensaje entrante, y en una ráfaga es lo
// primero que corre antes de encolar. Como casi nunca cambia, se guarda en
// memoria unos minutos: así el encolado (que es lo que fija el orden dentro de
// un mismo segundo) empieza sin una ida a la base de por medio.
const CACHE_LISTA_MS = 5 * 60 * 1000
const cacheVendedor = new Map() // telefono -> { valor, hasta }

async function esVendedorVentasCacheado(telefono10) {
  if (!telefono10) return false
  const guardado = cacheVendedor.get(telefono10)
  if (guardado && guardado.hasta > Date.now()) return guardado.valor
  const valor = await esVendedorVentas(supabase, telefono10)
  cacheVendedor.set(telefono10, { valor, hasta: Date.now() + CACHE_LISTA_MS })
  return valor
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const modo = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (modo === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Verificación fallida', { status: 403 })
}

// ¿Viene firmado con NUESTRO App Secret? Ojo: no todo el tráfico legítimo lo
// está. En coexistencia hay dos suscripciones al mismo WABA — la nuestra y la
// del Tech Partner (Dualhook) — y cada una firma con el App Secret de su
// propia app. Los eventos que entrega la suscripción del partner
// (`history`, `smb_message_echoes`) NUNCA van a validar contra el nuestro,
// porque su secreto es a nivel de app y no se comparte.
// Por eso esto ya no es una puerta de entrada global: se usa por campo, según
// lo que esté en juego. Ver el ruteo en POST().
function firmaNuestra(req, cuerpoCrudo) {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto) return true // sin secreto configurado, no bloquea (para probar en desarrollo)
  const firma = req.headers.get('x-hub-signature-256') || ''
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))
  } catch {
    return false
  }
}

// Segunda barrera, la que aplica a TODO lo que entra: que el evento sea de
// nuestra cuenta y de nuestro número. No sustituye a la firma, pero descarta
// cualquier payload que no venga de la cuenta que nos interesa.
function identidadEsperada(payload) {
  const wabaEsperado = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const numeroEsperado = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!wabaEsperado || !numeroEsperado) return true // sin configurar, no bloquea

  const entradas = payload.entry || []
  if (!entradas.length) return false

  for (const entry of entradas) {
    if (entry.id !== wabaEsperado) return false
    for (const change of entry.changes || []) {
      const idNumero = change.value?.metadata?.phone_number_id
      // Algunos eventos de cuenta no traen metadata; sólo validamos si viene.
      if (idNumero && idNumero !== numeroEsperado) return false
    }
  }
  return true
}

export async function POST(req) {
  const cuerpoCrudo = await req.text()
  const firmadoPorNosotros = firmaNuestra(req, cuerpoCrudo)

  let payload
  try {
    payload = JSON.parse(cuerpoCrudo)
  } catch {
    // Respondemos 200 a todo lo que no vamos a procesar: cualquier respuesta
    // de error hace que Meta reintente el mismo evento en bucle.
    return NextResponse.json({ ok: true, ignorado: 'json-invalido' })
  }

  if (!identidadEsperada(payload)) {
    console.warn('[webhook whatsapp] evento de otra cuenta o número, ignorado', {
      cuentaId: payload.entry?.[0]?.id || null,
      phoneNumberId: payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null,
    })
    return NextResponse.json({ ok: true, ignorado: 'identidad' })
  }

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const campo = change.field
        const valor = change.value || {}

        // Sincronización de historial de la coexistencia: Meta manda meses de
        // conversaciones viejas en muchos trozos, firmadas por el partner.
        // No las usamos. Descartar en silencio y responder 200 para que Meta
        // deje de reintentarlas.
        if (campo === 'history') continue

        // Temporal (3 sep 2026): los ecos llegaban hasta las 04:58 y después
        // dejaron de llegar, y en una prueba real quedaron 4 peticiones al
        // webhook sin nada registrado. Antes, cualquier campo que no fuera
        // `messages` ni un eco se caía del ruteo en silencio, así que no había
        // forma de saber qué eran. Esto registra TODO lo que entra (menos
        // `history`, que es un torrente y ya se descartó arriba). Quitar en
        // cuanto se resuelva. Ver claude/whatsapp-ecos-smb-hallazgo.md.
        console.log('[webhook whatsapp] campo recibido', {
          campo,
          claves: Object.keys(valor),
          mensajes: (valor.messages || []).length,
          ecos: (valor.message_echoes || []).length,
          estados: (valor.statuses || []).length,
        })

        // Mensajes entrantes de clientes: es lo único que crea pendientes
        // (incluidos comprobantes de pago), así que aquí SÍ exigimos que el
        // evento venga firmado con nuestro App Secret. Sin eso, cualquiera que
        // conociera la URL podría inyectar comprobantes falsos.
        //
        // Excepción: los números de la lista blanca de ventas (reenvíos desde
        // el personal de Eduardo). En la prueba real del 30/ago varios de
        // estos mensajes llegaron SIN validar contra nuestro App Secret —
        // mismo patrón que el campo `history` (ver
        // claude/whatsapp-webhook-b8-resuelto.md): en coexistencia no todo el
        // tráfico legítimo se firma con el nuestro. Si se exigiera firma aquí
        // también para estos números, esos mensajes se perdían en silencio —
        // eso explicaba por qué a veces "no leía" el precio de la foto: el
        // mensaje ni siquiera llegaba a procesarMensajeEntrante. Se acepta
        // igual porque (a) identidadEsperada() ya confirmó que el evento es
        // de nuestra cuenta/número, y (b) esto solo crea un borrador en "Por
        // aprobar" — nunca una venta real sin revisión humana.
        if (campo === 'messages') {
          for (const msg of valor.messages || []) {
            const diezRemitente = a10Digitos(msg.from)
            const esVentaWhitelist = await esVendedorVentasCacheado(diezRemitente)

            if (!firmadoPorNosotros && !esVentaWhitelist) {
              console.error('[webhook whatsapp] evento "messages" sin firma válida, descartado', {
                idMensaje: msg.id,
              })
              continue
            }

            if (!firmadoPorNosotros && esVentaWhitelist) {
              console.warn('[webhook whatsapp] mensaje de venta sin firma válida, aceptado por lista blanca', {
                idMensaje: msg.id,
                remitente: diezRemitente,
              })
            }

            await procesarMensajeEntrante(msg, valor)
          }
          continue
        }

        // Ecos de lo que el equipo contesta desde la app del celular. Llegan
        // por la suscripción del partner (campo `smb_message_echoes`), así que
        // vienen firmados con SU secreto y no podemos validarlos con el
        // nuestro. Se aceptan apoyados en la validación de identidad de
        // arriba: lo único que hacen es marcar como atendida una conversación,
        // no crean pendientes ni tocan dinero.
        if (campo === 'smb_message_echoes' || campo === 'message_echoes') {
          const ecos = valor.message_echoes || []
          // Temporal (3 sep 2026): los ecos SÍ están llegando —
          // `smb_message_echoes`, con texto y con imagen— aunque en agosto se
          // concluyó que este campo no se podía suscribir. Falta saber lo único
          // que importa para el registro de ventas: si incluyen lo que Denog
          // publica en el GRUPO "compras del día", o solo los chats 1 a 1. Si
          // incluyeran el grupo, el sistema tendría el catálogo completo sin
          // que nadie reenvíe nada. Este log mide justo eso. Quitar en cuanto
          // se responda. Ver claude/ventas-whatsapp-desfase.md.
          for (const eco of ecos) {
            console.log('[eco] payload', {
              campo,
              claves: Object.keys(eco),
              tipo: eco.type,
              de: eco.from,
              para: eco.to,
              paraUsuario: eco.to_user_id,
              // Si el destino es un grupo, tiene que asomar por aquí: Meta
              // marca los mensajes de grupo con un group_id.
              grupoId: eco.group_id || eco.recipient_group_id || null,
              destinoParece: /-|@g\.us/.test(String(eco.to || '')) ? 'GRUPO' : 'persona',
              texto: (eco.text?.body || eco.image?.caption || '').slice(0, 60) || null,
              traeMedia: !!(eco.image?.id || eco.video?.id || eco.document?.id),
            })
          }
          // Temporal (3 sep 2026): lo único que falta saber para poder capturar
          // ventas desde el propio celular de Denog es si la FOTO de un eco se
          // puede bajar. El eco trae el id de la imagen, pero es una imagen que
          // subió el celular de Denog, no una que nos mandaron — que el id
          // venga no garantiza que nuestro token la pueda descargar. Si esto
          // funciona, se construye el flujo completo; si no, el camino del eco
          // sirve para el texto pero no para las fotos.
          // Quitar cuando se responda. Ver claude/whatsapp-ecos-smb-hallazgo.md.
          for (const eco of ecos) {
            const idMedia = eco.image?.id || eco.video?.id || eco.document?.id
            if (idMedia) {
              try {
                const ruta = await descargarYGuardarMedia(idMedia, supabase, 'prueba_eco')
                console.log('[eco] media DESCARGADA', { idMedia, ruta })
              } catch (err) {
                console.error('[eco] media NO se pudo descargar', { idMedia, error: err?.message })
              }
            }
          }

          for (const eco of ecos) {
            await procesarEcoStaff(eco)
          }
          continue
        }
      }
    }
  } catch (err) {
    console.error('[webhook whatsapp] error procesando payload:', err)
    // Respondemos 200 aunque algo haya fallado adentro: si Meta ve un error
    // reintenta el mismo webhook varias veces y puede duplicar trabajo.
  }

  return NextResponse.json({ ok: true })
}

async function procesarMensajeEntrante(msg, valor) {
  const telefono = msg.from // wa_id del cliente, ej. "5216625486432"
  const diezEmisor = a10Digitos(telefono)

  // ─── Ventas por WhatsApp: encolar primero, procesar después ──────────────
  // Va ANTES que todo lo demás a propósito. En una ráfaga de ~100 reenvíos, el
  // orden en que se guardan los mensajes es lo único que después permite saber
  // qué texto va con qué foto (el timestamp de WhatsApp solo tiene precisión
  // de un segundo). Cualquier consulta o descarga que se hiciera antes del
  // encolado abre la puerta a que dos mensajes del mismo segundo se guarden
  // al revés.
  //
  // El trabajo pesado (bajar el adjunto, mirarlo con la IA) se manda a
  // after(): Meta recibe su 200 de inmediato y deja de reintentar, y el
  // enriquecimiento sigue corriendo. Ese trabajo solo toca SU PROPIA fila de
  // la bandeja, así que puede correr en paralelo sin pisar a nadie. Quién va
  // con quién lo decide el armado, en orden y con candado
  // (lib/whatsapp/ventasBandeja.js).
  if (await esVendedorVentasCacheado(diezEmisor)) {
    const fila = await encolarMensajeVenta(supabase, msg, diezEmisor)
    if (!fila) return // copia repetida de Meta, o un tipo que no es parte de una venta
    console.log('[ventasWhatsapp] encolado', {
      orden: fila.orden,
      tipo: msg.type,
      clase: fila.clase,
      texto: textoDeMensaje(msg),
    })
    after(() => enriquecerFila(supabase, fila))
    return
  }

  const contacto = (valor.contacts || []).find(c => c.wa_id === telefono)
  const nombre = contacto?.profile?.name || null
  const ahora = new Date().toISOString()

  // Estado de la conversación: para el barrido de "sin responder" y para
  // saber, cuando llegue un eco, a quién había que contestarle.
  await supabase.from('conversaciones_whatsapp').upsert({
    telefono_whatsapp: telefono,
    nombre_whatsapp: nombre,
    ultimo_mensaje_cliente_en: ahora,
    ultimo_mensaje_cliente_wa_id: msg.id,
    actualizado_en: ahora,
  }, { onConflict: 'telefono_whatsapp' })

  // OJO: cuando el cliente manda una foto CON texto en el mismo mensaje,
  // WhatsApp no pone ese texto en `text.body` sino en el `caption` del
  // adjunto. Sin esto, un "¿me consigues este artículo?" escrito junto a la
  // foto llegaba como null y el clasificador solo veía una imagen suelta.
  const texto = msg.text?.body
    || msg.image?.caption
    || msg.video?.caption
    || msg.document?.caption
    || msg.button?.text
    || msg.interactive?.button_reply?.title
    || null

  let pathImagen = null
  let urlParaClasificar = null
  let pathDocumento = null
  let urlDocumentoParaClasificar = null

  if (msg.type === 'image' && msg.image?.id) {
    try {
      pathImagen = await descargarYGuardarMedia(msg.image.id, supabase, 'comprobantes')
      urlParaClasificar = await urlFirmada(supabase, pathImagen, 300)
    } catch (err) {
      console.error('[webhook whatsapp] no se pudo descargar la imagen:', err?.message)
    }
  } else if (msg.type === 'document' && msg.document?.id) {
    // Muchos bancos mandan el comprobante como PDF adjunto (documento), no
    // como foto — WhatsApp lo entrega con type "document", no "image". Se
    // descarga igual que una imagen; si es PDF se manda al clasificador como
    // bloque "document" (ver clasificador.js). Si es otro tipo de archivo
    // (docx, xlsx, etc.) se guarda pero no se puede leer visualmente — solo
    // cuenta el texto/caption que traiga el mensaje.
    try {
      pathDocumento = await descargarYGuardarMedia(msg.document.id, supabase)
      if ((msg.document.mime_type || '').startsWith('application/pdf')) {
        urlDocumentoParaClasificar = await urlFirmada(supabase, pathDocumento, 300)
      } else {
        console.warn('[webhook whatsapp] documento no-PDF recibido, no se puede clasificar visualmente', {
          mimeType: msg.document.mime_type,
          nombre: msg.document.filename,
        })
      }
    } catch (err) {
      console.error('[webhook whatsapp] no se pudo descargar el documento:', err?.message)
    }
  }

  if (!texto && !urlParaClasificar && !urlDocumentoParaClasificar) return // audio, sticker, ubicación, etc. — nada que clasificar por ahora

  const esReenviada = !!(msg.context?.forwarded || msg.context?.frequently_forwarded)
  const resultado = await clasificarMensaje({
    texto,
    imagenUrl: urlParaClasificar,
    documentoUrl: urlDocumentoParaClasificar,
    esReenviada,
  })

  // Temporal: deja ver en los logs qué recibió realmente la IA y qué decidió,
  // sin tener que adivinar. Quitar cuando la clasificación esté afinada.
  console.log('[clasificador] entrada/salida', {
    tipoMensaje: msg.type,
    texto: texto ? texto.slice(0, 120) : null,
    traeImagen: !!urlParaClasificar,
    traeDocumento: !!urlDocumentoParaClasificar,
    imagenFalló: msg.type === 'image' && !urlParaClasificar,
    documentoFalló: msg.type === 'document' && !!msg.document?.id && !pathDocumento,
    esReenviada,
    decision: resultado?.tipo || 'ninguna',
    resumen: resultado?.resumen || null,
  })

  if (!resultado) return

  let cliente_id = null
  const diez = a10Digitos(telefono)
  if (diez) {
    const { data: cliente } = await supabase.from('clientes').select('id').eq('telefono', diez).maybeSingle()
    cliente_id = cliente?.id || null
  }

  // Si mensaje_wa_id ya existe (Meta reenvió el mismo webhook, pasa
  // seguido), el índice único de pendientes rechaza el insert calladamente
  // y no hace falta manejar el error aquí.
  await supabase.from('pendientes').insert({
    tipo: resultado.tipo,
    telefono_whatsapp: telefono,
    nombre_whatsapp: nombre,
    resumen: resultado.resumen,
    detalle: resultado.detalle,
    monto: resultado.monto,
    // La columna se llama imagen_url por el caso original, pero guarda la
    // ruta de cualquier adjunto — foto o PDF del comprobante.
    imagen_url: pathImagen || pathDocumento,
    mensaje_wa_id: msg.id,
    cliente_id,
  })
}

async function procesarEcoStaff(eco) {
  const telefono = eco.to || eco.recipient_id
  if (!telefono) return
  const ahora = new Date().toISOString()

  await supabase.from('conversaciones_whatsapp').upsert({
    telefono_whatsapp: telefono,
    ultima_respuesta_staff_en: ahora,
    actualizado_en: ahora,
  }, { onConflict: 'telefono_whatsapp' })

}
