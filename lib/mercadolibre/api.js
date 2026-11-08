// Cliente mínimo de la API de MercadoLibre México (solo servidor).
//
// Variables de entorno (.env.local y Vercel):
//   ML_CLIENT_ID       → "App ID" de tu aplicación en developers.mercadolibre.com.mx
//   ML_CLIENT_SECRET   → "Clave secreta" de esa aplicación
//   ML_REDIRECT_URI    → (opcional) debe ser IDÉNTICA a la registrada en la app.
//                        Si no existe se usa  <dominio>/api/mercadolibre/callback
//
// El token de acceso dura 6 horas; el refresh_token se usa una sola vez, así
// que cada vez que se renueva se guarda el nuevo.

import { createClient } from '@supabase/supabase-js'

const API = 'https://api.mercadolibre.com'
const AUTH = 'https://auth.mercadolibre.com.mx/authorization'

export function clienteSupabaseServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export function mlConfigurado() {
  return Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET)
}

export function urlRedireccion(req) {
  if (process.env.ML_REDIRECT_URI) return process.env.ML_REDIRECT_URI
  return `${new URL(req.url).origin}/api/mercadolibre/callback`
}

export function urlAutorizacion(req, state) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID,
    redirect_uri: urlRedireccion(req),
    state,
  })
  return `${AUTH}?${p.toString()}`
}

async function pedirToken(cuerpo) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      ...cuerpo,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.message || data.error_description || data.error || `MercadoLibre respondió ${res.status}`)
  }
  return data
}

export function intercambiarCodigo(code, redirectUri) {
  return pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
}

export async function guardarTokens(supabase, tokens, extra = {}) {
  const fila = {
    id: 1,
    ml_user_id: tokens.user_id ?? undefined,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expira_en: new Date(Date.now() + (tokens.expires_in || 21600) * 1000).toISOString(),
    ...extra,
  }
  Object.keys(fila).forEach(k => fila[k] === undefined && delete fila[k])
  const { error } = await supabase.from('ml_conexion').upsert(fila, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

// Devuelve un access_token vigente (renovándolo si está por vencer) y el
// user_id de la cuenta. Lanza un error legible si todavía no se ha conectado.
export async function obtenerAcceso(supabase) {
  const { data: con, error } = await supabase.from('ml_conexion').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!con || !con.refresh_token) throw new Error('Todavía no está conectada la cuenta de MercadoLibre.')

  const vigente = con.access_token && con.expira_en && new Date(con.expira_en).getTime() - Date.now() > 120000
  if (vigente) return { token: con.access_token, userId: con.ml_user_id }

  const nuevo = await pedirToken({ grant_type: 'refresh_token', refresh_token: con.refresh_token })
  await guardarTokens(supabase, nuevo)
  return { token: nuevo.access_token, userId: con.ml_user_id || nuevo.user_id }
}

export async function mlGet(token, ruta, params = {}, cabeceras = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API}${ruta}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json', ...cabeceras },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `MercadoLibre respondió ${res.status} en ${ruta}`)
  return data
}

// ── Publicaciones ──────────────────────────────────────────────────────────

// Todos los ids de publicaciones del vendedor (cualquier estado).
export async function listarIdsPublicaciones(token, userId) {
  const ids = []
  let scrollId = null
  for (let i = 0; i < 50; i++) {
    const params = { search_type: 'scan', limit: '100' }
    if (scrollId) params.scroll_id = scrollId
    const r = await mlGet(token, `/users/${userId}/items/search`, params)
    const lote = r.results || []
    ids.push(...lote)
    scrollId = r.scroll_id
    if (!lote.length || !scrollId) break
  }
  return ids
}

// Detalle de las publicaciones, de 20 en 20 (el máximo de MercadoLibre).
export async function detallePublicaciones(token, ids) {
  const campos = 'id,title,price,available_quantity,status,seller_custom_field,attributes,variations,sale_terms,thumbnail,permalink,shipping,sub_status,tags,channels,date_created,last_updated'
  const salida = []
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20)
    const r = await mlGet(token, '/items', { ids: lote.join(','), attributes: campos })
    for (const x of r) if (x.code === 200 && x.body) salida.push(x.body)
  }
  return salida
}

// Productos creados desde Mercado Pago (canales "mp-link", "mp-merchants":
// catálogo de cobros / link de pago), NO son publicaciones de MercadoLibre:
// no salen en el panel de vendedor, no tienen página pública y no generan
// ventas ni envíos de MercadoLibre. Aparecen en la API porque comparten cuenta.
export function esMercadoPago(item) {
  const canales = item.channels || []
  return canales.length > 0 && !canales.includes('marketplace') && !canales.includes('mshops')
}

function valorAtributo(attrs, id) {
  const a = (attrs || []).find(x => x.id === id)
  const v = a?.value_name ?? a?.values?.[0]?.name
  return v ? String(v).trim() : null
}

// "Disponibilidad de stock" de la publicación (los 15 días): viene como
// término de venta MANUFACTURING_TIME.
function diasPreparacion(item) {
  const t = (item.sale_terms || []).find(x => x.id === 'MANUFACTURING_TIME')
  if (!t) return null
  const n = t.value_struct?.number ?? parseInt(String(t.value_name || '').replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// Una publicación puede traer variantes con SKU propio: cada una es su fila.
export function filasDePublicacion(item) {
  const base = {
    item_id: item.id,
    titulo: item.title,
    estado_ml: item.status,
    creada_en: item.date_created || null,
    actualizada_en: item.last_updated || null,
    sub_estado: (item.sub_status || []).join(',') || null,
    etiquetas: (item.tags || []).join(',') || null,
    canales: (item.channels || []).join(',') || null,
    tiempo_preparacion: diasPreparacion(item),
    tipo_envio: item.shipping?.logistic_type || null,
    // Las fotos de MercadoLibre vienen con http://; el navegador las bloquea en una página https.
    miniatura: item.thumbnail ? String(item.thumbnail).replace(/^http:\/\//, 'https://') : null,
    enlace: item.permalink || null,
  }
  if (Array.isArray(item.variations) && item.variations.length > 0) {
    return item.variations.map(v => ({
      ...base,
      variacion_id: v.id,
      sku: (v.seller_custom_field || valorAtributo(v.attributes, 'SELLER_SKU') || '').trim() || null,
      gtin: valorAtributo(v.attributes, 'GTIN'),
      precio: v.price ?? item.price,
      stock_ml: v.available_quantity ?? null,
    }))
  }
  return [{
    ...base,
    variacion_id: 0,
    sku: (item.seller_custom_field || valorAtributo(item.attributes, 'SELLER_SKU') || '').trim() || null,
    gtin: valorAtributo(item.attributes, 'GTIN'),
    precio: item.price,
    stock_ml: item.available_quantity ?? null,
  }]
}

export const normalizarCodigo = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '')

// Decide con qué producto del catálogo se liga una fila, por SKU (y GTIN como
// respaldo). `indice` es un Map código-normalizado → [productos].
// Si no está en el catálogo NO es un error: el negocio compra bajo pedido
// (se compra cuando se vende), así que queda como 'bajo_pedido'.
export function ligarPorSku(fila, indice) {
  const sku = normalizarCodigo(fila.sku)
  const gtin = normalizarCodigo(fila.gtin)
  if (!sku && !gtin) return { liga_estado: 'bajo_pedido', producto_id: null }
  for (const codigo of [sku, gtin]) {
    if (!codigo) continue
    const candidatos = indice.get(codigo)
    if (candidatos?.length === 1) return { liga_estado: 'ligada', producto_id: candidatos[0].id }
    if (candidatos?.length > 1) return { liga_estado: 'ambigua', producto_id: null }
  }
  return { liga_estado: 'bajo_pedido', producto_id: null }
}

// ── Cambios en publicaciones (escritura) ───────────────────────────────────

export async function mlPut(token, ruta, cuerpo) {
  const res = await fetch(`${API}${ruta}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const causa = (data.cause || []).map(c => c.message || c.code).filter(Boolean).join('; ')
    throw new Error([data.message || data.error || `MercadoLibre respondió ${res.status}`, causa].filter(Boolean).join(' — '))
  }
  return data
}

// Arma el arreglo sale_terms para poner los días de entrega
// ("tiempo de disponibilidad de stock", MANUFACTURING_TIME) SIN perder los
// otros términos que ya tenga la publicación (garantía, etc.): se reenvían
// los que ya existen y se reemplaza solo el de días.
export function saleTermsConDias(actuales, dias) {
  const otros = (actuales || [])
    .filter(t => t.id !== 'MANUFACTURING_TIME')
    .map(t => ({
      id: t.id,
      ...(t.value_id ? { value_id: t.value_id } : {}),
      ...(t.value_name ? { value_name: t.value_name } : {}),
      ...(t.value_struct ? { value_struct: t.value_struct } : {}),
    }))
  return [...otros, { id: 'MANUFACTURING_TIME', value_name: `${dias} días` }]
}

// ── Crear (POST) ───────────────────────────────────────────────────────────

export async function mlPost(token, ruta, cuerpo) {
  const res = await fetch(`${API}${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const causas = (data.cause || []).filter(c => c.type !== 'warning').map(c => c.message || c.code).filter(Boolean)
    const e = new Error([data.message || data.error || `MercadoLibre respondió ${res.status}`, ...causas].join(' — '))
    e.detalle = data
    throw e
  }
  return data
}
