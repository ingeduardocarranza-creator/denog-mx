// Registro de ventas por WhatsApp con preaprobación. Ver
// claude/ventas-whatsapp-preaprobacion-diseno.md (proyecto "Sitio web Denog")
// para el diseño completo — este módulo es la pieza de negocio; el webhook
// solo decide CUÁNDO llamarlo.
//
// FLUJO REAL (confirmado con video del 30/ago/2026 — corrige el supuesto
// original de "2 mensajes: foto con caption + texto"): Eduardo reenvía, en
// TRES mensajes separados por cada venta, lo que se compró en el grupo
// "compras del día":
//   1. La foto reenviada — SIN caption. Nunca trae el precio.
//   2. Un texto aparte que es SOLO el precio de venta en pesos (ej. "190",
//      "$165", "395" — a veces con "$", a veces sin nada más).
//   3. Un texto aparte con nombre del cliente + costo en USD, en una sola
//      línea (ej. "Marla castro $6", "Claudia Maldonado 13") — piezas/talla
//      solo si aplica, dentro de esa misma línea.
//
// Por eso los intentos anteriores "no leían" el precio: se buscaba en el
// caption de la foto, y la foto nunca trae caption — el precio siempre es
// su propio mensaje de texto. Y por eso los mensajes de texto "se
// combinaban" mal: había dos tipos de texto (precio MXN vs. cliente+costo)
// tratados como si fueran uno solo.
//
// Diseño actual: cada venta se arma en tres "casillas" independientes sobre
// la misma fila de `pedidos` — imagen, precio de venta (MXN), y
// cliente+costo (USD) — cada una emparejada por FIFO con el borrador más
// antiguo al que le falte ESA casilla. No importa en qué orden lleguen los
// tres mensajes: el que llegue busca el hueco correspondiente y lo llena;
// si no hay ninguno, crea un borrador nuevo con solo ese dato. Nunca se
// vuelve a tocar un borrador que ya tiene esa casilla llena (así no se
// pisa una venta ya aprobada — bug encontrado el 30/ago).
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

// ─── Mensaje foto: descripción y categoría del producto ────────────────────
// Ya NO se le pide el precio a este análisis — la foto nunca trae caption
// con precio en el uso real, así que preguntarlo solo generaba `null` y
// confundía. El precio en pesos llega siempre como su propio mensaje de
// texto (ver esSoloPrecioMXN/procesarMensajeVentaPrecio).
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

Extrae SOLO con JSON válido, sin texto adicional:
{
  "cliente_nombre": "nombre del cliente tal como lo escribió, o null si no se menciona",
  "precio_usd": número (costo en dólares por pieza, lo que Denog pagó en la tienda de EE.UU.), o null si no se menciona,
  "cantidad": número de piezas, o 1 si no se menciona ninguna cantidad,
  "talla": "la talla tal como se menciona (ej. 'M', '10', '7Y'), o null si no aplica o no se menciona"
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

export async function procesarMensajeVentaFoto(supabase, { pathImagen, imagenUrlFirmada }) {
  const datos = await extraerDeFoto({ imagenUrl: imagenUrlFirmada })
  const descripcionFoto = datos.descripcion || '(sin descripción — revisar foto)'

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
    }).eq('id', huerfano.id)
    return
  }

  await supabase.from('pedidos').insert({
    descripcion: descripcionFoto,
    categoria: datos.categoria || null,
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
