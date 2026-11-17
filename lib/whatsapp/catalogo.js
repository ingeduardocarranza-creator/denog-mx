// Sincroniza los productos de denog.mx con el catálogo de WhatsApp
// ("Denog Catálogo" en Commerce Manager) usando la Catalog Batch API de Meta.
//
// Reglas (elegidas por Eduardo el 17 nov 2026):
//  - SUBEN todos los productos activos, con stock, ya aprobados, con precio y
//    con foto en un formato que Meta acepta.
//  - BAJAN solos: cuando un producto se agota, se desactiva, se pausa o le
//    quitan la foto, se borra del catálogo de WhatsApp.
//  - Solo se manda lo que cambió (huella del contenido en whatsapp_catalogo_items).
//
// Variables de entorno (Vercel):
//   WHATSAPP_CATALOGO_TOKEN → token del usuario del sistema "Sistema Denog" con
//                             el permiso catalog_management. Si falta, usa
//                             WHATSAPP_TOKEN (que no trae ese permiso).
//   WHATSAPP_CATALOGO_ID    → ID del catálogo en Commerce Manager.

import crypto from 'node:crypto'

const GRAPH = 'https://graph.facebook.com/v23.0'
const SITIO = 'https://www.denog.mx'
const LOTE = 400

// Meta acepta JPEG y PNG de forma segura. WebP y AVIF se omiten salvo que se
// active WHATSAPP_CATALOGO_WEBP=1 después de comprobar que Meta los acepta.
const esAvif = (url) => /\.avif$/.test(String(url || '').split('?')[0].toLowerCase())

// Meta no acepta AVIF: esas fotos se sirven convertidas a JPG desde
// /api/whatsapp/catalogo/foto/[id] (ver esa ruta).
function formatoValido(url) {
  if (!url) return false
  const limpia = String(url).split('?')[0].toLowerCase()
  if (/\.(jpe?g|png)$/.test(limpia)) return true
  if (esAvif(limpia)) return true
  if (process.env.WHATSAPP_CATALOGO_WEBP === '1' && /\.webp$/.test(limpia)) return true
  return false
}

// Mismo criterio que Marketplace: los suplementos no se suben.
const SUPLEMENTO = /(suplement|vitamin|protein|creatin|collagen|colageno|gummies|omega|melatonin)/i
// Suplementos aprobados a mano (17-nov-2026). Los 2 primeros (166, 171) fueron la
// prueba y Meta los aceptó. Siguen fuera: melatoninas, berberine (pérdida de peso)
// y PMS (promesas de salud), que Meta suele restringir.
const SUPLEMENTOS_PRUEBA = new Set([166, 171, 159, 167, 168, 169, 170, 173, 433, 436])

export function catalogoConfigurado() {
  return Boolean(process.env.WHATSAPP_CATALOGO_ID && (process.env.WHATSAPP_CATALOGO_TOKEN || process.env.WHATSAPP_TOKEN))
}

const retailerId = (p) => `denog-${p.id}`

function aItem(p, conjunto) {
  const precio = Number(p.precio_venta) || 0
  const enMercadito = p.mostrar_en_mercadito === true
  return {
    id: retailerId(p),
    title: String(p.nombre || '').trim().slice(0, 200),
    description: String(p.descripcion || '').trim().slice(0, 5000) || String(p.nombre || '').trim(),
    availability: 'in stock',
    condition: 'new',
    price: `${precio.toFixed(2)} MXN`,
    link: enMercadito ? `${SITIO}/mercadito/producto/${p.id}` : SITIO,
    image_link: esAvif(p.imagen_url)
      ? `${SITIO}/api/whatsapp/catalogo/foto/${p.id}.jpg?v=${crypto.createHash('sha1').update(String(p.imagen_url)).digest('hex').slice(0, 8)}`
      : p.imagen_url,
    brand: 'Denog',
    ...(conjunto ? { custom_label_0: conjunto } : {}),
    ...(p.grupo_id ? { item_group_id: `denog-${p.grupo_id}` } : {}),
  }
}

const huellaDe = (item) => crypto.createHash('sha1').update(JSON.stringify(item)).digest('hex')

// Qué productos deben estar arriba hoy.
export async function leerElegibles(supabase) {
  const { data, error } = await supabase
    .from('productos_tienda')
    .select('id, nombre, descripcion, precio_venta, stock, imagen_url, categoria, grupo_id, mostrar_en_mercadito')
    .eq('activo', true)
    .gt('stock', 0)
    .gt('precio_venta', 0)
    .not('imagen_url', 'is', null)
    .or('pendiente_aprobacion.is.null,pendiente_aprobacion.eq.false')
  if (error) throw new Error(error.message)

  const elegibles = []
  let omitidosFoto = 0
  let omitidosSuplemento = 0
  for (const p of data || []) {
    if (!SUPLEMENTOS_PRUEBA.has(Number(p.id)) && (SUPLEMENTO.test(p.nombre || '') || SUPLEMENTO.test(p.categoria || ''))) { omitidosSuplemento++; continue }
    if (!formatoValido(p.imagen_url)) { omitidosFoto++; continue }
    elegibles.push(p)
  }
  return { elegibles, omitidosFoto, omitidosSuplemento }
}

// ---- Conjuntos de productos (las "categorías" que ve el cliente) ----
// Cada producto lleva custom_label_0 = nombre del conjunto, y en Meta hay un
// conjunto por nombre con el filtro custom_label_0 = nombre. Así se llenan solos.
const MIN_PARA_CONJUNTO = 4
const NOMBRES_CONJUNTO = {
  'articulos de hogar': 'Artículos de hogar',
  'tazas y termos': 'Tazas y termos',
  'ropa': 'Ropa',
  'comida / snacks': 'Comida y snacks',
  'cuidado personal': 'Cuidado personal',
  'accesorios': 'Accesorios',
  'electronica': 'Electrónica',
  'juguetes': 'Juguetes',
  'suplementos': 'Suplementos',
  'automotriz': 'Automotriz',
  'papeleria': 'Papelería',
  'articulos deportivos': 'Artículos deportivos',
}
const claveCategoria = (c) =>
  String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

function nombreConjunto(categoria) {
  const k = claveCategoria(categoria)
  if (!k) return 'Otros'
  if (NOMBRES_CONJUNTO[k]) return NOMBRES_CONJUNTO[k]
  const t = k.charAt(0).toUpperCase() + k.slice(1)
  return t
}

// Devuelve Map producto_id → nombre de conjunto. Los conjuntos con menos de
// MIN_PARA_CONJUNTO productos se juntan en "Otros".
function asignarConjuntos(elegibles) {
  const cuenta = new Map()
  for (const p of elegibles) {
    const n = nombreConjunto(p.categoria)
    cuenta.set(n, (cuenta.get(n) || 0) + 1)
  }
  const asignado = new Map()
  for (const p of elegibles) {
    const n = nombreConjunto(p.categoria)
    asignado.set(Number(p.id), (cuenta.get(n) || 0) >= MIN_PARA_CONJUNTO ? n : 'Otros')
  }
  return asignado
}

async function leerConjuntosMeta() {
  const token = process.env.WHATSAPP_CATALOGO_TOKEN || process.env.WHATSAPP_TOKEN
  const url = `${GRAPH}/${process.env.WHATSAPP_CATALOGO_ID}/product_sets?fields=id,name&limit=200&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message || `Meta contestó ${res.status}`)
  return json?.data || []
}

// Crea en Meta los conjuntos que falten. Nunca borra ni edita los que ya existen.
async function asegurarConjuntos(nombres) {
  const existentes = new Set((await leerConjuntosMeta()).map((c) => c.name))
  const creados = []
  for (const nombre of nombres) {
    if (existentes.has(nombre)) continue
    await llamarMeta(`/${process.env.WHATSAPP_CATALOGO_ID}/product_sets`, {
      name: nombre,
      filter: JSON.stringify({ custom_label_0: { eq: nombre } }),
    })
    creados.push(nombre)
  }
  return creados
}

async function llamarMeta(ruta, cuerpo) {
  const token = process.env.WHATSAPP_CATALOGO_TOKEN || process.env.WHATSAPP_TOKEN
  const res = await fetch(`${GRAPH}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cuerpo, access_token: token }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const e = new Error(json?.error?.message || `Meta contestó ${res.status}`)
    e.metaError = json?.error || null
    throw e
  }
  return json
}

async function estadoLote(handle) {
  const token = process.env.WHATSAPP_CATALOGO_TOKEN || process.env.WHATSAPP_TOKEN
  const url = `${GRAPH}/${process.env.WHATSAPP_CATALOGO_ID}/check_batch_request_status?handle=${encodeURIComponent(handle)}&load_ids_of_invalid_requests=true&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url)
  return res.json().catch(() => null)
}

// Manda un lote y espera (poco) a que Meta lo procese. Devuelve los
// retailer_id que Meta rechazó, si alcanzó a decirlo.
async function enviarLote(requests) {
  const r = await llamarMeta(`/${process.env.WHATSAPP_CATALOGO_ID}/items_batch`, {
    item_type: 'PRODUCT_ITEM',
    allow_upsert: true,
    requests,
  })
  const handle = r?.handles?.[0]
  const rechazados = new Map()
  if (!handle) return { handle: null, rechazados }
  for (let i = 0; i < 5; i++) {
    await new Promise((ok) => setTimeout(ok, 2000))
    const s = await estadoLote(handle)
    const d = s?.data?.[0]
    if (!d) continue
    if (d.status === 'finished') {
      for (const id of d.ids_of_invalid_requests || []) rechazados.set(String(id), 'Meta rechazó el producto')
      for (const e of d.errors || []) if (e?.id) rechazados.set(String(e.id), e.message || 'Meta rechazó el producto')
      break
    }
  }
  return { handle, rechazados }
}

const trozos = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

// opciones.simular = true → solo calcula qué haría, sin llamar a Meta ni
// escribir en la base.
export async function sincronizarCatalogo(supabase, { simular = false, origen = 'cron' } = {}) {
  const { elegibles, omitidosFoto, omitidosSuplemento } = await leerElegibles(supabase)

  const { data: filas, error } = await supabase.from('whatsapp_catalogo_items').select('*')
  if (error) throw new Error(error.message)
  const registrados = new Map((filas || []).map((f) => [Number(f.producto_id), f]))

  const conjuntoDe = asignarConjuntos(elegibles)
  const nombresConjuntos = [...new Set(conjuntoDe.values())].sort()
  const aSubir = []
  let sinCambio = 0
  const idsElegibles = new Set()
  for (const p of elegibles) {
    idsElegibles.add(Number(p.id))
    const item = aItem(p, conjuntoDe.get(Number(p.id)))
    const huella = huellaDe(item)
    const previo = registrados.get(Number(p.id))
    if (previo && previo.estado === 'subido' && previo.huella === huella) { sinCambio++; continue }
    aSubir.push({ p, item, huella })
  }
  const aBajar = (filas || []).filter((f) => f.estado === 'subido' && !idsElegibles.has(Number(f.producto_id)))

  const resumen = {
    elegibles: elegibles.length,
    porSubir: aSubir.length,
    porBajar: aBajar.length,
    sinCambio,
    omitidosFoto,
    omitidosSuplemento,
    conjuntos: nombresConjuntos.length,
  }
  if (simular) {
    return { ok: true, simulacion: true, ...resumen, ejemplo: aSubir.slice(0, 3).map((x) => x.item) }
  }
  if (!catalogoConfigurado()) throw new Error('Falta WHATSAPP_CATALOGO_ID o WHATSAPP_CATALOGO_TOKEN')

  const ahora = new Date().toISOString()
  let subidos = 0, bajados = 0, errores = 0
  const detalle = []

  for (const lote of trozos(aSubir, LOTE)) {
    const requests = lote.map((x) => ({ method: 'UPDATE', data: x.item }))
    try {
      const { rechazados } = await enviarLote(requests)
      const filasNuevas = lote.map((x) => {
        const motivo = rechazados.get(x.item.id)
        if (motivo) { errores++; detalle.push(`${x.item.id}: ${motivo}`) } else subidos++
        return {
          producto_id: x.p.id,
          retailer_id: x.item.id,
          huella: x.huella,
          estado: motivo ? 'error' : 'subido',
          error: motivo || null,
          subido_en: motivo ? null : ahora,
          actualizado_en: ahora,
        }
      })
      await supabase.from('whatsapp_catalogo_items').upsert(filasNuevas, { onConflict: 'producto_id' })
    } catch (e) {
      errores += lote.length
      detalle.push(`lote de ${lote.length}: ${e.message}`)
    }
  }

  for (const lote of trozos(aBajar, LOTE)) {
    const requests = lote.map((f) => ({ method: 'DELETE', data: { id: f.retailer_id } }))
    try {
      await enviarLote(requests)
      bajados += lote.length
      await supabase.from('whatsapp_catalogo_items').upsert(
        lote.map((f) => ({ ...f, estado: 'bajado', error: null, actualizado_en: ahora })),
        { onConflict: 'producto_id' }
      )
    } catch (e) {
      errores += lote.length
      detalle.push(`bajar ${lote.length}: ${e.message}`)
    }
  }

  let conjuntosCreados = []
  try {
    conjuntosCreados = await asegurarConjuntos(nombresConjuntos)
  } catch (e) {
    errores++
    detalle.push(`conjuntos: ${e.message}`)
  }

  await supabase.from('whatsapp_catalogo_corridas').insert({
    origen,
    elegibles: elegibles.length,
    subidos,
    bajados,
    sin_cambio: sinCambio,
    omitidos_foto: omitidosFoto,
    errores,
    detalle: detalle.slice(0, 20).join('\n') || null,
  })

  return { ok: errores === 0, ...resumen, subidos, bajados, errores, conjuntosCreados, detalle: detalle.slice(0, 10) }
}
