// Bandeja de mensajes de venta por WhatsApp — el arreglo del desfase.
// Ver claude/ventas-whatsapp-desfase.md y la migración
// db/migrations/2026-09-03_whatsapp_ventas_bandeja.sql.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El diseño anterior emparejaba al vuelo: cada mensaje que llegaba buscaba en
// `pedidos` el borrador más viejo al que le faltara su casilla. Como cada
// mensaje es una petición HTTP aparte y Vercel las corre en paralelo, y como
// procesar una foto tarda 3-5 s contra ~1 s de un texto, los textos
// terminaban antes que las fotos que los precedían: el cliente se pegaba a la
// foto de otra venta y a partir de ahí todo se recorría un lugar.
//
// Aquí se parte en dos lo que antes iba junto:
//   - Lo LENTO (bajar la foto, preguntarle a la IA) sigue siendo paralelo,
//     pero cada petición solo toca SU PROPIA fila de la bandeja. Nadie compite
//     por el mismo borrador, así que ya no hay carrera.
//   - Lo que necesita ORDEN (armar las filas de `pedidos`) se hace después, en
//     un solo proceso y con candado, recorriendo la bandeja de la más vieja a
//     la más nueva. Una foto abre una venta, el siguiente texto la cierra.
//
// El formato real de los mensajes (confirmado con los logs de producción del
// 2 sep 2026, corrige lo que decía el diseño original):
//   1. La foto SÍ trae el precio de venta en pesos pegado como caption:
//      "$335", "$165", "$295 / 6 pack".
//   2. Luego un texto con cliente, costo en dólares y talla opcional:
//      "Martha Figueroa \n $8.99", "Rocio Sandoval, $11 , talla M".
// A veces el precio llega como su propio mensaje de solo número, así que se
// sigue soportando ese caso.
import { descargarYGuardarMedia, urlFirmada } from '@/lib/whatsapp/media'
import {
  extraerDeFoto,
  extraerDeTexto,
  esSoloPrecioMXN,
  parsePrecioMXN,
  extraerPrecioDeCaption,
  normalizarNombre,
} from '@/lib/whatsapp/ventasWhatsapp'

const DESCRIPCION_PENDIENTE = '(sin foto — completar a mano)'
const SIN_DESCRIPCION = '(sin descripción — revisar foto)'

// Un mensaje atorado en "pendiente" bloquea el armado de todo lo que viene
// después (a propósito: mejor esperar que desfasar). Estos son los límites
// para que ese bloqueo nunca sea eterno.
const REINTENTO_TRAS_MS = 45_000   // tiempo que se le da a un enriquecimiento en curso
const MAX_INTENTOS = 3             // después de esto se marca 'omitido' y deja de estorbar
const MAX_REINTENTOS_POR_LLAMADA = 6
const CANDADO_CADUCA_MS = 120_000

// ─── 1. Encolar ────────────────────────────────────────────────────────────
// Lo PRIMERO que hace el webhook. Un solo INSERT, sin IA ni descargas: entre
// más rápido sea, más se parece el orden de inserción al orden real de envío
// (el timestamp de WhatsApp solo tiene granularidad de un segundo, así que
// dentro del mismo segundo el desempate es el orden de llegada).
//
// La llave primaria es el id del mensaje, así que la segunda copia que manda
// Meta choca y se ignora sola — ya no hace falta la tabla de deduplicación
// aparte.
export function claseDeMensaje(msg) {
  if (msg.image?.id)    return { clase: 'media', media_id: msg.image.id }
  if (msg.video?.id)    return { clase: 'media', media_id: msg.video.id }
  if (msg.document?.id) return { clase: 'media', media_id: msg.document.id }
  const texto = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || null
  if (texto) return { clase: 'texto', media_id: null }
  return null // audio, sticker, ubicación: no son parte de una venta
}

export function textoDeMensaje(msg) {
  return msg.text?.body
    || msg.image?.caption
    || msg.video?.caption
    || msg.document?.caption
    || msg.button?.text
    || msg.interactive?.button_reply?.title
    || null
}

export async function encolarMensajeVenta(supabase, msg, telefono) {
  const clasificado = claseDeMensaje(msg)
  if (!clasificado) return null

  const recibido = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toISOString()
    : new Date().toISOString()

  const { data, error } = await supabase
    .from('whatsapp_ventas_bandeja')
    .insert({
      mensaje_wa_id: msg.id,
      recibido_en: recibido,
      telefono,
      clase: clasificado.clase,
      tipo_wa: msg.type || null,
      media_id: clasificado.media_id,
      texto: textoDeMensaje(msg),
    })
    .select('*')
    .maybeSingle()

  if (error) {
    // 23505 = ya estaba encolado (Meta reenvió el mismo mensaje). No es falla.
    if (error.code !== '23505') console.error('[bandeja] no se pudo encolar:', error.message)
    return null
  }
  return data
}

// ─── 2. Enriquecer ─────────────────────────────────────────────────────────
// Lo lento. Corre en paralelo sin problema: solo escribe en su propia fila.
export async function enriquecerFila(supabase, fila) {
  try {
    let imagen_path = fila.imagen_path || null
    let datos = {}

    if (fila.clase === 'media') {
      if (!imagen_path && fila.media_id) {
        imagen_path = await descargarYGuardarMedia(fila.media_id, supabase, 'ventas_whatsapp')
      }
      // Del caption solo se saca el precio. El resto del texto no se usa como
      // título (ver extraerPrecioDeCaption): se guarda como nota para que no se
      // pierda —ahí suele venir la talla, o la pregunta de la clienta— y el
      // título lo hace la IA mirando la foto.
      const precio = extraerPrecioDeCaption(fila.texto)
      const notaCaption = fila.texto && !esSoloPrecioMXN(fila.texto) ? fila.texto.trim() : null

      // Solo las fotos se pueden mirar. Un video o un PDF se guarda igual y se
      // arma con lo que diga el caption — Eduardo completa la descripción en
      // la revisión. (El envío del 2 sep traía un video, "HOMBRE // TALLA M //
      // $310", que con el código anterior se perdía por completo y además su
      // precio se registraba como costo en dólares.)
      let deLaFoto = { descripcion: null, categoria: null }
      if (fila.tipo_wa === 'image' && imagen_path) {
        const firmada = await urlFirmada(supabase, imagen_path, 300)
        if (firmada) deLaFoto = await extraerDeFoto({ imagenUrl: firmada })
      }

      datos = {
        descripcion: deLaFoto.descripcion || (fila.tipo_wa === 'image' ? SIN_DESCRIPCION : `(${fila.tipo_wa} — revisar el adjunto)`),
        categoria: deLaFoto.categoria || null,
        precio_venta: precio,
        nota_caption: notaCaption,
      }
    } else if (esSoloPrecioMXN(fila.texto)) {
      datos = { subclase: 'precio', precio_venta: parsePrecioMXN(fila.texto) }
    } else {
      const t = await extraerDeTexto({ texto: fila.texto })
      datos = { subclase: 'cliente', ...t }
    }

    const { error } = await supabase
      .from('whatsapp_ventas_bandeja')
      .update({ imagen_path, datos, estado: 'listo', error: null, actualizado_en: new Date().toISOString() })
      .eq('mensaje_wa_id', fila.mensaje_wa_id)
      .eq('estado', 'pendiente') // si ya lo armó otra pasada, no lo revive
    if (error) console.error('[bandeja] no se pudo guardar el enriquecido:', error.message)
    return true
  } catch (err) {
    const intentos = (fila.intentos || 0) + 1
    await supabase.from('whatsapp_ventas_bandeja').update({
      intentos,
      error: err?.message?.slice(0, 500) || 'error desconocido',
      // Tras varios intentos se deja pasar: un mensaje roto no puede tener
      // parada la lista para siempre. Queda marcado para poder revisarlo.
      estado: intentos >= MAX_INTENTOS ? 'omitido' : 'pendiente',
      actualizado_en: new Date().toISOString(),
    }).eq('mensaje_wa_id', fila.mensaje_wa_id).eq('estado', 'pendiente')
    console.error('[bandeja] falló el enriquecimiento', { id: fila.mensaje_wa_id, intentos, error: err?.message })
    return false
  }
}

// Rescata los que se quedaron a medias (la función se cortó, Meta nunca
// reintentó, la descarga falló). Se llama justo antes de armar.
async function reintentarAtorados(supabase) {
  const limite = new Date(Date.now() - REINTENTO_TRAS_MS).toISOString()
  const { data: atorados } = await supabase
    .from('whatsapp_ventas_bandeja')
    .select('*')
    .eq('estado', 'pendiente')
    .lt('actualizado_en', limite)
    .order('recibido_en', { ascending: true })
    .order('orden', { ascending: true })
    .limit(MAX_REINTENTOS_POR_LLAMADA)

  for (const fila of atorados || []) await enriquecerFila(supabase, fila)
  return (atorados || []).length
}

// ─── 3. Armar, en orden estricto ───────────────────────────────────────────
// Esta es la parte que arregla el desfase. Corre UNA a la vez (candado) y
// recorre la bandeja de la más vieja a la más nueva: una foto abre una venta,
// el siguiente texto de cliente la cierra. Si un mensaje todavía se está
// enriqueciendo, el recorrido se DETIENE ahí — mejor esperar que emparejar de
// más y recorrer toda la lista.
async function tomarCandado(supabase) {
  const caduco = new Date(Date.now() - CANDADO_CADUCA_MS).toISOString()
  const { data } = await supabase
    .from('whatsapp_ventas_armado')
    .update({ tomado_en: new Date().toISOString() })
    .eq('id', 1)
    .or(`tomado_en.is.null,tomado_en.lt.${caduco}`)
    .select('id')
    .maybeSingle()
  return !!data
}

async function soltarCandado(supabase) {
  await supabase.from('whatsapp_ventas_armado').update({ tomado_en: null }).eq('id', 1)
}

// La venta que quedó abierta de una pasada anterior: la foto más reciente ya
// armada de ESE remitente, si su pedido sigue sin cliente. Así una foto que
// llegó al final de una tanda se puede cerrar con el texto que llegue en la
// siguiente, sin guardar estado aparte.
//
// Va por remitente porque puede haber más de una persona autorizada reenviando
// al mismo tiempo (Eduardo y quien más esté en la lista blanca). Sus mensajes
// se entreveran en la bandeja, y el texto de uno nunca debe cerrar la foto del
// otro.
async function ventaAbiertaPrevia(supabase, telefono) {
  const { data: ultima } = await supabase
    .from('whatsapp_ventas_bandeja')
    .select('pedido_id')
    .eq('estado', 'armado')
    .eq('clase', 'media')
    .eq('telefono', telefono)
    .not('pedido_id', 'is', null)
    .order('recibido_en', { ascending: false })
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ultima?.pedido_id) return null

  const { data: p } = await supabase
    .from('pedidos')
    .select('id, cliente_id, precio_usd, precio_venta, descripcion, notas, estado, pendiente_aprobacion')
    .eq('id', ultima.pedido_id)
    .maybeSingle()
  if (!p || !p.pendiente_aprobacion || p.estado === 'descartado') return null
  if (p.cliente_id || p.precio_usd != null) return null // ya la cerró un texto
  return p
}

function conTalla(descripcionBase, talla) {
  if (!talla) return descripcionBase
  if (String(descripcionBase || '').includes(`— talla ${talla}`)) return descripcionBase
  return `${descripcionBase} — talla ${talla}`
}

// Se cargan los clientes una sola vez por pasada en vez de una consulta por
// mensaje: son cientos de mensajes en una ráfaga.
async function cargarClientes(supabase) {
  const { data } = await supabase.from('clientes').select('id, nombre').eq('rol', 'cliente')
  return (data || []).map(c => ({ id: c.id, norm: normalizarNombre(c.nombre) }))
}

function resolverCliente(clientes, nombreDetectado) {
  const objetivo = normalizarNombre(nombreDetectado)
  if (!objetivo) return null
  const candidatos = clientes.filter(c => c.norm === objetivo || c.norm.includes(objetivo) || objetivo.includes(c.norm))
  return candidatos.length === 1 ? candidatos[0].id : null
}

async function marcarArmada(supabase, mensajeWaId, pedidoId) {
  await supabase.from('whatsapp_ventas_bandeja')
    .update({ estado: 'armado', pedido_id: pedidoId, actualizado_en: new Date().toISOString() })
    .eq('mensaje_wa_id', mensajeWaId)
}

async function insertarPedido(supabase, campos) {
  const { data, error } = await supabase.from('pedidos').insert({
    cantidad: 1,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
    ...campos,
  }).select('id, cliente_id, precio_usd, precio_venta, descripcion, notas').maybeSingle()
  if (error) { console.error('[bandeja] no se pudo crear el borrador:', error.message); return null }
  return data
}

export async function armarVentas(supabase) {
  if (!(await tomarCandado(supabase))) return { ok: true, ocupado: true, armados: 0, en_espera: 0 }

  try {
    await reintentarAtorados(supabase)

    const { data: filas, error } = await supabase
      .from('whatsapp_ventas_bandeja')
      .select('*')
      .in('estado', ['pendiente', 'listo', 'omitido'])
      .order('recibido_en', { ascending: true })
      .order('orden', { ascending: true })
      .limit(500)
    if (error) return { ok: false, mensaje: error.message }

    const clientes = await cargarClientes(supabase)
    // Una venta abierta por remitente: dos personas autorizadas pueden estar
    // reenviando a la vez y sus mensajes se entreveran en la bandeja.
    const abiertas = new Map()
    const bloqueados = new Set()
    const abiertaDe = async telefono => {
      if (!abiertas.has(telefono)) abiertas.set(telefono, await ventaAbiertaPrevia(supabase, telefono))
      return abiertas.get(telefono)
    }
    let armados = 0

    for (const f of filas || []) {
      // Un mensaje a medio enriquecer detiene el recorrido DE ESE REMITENTE: lo
      // que él mande después no se puede colocar sin saber qué era éste. Se
      // arma en la siguiente pasada. Los demás remitentes siguen normal.
      if (bloqueados.has(f.telefono)) continue
      if (f.estado === 'pendiente') { bloqueados.add(f.telefono); continue }
      if (f.estado === 'omitido') continue

      const abierta = await abiertaDe(f.telefono)

      const d = f.datos || {}

      if (f.clase === 'media') {
        const nuevo = await insertarPedido(supabase, {
          descripcion: d.descripcion || SIN_DESCRIPCION,
          categoria: d.categoria || null,
          imagen_url: f.imagen_path || null,
          precio_venta: d.precio_venta ?? null,
          // Lo que venía escrito junto a la foto (talla, "6 pack", la pregunta
          // de la clienta). No es el título —ese lo hace la IA— pero tampoco se
          // tira: aquí Eduardo lo ve al revisar.
          notas: d.nota_caption ? `Texto que venía con la foto: "${d.nota_caption}"` : null,
        })
        if (!nuevo) continue
        await marcarArmada(supabase, f.mensaje_wa_id, nuevo.id)
        abiertas.set(f.telefono, nuevo) // esta foto queda esperando su texto de cliente
        armados++
        continue
      }

      if (d.subclase === 'precio') {
        if (abierta && abierta.precio_venta == null) {
          await supabase.from('pedidos').update({ precio_venta: d.precio_venta }).eq('id', abierta.id)
          abierta.precio_venta = d.precio_venta
          await marcarArmada(supabase, f.mensaje_wa_id, abierta.id)
        } else {
          // Un precio sin foto abierta no se le roba a la venta siguiente: se
          // queda como su propia tarjeta, a la vista, para completarla a mano.
          const suelto = await insertarPedido(supabase, { descripcion: DESCRIPCION_PENDIENTE, precio_venta: d.precio_venta })
          if (suelto) await marcarArmada(supabase, f.mensaje_wa_id, suelto.id)
        }
        armados++
        continue
      }

      // Texto de cliente + costo: cierra la venta abierta.
      const cliente_id = resolverCliente(clientes, d.cliente_nombre)
      const nota = d.cliente_nombre && !cliente_id
        ? `Cliente detectado por WhatsApp, sin coincidencia exacta: "${d.cliente_nombre}"`
        : null

      if (abierta && !abierta.cliente_id && abierta.precio_usd == null) {
        await supabase.from('pedidos').update({
          cliente_id,
          precio_usd: d.precio_usd ?? null,
          cantidad: d.cantidad || 1,
          descripcion: conTalla(abierta.descripcion || DESCRIPCION_PENDIENTE, d.talla),
          // Se agrega a lo que ya traía la foto, no lo pisa.
          notas: [abierta.notas, nota].filter(Boolean).join(' · ') || null,
        }).eq('id', abierta.id)
        await marcarArmada(supabase, f.mensaje_wa_id, abierta.id)
        abiertas.set(f.telefono, null) // cerrada: el siguiente texto ya no la puede tocar
      } else {
        const suelto = await insertarPedido(supabase, {
          descripcion: conTalla(DESCRIPCION_PENDIENTE, d.talla),
          cliente_id,
          precio_usd: d.precio_usd ?? null,
          cantidad: d.cantidad || 1,
          notas: nota,
        })
        if (suelto) await marcarArmada(supabase, f.mensaje_wa_id, suelto.id)
      }
      armados++
    }

    // Lo que quedó sin armar: o todavía se está enriqueciendo, o está detrás de
    // uno que sí. Y los que se rindieron tras varios intentos, que hay que
    // poder ver — un mensaje que desaparece en silencio es justo el problema
    // que se está arreglando.
    const { count: enCola } = await supabase
      .from('whatsapp_ventas_bandeja')
      .select('mensaje_wa_id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'listo'])
    const { count: omitidos } = await supabase
      .from('whatsapp_ventas_bandeja')
      .select('mensaje_wa_id', { count: 'exact', head: true })
      .eq('estado', 'omitido')

    return { ok: true, armados, en_espera: enCola || 0, omitidos: omitidos || 0 }
  } finally {
    await soltarCandado(supabase)
  }
}
