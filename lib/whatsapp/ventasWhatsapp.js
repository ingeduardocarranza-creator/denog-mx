// Registro de ventas por WhatsApp con preaprobación. Ver
// claude/ventas-whatsapp-preaprobacion-diseno.md (proyecto "Sitio web Denog")
// para el diseño completo — este módulo es la pieza de negocio; el webhook
// solo decide CUÁNDO llamarlo.
//
// Flujo: Eduardo reenvía desde su número personal, en dos mensajes
// separados, lo que se vende en el grupo "compras del día":
//   Mensaje 1 (foto): el caption trae el precio de venta en pesos (MXN).
//   Mensaje 2 (texto): cliente, costo en USD, piezas, talla si aplica.
//
// Cada mensaje se procesa solo. El mensaje 1 crea un borrador en `pedidos`
// (pendiente_aprobacion = true, cliente_id = null). El mensaje 2 busca el
// borrador más antiguo sin completar del mismo número (FIFO) y lo llena. Si
// no hay borrador que emparejar, crea uno nuevo sin foto — nunca se descarta
// información, todo queda visible en "Por aprobar" (Encargos/Pedidos) para
// completarse a mano si algo no amarró.
//
// Esta IA solo propone: nunca aprueba, nunca borra, nunca decide la venta
// por sí misma — eso es siempre de una persona, en el panel.
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

// ─── Mensaje 1: foto con precio en pesos ───────────────────────────────────
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

// ─── Mensaje 2: texto con cliente / costo / piezas / talla ─────────────────
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

// ─── Orquestación: une mensaje 1 y mensaje 2 ───────────────────────────────
const DESCRIPCION_SIN_FOTO = '(sin foto — completar a mano)'

export async function procesarMensajeVentaFoto(supabase, { pathImagen, imagenUrlFirmada, caption }) {
  const datos = await extraerDeFoto({ imagenUrl: imagenUrlFirmada, caption })
  await supabase.from('pedidos').insert({
    descripcion: datos.descripcion || '(sin descripción — revisar foto)',
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

  // Borrador más antiguo de este flujo que todavía no tiene cliente asignado
  // — es la señal de "llegó la foto, falta el texto que la complete".
  const { data: borrador } = await supabase
    .from('pedidos')
    .select('id, descripcion')
    .eq('creado_via', 'whatsapp')
    .eq('pendiente_aprobacion', true)
    .is('cliente_id', null)
    .neq('descripcion', DESCRIPCION_SIN_FOTO)
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  const notaClienteAmbiguo = datos.cliente_nombre && !cliente_id
    ? `Cliente detectado por WhatsApp, sin coincidencia exacta: "${datos.cliente_nombre}"`
    : null

  if (borrador) {
    const descripcionFinal = datos.talla
      ? `${borrador.descripcion} — talla ${datos.talla}`
      : borrador.descripcion
    await supabase.from('pedidos').update({
      cliente_id,
      precio_usd: datos.precio_usd,
      cantidad: datos.cantidad || 1,
      descripcion: descripcionFinal,
      notas: notaClienteAmbiguo,
    }).eq('id', borrador.id)
    return
  }

  // No hay borrador que emparejar (llegó fuera de orden, o se perdió la
  // foto) — se crea igual, sin imagen, para no perder el dato.
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
