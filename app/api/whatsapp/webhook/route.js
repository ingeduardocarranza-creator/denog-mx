import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { clasificarMensaje } from '@/lib/whatsapp/clasificador'
import { a10Digitos } from '@/lib/whatsapp/telefono'
import { descargarYGuardarMedia, urlFirmada } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Meta llama a esto UNA vez, al guardar la URL del webhook en el panel de
// desarrolladores, para confirmar que el endpoint es tuyo.
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

        // Mensajes entrantes de clientes: es lo único que crea pendientes
        // (incluidos comprobantes de pago), así que aquí SÍ exigimos que el
        // evento venga firmado con nuestro App Secret. Sin eso, cualquiera que
        // conociera la URL podría inyectar comprobantes falsos.
        if (campo === 'messages') {
          if (!firmadoPorNosotros) {
            console.error('[webhook whatsapp] evento "messages" sin firma válida, descartado', {
              idsMensaje: (valor.messages || []).map(m => m.id),
            })
            continue
          }
          for (const msg of valor.messages || []) {
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
          if (ecos.length) {
            // Temporal: confirmar la forma real del payload la primera vez que
            // llegue uno (procesarEcoStaff espera `to` o `recipient_id`).
            console.log('[webhook whatsapp] eco recibido', {
              campo,
              claves: Object.keys(ecos[0]),
            })
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

  // El cliente volvió a escribir: si había un pendiente de "sin responder"
  // abierto para este número, ya no aplica (si de verdad sigue sin
  // atenderse, el siguiente barrido abre uno nuevo).
  await supabase.from('pendientes')
    .update({ estado: 'resuelto', resuelto_en: ahora })
    .eq('telefono_whatsapp', telefono).eq('tipo', 'sin_responder').in('estado', ['nuevo', 'visto'])

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
  if (msg.type === 'image' && msg.image?.id) {
    try {
      pathImagen = await descargarYGuardarMedia(msg.image.id, supabase)
      urlParaClasificar = await urlFirmada(supabase, pathImagen, 300)
    } catch (err) {
      console.error('[webhook whatsapp] no se pudo descargar la imagen:', err?.message)
    }
  }

  if (!texto && !urlParaClasificar) return // audio, sticker, ubicación, etc. — nada que clasificar por ahora

  const esReenviada = !!(msg.context?.forwarded || msg.context?.frequently_forwarded)
  const resultado = await clasificarMensaje({ texto, imagenUrl: urlParaClasificar, esReenviada })

  // Temporal: deja ver en los logs qué recibió realmente la IA y qué decidió,
  // sin tener que adivinar. Quitar cuando la clasificación esté afinada.
  console.log('[clasificador] entrada/salida', {
    tipoMensaje: msg.type,
    texto: texto ? texto.slice(0, 120) : null,
    traeImagen: !!urlParaClasificar,
    imagenFalló: msg.type === 'image' && !urlParaClasificar,
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
    imagen_url: pathImagen,
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

  await supabase.from('pendientes')
    .update({ estado: 'resuelto', resuelto_en: ahora })
    .eq('telefono_whatsapp', telefono).eq('tipo', 'sin_responder').in('estado', ['nuevo', 'visto'])
}
