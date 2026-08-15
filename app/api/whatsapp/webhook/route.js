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

function firmaValida(req, cuerpoCrudo) {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto) return true // sin secreto configurado, no bloquea (para probar en desarrollo)
  const firma = req.headers.get('x-hub-signature-256') || ''
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex')
  let valida = false
  try {
    valida = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))
  } catch {
    valida = false
  }
  if (!valida) {
    // Diagnóstico temporal: no expone el secreto ni la firma completa, solo
    // lo suficiente para saber si el request trae firma de Meta o es ruido
    // de otro origen (ej. un rastreador sin firmar), y si el secreto
    // configurado en Vercel tiene la longitud esperada.
    console.error('[webhook whatsapp] firma inválida', {
      userAgent: req.headers.get('user-agent') || '(sin user-agent)',
      secretoConfigurado: !!secreto,
      secretoLongitud: secreto.length,
      traeFirma: !!req.headers.get('x-hub-signature-256'),
      firmaRecibidaPrefijo: firma ? firma.slice(0, 15) : '(sin header)',
      firmaEsperadaPrefijo: esperada.slice(0, 15),
      largoCuerpo: cuerpoCrudo.length,
    })
  }
  return valida
}

export async function POST(req) {
  const cuerpoCrudo = await req.text()
  if (!firmaValida(req, cuerpoCrudo)) {
    return NextResponse.json({ ok: false, mensaje: 'Firma inválida' }, { status: 401 })
  }

  let payload
  try {
    payload = JSON.parse(cuerpoCrudo)
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'JSON inválido' }, { status: 400 })
  }

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const valor = change.value || {}

        for (const msg of valor.messages || []) {
          await procesarMensajeEntrante(msg, valor)
        }

        // Ecos de mensajes que ustedes mandan desde la app del celular
        // (coexistencia). El nombre exacto de este campo lo documenta Meta
        // como "message_echoes", pero no se puede confirmar hasta ver
        // tráfico real — si al conectar el webhook los ecos no cierran los
        // pendientes de "sin responder" solos, revisar aquí el payload que
        // realmente llega y ajustar el nombre del campo.
        for (const eco of valor.message_echoes || []) {
          await procesarEcoStaff(eco)
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

  const texto = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || null

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
