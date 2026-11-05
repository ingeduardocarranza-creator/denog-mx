// Empaque de MercadoLibre (solo servidor): qué paquetes puede empacar el
// colaborador, qué escanear y cómo se verifica.
//
// Un "paquete" es un envío de MercadoLibre (puede juntar varias órdenes).
// Solo se muestran a los colaboradores los paquetes cuyos productos ya están
// aquí (apartados del catálogo o ya llegados de Nogales). Nunca se les manda
// precios, clientes ni códigos de barras: la verificación se hace en el servidor.

import { fechaLimite, diasRestantes } from './fechas'

const LISTOS = ['reservado', 'disponible']

export const canon = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')

const TZ = 'America/Hermosillo'
const diaLocal = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ })
export const inicioDeHoy = () => new Date(`${diaLocal(new Date())}T00:00:00-07:00`)

function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
}
function diaTexto(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', timeZone: TZ })
}

// Mensajes en lenguaje sencillo con su color.
export function mensajeEtiqueta(p) {
  const limite = p.limite
  const faltan = limite ? diasRestantes(limite.dia) : null
  const fecha = limite ? new Date(`${limite.dia}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : null
  let plazo = ''
  if (faltan != null) {
    if (faltan < 0) plazo = ` Ya pasó la fecha límite (${fecha}). Despácha este paquete hoy.`
    else if (faltan === 0) plazo = limite.hora ? ` Despacha hoy antes de las ${hora(limite.hora)}.` : ' Despacha hoy.'
    else if (faltan === 1) plazo = ' Tienes hasta mañana para despacharlo.'
    else plazo = ` Tienes hasta el ${fecha} para despacharlo.`
  }
  if (p.etiqueta_lista) {
    if (faltan != null && faltan <= 0) return { color: 'rojo', texto: `Etiqueta lista: imprímela y pégala.${plazo}` }
    return { color: 'verde', texto: `Etiqueta lista. Imprímela y pégala.${plazo}` }
  }
  if (p.etiqueta_disponible_en) {
    return { color: 'amarillo', texto: `La etiqueta todavía no está lista. Estará disponible el ${diaTexto(p.etiqueta_disponible_en)}. Ve preparando el producto.${plazo}` }
  }
  return { color: 'amarillo', texto: `La etiqueta todavía no está lista. Normalmente aparece en unos minutos. Ve preparando el producto.${plazo}` }
}

// Todos los paquetes pendientes de empacar, ya agrupados y ordenados
// (urgentes primero, luego por fecha límite y por antigüedad).
export async function cargarPaquetes(supabase) {
  const { data: ventas, error } = await supabase.from('ml_ventas')
    .select('id, order_id, pack_id, shipment_id, paquete, fecha_venta, limite_despacho, etiqueta_lista, etiqueta_disponible_en, tipo_logistica, items:ml_venta_items(id, item_id, variacion_id, titulo, miniatura, cantidad, estado, cantidad_escaneada, urgente, dias_prometidos)')
    .eq('empaque_estado', 'pendiente')
    .or('tipo_logistica.is.null,tipo_logistica.neq.fulfillment')
  if (error) throw new Error(error.message)

  const mapa = new Map()
  for (const v of ventas || []) {
    const p = mapa.get(v.paquete) || {
      paquete: v.paquete, shipment_id: v.shipment_id, pack_id: v.pack_id, orden_ids: [],
      limite_despacho: null, etiqueta_lista: false, etiqueta_disponible_en: null,
      fecha_venta: v.fecha_venta, items: [],
    }
    p.orden_ids.push(v.order_id)
    if (v.limite_despacho && (!p.limite_despacho || v.limite_despacho < p.limite_despacho)) p.limite_despacho = v.limite_despacho
    p.etiqueta_lista = p.etiqueta_lista || v.etiqueta_lista
    if (v.etiqueta_disponible_en) p.etiqueta_disponible_en = v.etiqueta_disponible_en
    if (v.fecha_venta && (!p.fecha_venta || v.fecha_venta < p.fecha_venta)) p.fecha_venta = v.fecha_venta
    p.items.push(...(v.items || []))
    mapa.set(v.paquete, p)
  }
  const lista = [...mapa.values()].map(p => {
    // Límite: el de MercadoLibre o venta + el mayor de los días prometidos... el más corto manda.
    const dias = p.items.map(i => i.dias_prometidos).filter(d => d > 0)
    const limite = fechaLimite({ limite_despacho: p.limite_despacho, fecha_venta: p.fecha_venta }, dias.length ? Math.min(...dias) : null)
    return {
      ...p,
      limite,
      listo: p.items.length > 0 && p.items.every(i => LISTOS.includes(i.estado)),
      urgente_hoy: Boolean(limite) && diasRestantes(limite.dia) <= 0,
    }
  })
  lista.sort((a, b) =>
    String(a.limite?.dia || '9999').localeCompare(String(b.limite?.dia || '9999')) ||
    String(a.fecha_venta || '').localeCompare(String(b.fecha_venta || '')))
  return lista
}

// Lo que ve el colaborador de un paquete (sin precios ni códigos).
export function vistaPaquete(p) {
  const items = p.items.map(i => ({
    id: i.id, titulo: i.titulo, miniatura: i.miniatura, cantidad: i.cantidad, escaneadas: i.cantidad_escaneada,
  }))
  return {
    paquete: p.paquete,
    items,
    todo_escaneado: items.length > 0 && items.every(i => i.escaneadas >= i.cantidad),
    etiqueta_lista: p.etiqueta_lista,
    urgente_hoy: p.urgente_hoy,
    limite: p.limite,
    mensaje: mensajeEtiqueta(p),
  }
}

// Códigos aceptados por cada producto del paquete: el del catálogo (si está
// ligado), el SKU/GTIN de la publicación y los aprendidos con confirmación.
export async function codigosAceptados(supabase, items) {
  const salida = new Map(items.map(i => [i.id, new Set()]))
  const itemIds = [...new Set(items.map(i => i.item_id))]
  const productoIds = [...new Set(items.map(i => i.producto_id).filter(Boolean))]

  const [{ data: productos }, { data: pubs }, { data: aprendidos }] = await Promise.all([
    productoIds.length ? supabase.from('productos_tienda').select('id, codigo_barras').in('id', productoIds) : { data: [] },
    itemIds.length ? supabase.from('ml_publicaciones').select('item_id, variacion_id, sku, gtin').in('item_id', itemIds) : { data: [] },
    itemIds.length ? supabase.from('ml_codigos_producto').select('item_id, variacion_id, codigo').in('item_id', itemIds) : { data: [] },
  ])

  for (const i of items) {
    const set = salida.get(i.id)
    const agregar = (c) => { const k = canon(c); if (k) set.add(k) }
    agregar(i.sku)
    agregar((productos || []).find(p => p.id === i.producto_id)?.codigo_barras)
    for (const p of pubs || []) {
      if (p.item_id === i.item_id && Number(p.variacion_id) === Number(i.variacion_id)) { agregar(p.sku); agregar(p.gtin) }
    }
    for (const a of aprendidos || []) {
      if (a.item_id === i.item_id && Number(a.variacion_id) === Number(i.variacion_id)) agregar(a.codigo)
    }
  }
  return salida
}
