// Registro de ventas por WhatsApp con preaprobación. Ver
// claude/ventas-whatsapp-preaprobacion-diseno.md (proyecto "Sitio web Denog")
// para el diseño completo — este módulo es la pieza de negocio; el webhook
// solo decide CUÁNDO llamarlo.
//
// FLUJO REAL — un video mostró 3 mensajes separados por venta (foto, precio
// MXN suelto, cliente+costo), pero los logs reales de producción (30/ago,
// segunda prueba) mostraron que a veces el precio SÍ viaja pegado como
// caption de la foto (`msg.image.caption`) aunque en el video se vea como
// burbuja aparte — probablemente por cómo WhatsApp renderiza un caption
// corto. Conclusión: no hay que apostar a un solo formato — se soportan
// los dos:
//   1. La foto reenviada, con o sin caption. Si el caption es SOLO un
//      número (con "$"/"pesos" opcional), es el precio de venta en pesos y
//      se usa directo, sin esperar un mensaje aparte.
//   2. Si el precio no vino en la foto, llega como su propio mensaje de
//      texto (solo número: "190", "$165", "395").
//   3. Un texto de cliente + costo en USD, en una sola línea (ej. "Marla
//      castro $6", "Claudia Maldonado 13") — piezas/talla solo si aplica.
//
// Segundo bug real de esa misma prueba: cada mensaje llegaba DOS veces al
// webhook — una vez validando la firma y otra sin validar (ver
// claude/whatsapp-webhook-b8-resuelto.md sobre por qué en coexistencia no
// todo se firma con nuestro secreto) — y como ahora se acepta el mensaje
// sin firma para la lista blanca, las dos copias se procesaban: 2 ventas
// se veían como 4. Corregido con una tabla de deduplicación por
// `mensaje_wa_id` (`whatsapp_mensajes_venta_procesados`) — cualquier
// mensaje de venta, sea cual sea su tipo, se procesa una sola vez sin
// importar cuántas veces lo reenvíe Meta.
//
// Diseño de emparejamiento: cada venta se arma en tres "casillas"
// independientes sobre la misma fila de `pedidos` — imagen, precio de
// venta (MXN), y cliente+costo (USD) — cada una emparejada por FIFO con el
// borrador más antiguo al que le falte ESA casilla. No importa en qué
// orden lleguen los mensajes: el que llegue busca el hueco correspondiente
// y lo llena; si no hay ninguno, crea un borrador nuevo con solo ese dato.
// Nunca se vuelve a tocar un borrador que ya tiene esa casilla llena (así
// no se pisa una venta ya aprobada — bug encontrado el 30/ago).
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function limpiarJson(raw) {
  return (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

// ─── Lista blanca ──────────────────────────────────────────────────────────
// Separada de `clientes` a propósito — ver la migración para el porqué.
export async function esVendedorVentas(supabase, telefono10Digitos) {
  if (!telefono10Digitos) return false
  const { data, error } = await supabase
    .from('vendedores_whatsapp_ventas')
    .select('telefono')
    .eq('telefono', telefono10Digitos)
    .eq('activo', true)
    .maybeSingle()
  if (error) { console.error('[ventasWhatsapp] error consultando lista blanca:', error.message); return false }
  return !!data
}

// ─── Clasificación de mensajes de texto ────────────────────────────────────
// El mensaje de precio es SOLO un número (con "$"/"MX$"/"pesos" opcional
// alrededor) y nada más — sin letras, sin nombre. Cualquier otra cosa se
// trata como el mensaje de cliente+costo.
function esSoloPrecioMXN(texto) {
  if (!texto) return false
  const limpio = texto.trim()
    .replace(/^(mx\$|\$)\s*/i, '')
    .replace(/\s*pesos$/i, '')
    .trim()
  return /^\d+(\.\d{1,2})?$/.test(limpio)
}

function parsePrecioMXN(texto) {
  const limpio = texto.trim()
    .replace(/^(mx\$|\$)\s*/i, '')
    .replace(/\s*pesos$/i, '')
    .trim()
  return Number(limpio)
}

// ─── Deduplicación por mensaje ──────────────────────────────────────────────
// Meta puede entregar el mismo mensaje dos veces (una firmada, otra no —
// ver nota de arriba); esto evita procesarlo dos veces sin importar el
// tipo de mensaje. Devuelve true si YA se había procesado (hay que
// ignorarlo), false si es la primera vez (hay que seguir).
export async function yaFueProcesado(supabase, mensajeWaId) {
  if (!mensajeWaId) return false
  const { error } = await supabase
    .from('whatsapp_mensajes_venta_procesados')
    .insert({ mensaje_wa_id: mensajeWaId })
  return !!error // choque de llave (23505) = ya existía = duplicado
}

// ─── Mensaje foto: descripción y categoría del producto ────────────────────
// El precio NO se le pide a este análisis de visión — si viene, ya se
// extrajo del caption por texto plano (ver procesarMensajeVentaFoto) antes
// de llegar aquí; pedírselo también a la IA de imagen solo duplicaba
// trabajo y podía contradecirse.
export async function extraerDeFoto({ imagenUrl }) {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imagenUrl } },
          {
            type: 'text',
            text: `Esta es una foto de un producto que Denog (tienda de importaciones de
EE.UU.) va a revender.

Responde SOLO con JSON válido, sin texto adicional:
{
  "descripcion": "título descriptivo en español, máximo 60 caracteres, incluye marca si
    se ve, tipo de prenda/artículo y color. NO incluyas talla aquí — se agrega después.",
  "categoria": "una de estas opciones exactas: Ropa, Calzado, Comida / Snacks, Artículos de Hogar, Cuidado Personal, Electrónica, Juguetes, Otro"
}`,
          },
        ],
      }],
    })
    const json = JSON.parse(limpiarJson(message.content[0]?.text))
    return {
      descripcion: json.descripcion || null,
      categoria: json.categoria || null,
    }
  } catch (err) {
    console.error('[ventasWhatsapp] error en extraerDeFoto:', err?.message)
    return { descripcion: null, categoria: null }
  }
}

// ─── Mensaje texto: cliente / costo / piezas / talla ───────────────────────
export async function extraerDeTexto({ texto }) {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Eduardo, de Denog, acaba de vender un artículo y escribió este mensaje
con los datos de la venta: "${texto}"

El patrón normal es "nombre del cliente" + "número" (ej. "Monserrat Ibarra 6",
"Claudia Maldonado 13"). Ese número casi siempre es el COSTO en dólares, NO
la talla — es una confusión común y hay que evitarla:
- Un número suelto al final del mensaje (sin ninguna palabra que indique
  talla) es SIEMPRE precio_usd. Ejemplo: "Monserrat Ibarra 6" → cliente
  "Monserrat Ibarra", precio_usd 6, talla null.
- Solo es talla si el mensaje lo dice explícitamente con la palabra "talla"
  o "size" (ej. "talla 6", "size 10"), o si el valor es una letra/medida que
  no podría ser un precio (ej. "M", "XL", "7Y", "32").
- Si el mensaje trae DOS números (uno de costo y otro de talla), el que
  vaya pegado a la palabra "talla"/"size" es la talla; el otro es el costo.

Extrae SOLO con JSON válido, sin texto adicional:
{
  "cliente_nombre": "nombre del cliente tal como lo escribió, o null si no se menciona",
  "precio_usd": número (costo en dólares por pieza, lo que Denog pagó en la tienda de EE.UU.), o null si no se menciona ningún número que pueda ser el costo,
  "cantidad": número de piezas, o 1 si no se menciona ninguna cantidad,
  "talla": "la talla, SOLO si el mensaje la indica explícitamente según las reglas de arriba — de lo contrario null"
}`,
      }],
    })
    const json = JSON.parse(limpiarJson(message.content[0]?.text))
    return {
      cliente_nombre: json.cliente_nombre || null,
      precio_usd: json.precio_usd != null ? Number(json.precio_usd) : null,
      cantidad: json.cantidad != null ? Number(json.cantidad) : 1,
      talla: json.talla || null,
    }
  } catch (err) {
    console.error('[ventasWhatsapp] error en extraerDeTexto:', err?.message)
    return { cliente_nombre: null, precio_usd: null, cantidad: 1, talla: null }
  }
}

// ─── Resolución de cliente por nombre ──────────────────────────────────────
// Nombre claro (una sola coincidencia razonable) → se asigna. Ambiguo o sin
// coincidencia → se deja null; el staff lo resuelve a mano en la revisión
// (ahí mismo puede buscar o dar de alta un cliente nuevo).
function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export async function resolverClientePorNombre(supabase, nombreDetectado) {
  if (!nombreDetectado) return null
  const objetivo = normalizar(nombreDetectado)
  if (!objetivo) return null

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('rol', 'cliente')
  if (error || !clientes) return null

  const candidatos = clientes.filter(c => {
    const n = normalizar(c.nombre)
    return n === objetivo || n.includes(objetivo) || objetivo.includes(n)
  })

  return candidatos.length === 1 ? candidatos[0].id : null
}

// ─── Orquestación: tres casillas independientes por venta ──────────────────
// Cada mensaje llena UNA casilla (imagen, precio_venta, o cliente+costo) del
// borrador más antiguo al que todavía le falte esa casilla específica —
// nunca uno que ya la tenga, así no se pisa un borrador ya completo (bug del
// 30/ago). Si no hay ningún borrador con ese hueco, se crea uno nuevo solo
// con ese dato. Con esto el orden de llegada de los tres mensajes ya no
// importa en absoluto.
const BASE_BUSQUEDA_HUERFANO = supabase => supabase
  .from('pedidos')
  .select('id, descripcion')
  .eq('creado_via', 'whatsapp')
  .eq('pendiente_aprobacion', true)
  .neq('estado', 'descartado')

const DESCRIPCION_PENDIENTE = '(sin foto — completar a mano)'

function conTalla(descripcionBase, talla) {
  return talla ? `${descripcionBase} — talla ${talla}` : descripcionBase
}

export async function procesarMensajeVentaFoto(supabase, { pathImagen, imagenUrlFirmada, caption }) {
  const datos = await extraerDeFoto({ imagenUrl: imagenUrlFirmada })
  const descripcionFoto = datos.descripcion || '(sin descripción — revisar foto)'
  // Si el caption de la foto es solo un número, es el precio en pesos —
  // pasa directo, sin IA (ver nota de flujo real arriba). Si no trae nada
  // o trae otra cosa, se deja para el mensaje de precio aparte.
  const precioDelCaption = esSoloPrecioMXN(caption) ? parsePrecioMXN(caption) : null

  const { data: huerfano } = await BASE_BUSQUEDA_HUERFANO(supabase)
    .is('imagen_url', null)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (huerfano) {
    const descripcionPrevia = huerfano.descripcion === DESCRIPCION_PENDIENTE ? '' : (huerfano.descripcion || '')
    // Si el borrador ya traía una talla capturada en su descripción previa
    // (ej. "(sin foto — completar a mano) — talla M"), se conserva pegada a
    // la descripción real de la foto en vez de perderla.
    const sufijoTalla = descripcionPrevia.match(/ — talla .+$/)?.[0] || ''
    await supabase.from('pedidos').update({
      descripcion: descripcionFoto + sufijoTalla,
      categoria: datos.categoria || null,
      imagen_url: pathImagen,
      ...(precioDelCaption != null ? { precio_venta: precioDelCaption } : {}),
    }).eq('id', huerfano.id)
    return
  }

  await supabase.from('pedidos').insert({
    descripcion: descripcionFoto,
    categoria: datos.categoria || null,
    precio_venta: precioDelCaption,
    cantidad: 1,
    imagen_url: pathImagen,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
  })
}

export async function procesarMensajeVentaPrecio(supabase, { texto }) {
  const monto = parsePrecioMXN(texto)

  const { data: huerfano } = await BASE_BUSQUEDA_HUERFANO(supabase)
    .is('precio_venta', null)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (huerfano) {
    await supabase.from('pedidos').update({ precio_venta: monto }).eq('id', huerfano.id)
    return
  }

  await supabase.from('pedidos').insert({
    descripcion: DESCRIPCION_PENDIENTE,
    precio_venta: monto,
    cantidad: 1,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
  })
}

async function procesarMensajeVentaClienteCosto(supabase, { texto }) {
  const datos = await extraerDeTexto({ texto })
  const cliente_id = await resolverClientePorNombre(supabase, datos.cliente_nombre)
  const notaClienteAmbiguo = datos.cliente_nombre && !cliente_id
    ? `Cliente detectado por WhatsApp, sin coincidencia exacta: "${datos.cliente_nombre}"`
    : null

  const { data: huerfano } = await BASE_BUSQUEDA_HUERFANO(supabase)
    .is('cliente_id', null)
    .is('precio_usd', null)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (huerfano) {
    await supabase.from('pedidos').update({
      cliente_id,
      precio_usd: datos.precio_usd,
      cantidad: datos.cantidad || 1,
      descripcion: conTalla(huerfano.descripcion || DESCRIPCION_PENDIENTE, datos.talla),
      notas: notaClienteAmbiguo,
    }).eq('id', huerfano.id)
    return
  }

  await supabase.from('pedidos').insert({
    descripcion: conTalla(DESCRIPCION_PENDIENTE, datos.talla),
    cliente_id,
    precio_usd: datos.precio_usd,
    cantidad: datos.cantidad || 1,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
    notas: notaClienteAmbiguo,
  })
}

// Punto de entrada único para cualquier mensaje de texto de venta — decide
// si es el precio en pesos (solo número) o el de cliente+costo, y lo manda
// a la casilla que le corresponde. El webhook no necesita saber la
// diferencia entre los dos tipos de texto.
export async function procesarMensajeVentaTexto(supabase, { texto }) {
  if (esSoloPrecioMXN(texto)) {
    await procesarMensajeVentaPrecio(supabase, { texto })
  } else {
    await procesarMensajeVentaClienteCosto(supabase, { texto })
  }
}
