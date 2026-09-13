// Cliente de la API de Skydropx PRO para autollenar paquetería y número de
// guía a partir del ID de envío que ya se generó allá (Fase 2 de envíos
// foráneos, pedida por Lalo). Solo consulta -- nunca crea ni modifica envíos
// en Skydropx.
//
// Credenciales: SKYDROPX_CLIENT_ID / SKYDROPX_CLIENT_SECRET, solo como
// variables de entorno en Vercel. Nunca van en el código ni en documentos.
//
// Auth: OAuth client_credentials contra /api/v1/oauth/token, token Bearer
// válido ~2h. Consulta de envío: GET /api/v1/shipments/{id}.
const BASE = 'https://api-pro.skydropx.com'

let tokenCache = { token: null, expiraEn: 0 }

async function obtenerToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiraEn) return tokenCache.token

  const clientId = process.env.SKYDROPX_CLIENT_ID
  const clientSecret = process.env.SKYDROPX_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Falta configurar SKYDROPX_CLIENT_ID / SKYDROPX_CLIENT_SECRET en el servidor.')
  }

  const res = await fetch(`${BASE}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) throw new Error('No se pudo autenticar con Skydropx.')
  const data = await res.json()
  if (!data?.access_token) throw new Error('Skydropx no regresó un token válido.')

  // Margen de 60s para no usarlo justo cuando esté por expirar.
  tokenCache = { token: data.access_token, expiraEn: Date.now() + (Number(data.expires_in || 7200) - 60) * 1000 }
  return tokenCache.token
}

// Dado el ID de envío en Skydropx, regresa { numero_guia, paqueteria } si el
// envío ya tiene una guía generada. Lanza error con mensaje claro si no.
export async function obtenerGuiaSkydropx(shipmentId) {
  const token = await obtenerToken()
  const res = await fetch(`${BASE}/api/v1/shipments/${encodeURIComponent(shipmentId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (res.status === 404) throw new Error('No se encontró ese envío en Skydropx.')
  if (!res.ok) throw new Error('Skydropx no respondió correctamente.')

  const data = await res.json()
  const attrs = data?.data?.attributes || {}
  const numeroGuia = attrs.tracking_number || null
  const paqueteria = attrs.carrier_name || attrs.provider || ''
  if (!numeroGuia) throw new Error('Ese envío en Skydropx todavía no tiene número de guía.')

  return { numero_guia: numeroGuia, paqueteria }
}
