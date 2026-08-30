// Registro de ventas por WhatsApp con preaprobación. Ver
// claude/ventas-whatsapp-preaprobacion-diseno.md (proyecto "Sitio web Denog")
// para el diseño completo — este módulo es la pieza de negocio; el webhook
// solo decide CUÁNDO llamarlo.
//
// Flujo: Eduardo reenvía desde su número personal, en dos mensajes
// separados, lo que se vende en el grupo "compras del día":
//   Mensaje foto: el caption trae el precio de venta en pesos (MXN).
//   Mensaje texto: cliente, costo en USD, piezas, talla si aplica.
//
// El orden pensado es foto primero y texto después, pero en la prueba real
// (30/ago/2026) llegaron los dos textos antes que las dos fotos, y como el
// emparejamiento original solo buscaba "texto → foto huérfana" (nunca al
// revés), las fotos no encontraron nada que completar y quedaron como
// borradores sueltos: 2 ventas reales se veían como 4 filas. Corregido:
// el emparejamiento es en los dos sentidos — cualquiera de los dos mensajes
// que llegue primero busca el huérfano más antiguo del OTRO tipo (FIFO por
// tipo). Así el orden de llegada ya no importa. Si de plano no hay pareja
// (se perdió un mensaje), queda igual como borrador suelto en "Por aprobar"
// para completarse a mano — nunca se descarta información.
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

// ─── Mensaje foto: precio en pesos ──────────────────────────────────────────
// Analiza la imagen (igual que /api/pedidos/sugerir-nombre) y además lee el
// precio de venta en pesos del caption que Eduardo reenvió con la foto.
export async function extraerDeFoto({ imagenUrl, caption }) {
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
EE.UU.) va a revender. El texto que acompaña la foto es: "${caption || '(sin texto)'}".

Responde SOLO con JSON válido, sin texto adicional:
{
  "descripcion": "título descriptivo en español, máximo 60 caracteres, incluye marca si
    se ve, tipo de prenda/artículo y color. NO incluyas talla aquí — se agrega después.",
  "categoria": "una de estas opciones exactas: Ropa, Calzado, Comida / Snacks, Artículos de Hogar, Cuidado Personal, Electrónica, Juguetes, Otro",
  "precio_venta_mxn": número en pesos mexicanos que aparezca en el texto como precio de venta, o null si no se menciona ningún precio
}`,
          },
        ],
      }],
    })
    const json = JSON.parse(limpiarJson(message.content[0]?.text))
    return {
      descripcion: json.descripcion || null,
      categoria: json.categoria || null,
      precio_venta: json.precio_venta_mxn != null ? Number(json.precio_venta_mxn) : null,
    }
  } catch (err) {
    console.error('[ventasWhatsapp] error en extraerDeFoto:', err?.message)
    return { descripcion: null, categoria: null, precio_venta: null }
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

// ─── Orquestación: une el mensaje de foto con el de texto ──────────────────
// Un borrador "huérfano de foto" (llegó la foto, falta el texto) se
// distingue por tener imagen y no tener costo en USD todavía. Un borrador
// "huérfano de texto" (llegó el texto, falta la foto) se distingue por NO
// tener imagen. Cualquier mensaje que llegue busca primero el huérfano más
// antiguo del tipo contrario — así no importa cuál de los dos llegue primero.
const DESCRIPCION_SIN_FOTO = '(sin foto — completar a mano)'

function quitarPrefijoSinFoto(descripcion) {
  // Si el borrador de texto quedó como "(sin foto — completar a mano) —
  // talla M", esto recupera " — talla M" para pegarlo a la descripción real
  // en cuanto llegue la foto.
  if (!descripcion || !descripcion.startsWith(DESCRIPCION_SIN_FOTO)) return ''
  return descripcion.slice(DESCRIPCION_SIN_FOTO.length)
}

export async function procesarMensajeVentaFoto(supabase, { pathImagen, imagenUrlFirmada, caption }) {
  const datos = await extraerDeFoto({ imagenUrl: imagenUrlFirmada, caption })
  const descripcionFoto = datos.descripcion || '(sin descripción — revisar foto)'

  // ¿Ya llegó el texto de esta venta (sin foto todavía)? Se identifica por
  // no tener imagen — nunca por el precio_usd, porque el texto puede llegar
  // sin costo mencionado y seguiría siendo el huérfano correcto a emparejar.
  const { data: huerfanoTexto } = await supabase
    .from('pedidos')
    .select('id, descripcion')
    .eq('creado_via', 'whatsapp')
    .eq('pendiente_aprobacion', true)
    .is('imagen_url', null)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (huerfanoTexto) {
    const sufijoTalla = quitarPrefijoSinFoto(huerfanoTexto.descripcion)
    await supabase.from('pedidos').update({
      descripcion: descripcionFoto + sufijoTalla,
      categoria: datos.categoria || null,
      precio_venta: datos.precio_venta,
      imagen_url: pathImagen,
    }).eq('id', huerfanoTexto.id)
    return
  }

  // No hay texto que emparejar todavía — se crea el borrador con la foto,
  // a la espera del mensaje de texto.
  await supabase.from('pedidos').insert({
    descripcion: descripcionFoto,
    categoria: datos.categoria || null,
    precio_venta: datos.precio_venta,
    cantidad: 1,
    imagen_url: pathImagen,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
  })
}

export async function procesarMensajeVentaTexto(supabase, { texto }) {
  const datos = await extraerDeTexto({ texto })
  const cliente_id = await resolverClientePorNombre(supabase, datos.cliente_nombre)
  const notaClienteAmbiguo = datos.cliente_nombre && !cliente_id
    ? `Cliente detectado por WhatsApp, sin coincidencia exacta: "${datos.cliente_nombre}"`
    : null

  // ¿Ya llegó la foto de esta venta (sin texto todavía)? Se identifica por
  // tener imagen — nunca por cliente_id, porque una foto reenviada sin
  // texto todavía no tiene ni cliente ni costo, y sigue siendo la huérfana
  // correcta a completar.
  const { data: huerfanoFoto } = await supabase
    .from('pedidos')
    .select('id, descripcion')
    .eq('creado_via', 'whatsapp')
    .eq('pendiente_aprobacion', true)
    .not('imagen_url', 'is', null)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (huerfanoFoto) {
    const descripcionFinal = datos.talla
      ? `${huerfanoFoto.descripcion} — talla ${datos.talla}`
      : huerfanoFoto.descripcion
    await supabase.from('pedidos').update({
      cliente_id,
      precio_usd: datos.precio_usd,
      cantidad: datos.cantidad || 1,
      descripcion: descripcionFinal,
      notas: notaClienteAmbiguo,
    }).eq('id', huerfanoFoto.id)
    return
  }

  // No hay foto que emparejar todavía (llegó primero el texto, como pasó en
  // la prueba real) — se crea el borrador sin imagen, a la espera de la
  // foto. procesarMensajeVentaFoto lo completa en cuanto llegue.
  await supabase.from('pedidos').insert({
    descripcion: datos.talla ? `${DESCRIPCION_SIN_FOTO} — talla ${datos.talla}` : DESCRIPCION_SIN_FOTO,
    cliente_id,
    precio_usd: datos.precio_usd,
    cantidad: datos.cantidad || 1,
    pendiente_aprobacion: true,
    creado_via: 'whatsapp',
    notas: notaClienteAmbiguo,
  })
}
