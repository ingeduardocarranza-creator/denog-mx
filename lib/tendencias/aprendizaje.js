import { normalizarDescripcion } from './comun'

// ---------------------------------------------------------------------------
// El puntaje aprende de lo que publicas.
//
// Cada oferta o viral que compartes desde Tendencias queda marcada como
// publicada. Cuando un cliente pide por WhatsApp contestando a esa foto, el
// pedido trae el texto de la foto y se cruza con la oferta (función SQL
// tendencias_resultados). Con eso se sabe, por tipo de producto, familia,
// tienda, rango de precio y origen (ofertas / Instagram), qué tanto de lo que
// publicas se vende.
//
// Para no sacar conclusiones con 2 publicaciones, cada grupo empieza "pegado"
// al promedio general y se va despegando conforme junta publicaciones
// (suavizado: como si cada grupo ya trajera PRIOR publicaciones promedio).
// ---------------------------------------------------------------------------

const PRIOR = 4
const MIN_RAZON = 3          // publicaciones mínimas para explicarlo en la tarjeta
const PESOS = { tipo: 14, familia: 5, tienda: 4, rango: 4, origen: 3 }
const TOPE_OTROS = 10       // familia + tienda + precio + origen juntos no mueven más de ±10

export function rangoPrecio(usd) {
  const n = Number(usd)
  if (!n) return 'sin precio'
  if (n < 5) return 'menos de US$5'
  if (n < 10) return 'US$5–10'
  if (n < 20) return 'US$10–20'
  if (n < 35) return 'US$20–35'
  return 'US$35 o más'
}
const origen = (o) => o.fuente === 'instagram' ? 'Instagram' : 'ofertas'

// publicadas: ofertas con publicado=true (id, nombre, tipo, familia, tienda, fuente, precio_usd, publicado_en, creado_en)
// ventasPorId: Map(oferta_id → { pedidos, utilidad })
// demanda (opcional): Map(tipo → { pedidas, agotadas }) de lib/tendencias/solicitudes.js
export function aprendizajeDe(publicadas, ventasPorId, demanda = null) {
  const total = publicadas.length
  const conVenta = publicadas.filter(o => ventasPorId.has(o.id)).length
  // Antes de tener datos, se supone que 1 de cada 6 publicaciones vende.
  const base = total >= 20 ? Math.max(0.03, conVenta / total) : 1 / 6
  const grupos = { tipo: new Map(), familia: new Map(), tienda: new Map(), rango: new Map(), origen: new Map() }
  const llaves = (o) => ({ tipo: o.tipo?.toLowerCase(), familia: o.familia, tienda: o.tienda, rango: rangoPrecio(o.precio_usd), origen: origen(o) })
  const recientes = new Map()
  for (const o of publicadas) {
    const vendio = ventasPorId.has(o.id)
    for (const [g, k] of Object.entries(llaves(o))) {
      if (!k) continue
      const x = grupos[g].get(k) || { pub: 0, venta: 0 }
      x.pub++; if (vendio) x.venta++
      grupos[g].set(k, x)
    }
    const n = normalizarDescripcion(o.nombre || '')
    const f = o.publicado_en || o.creado_en
    const prev = recientes.get(n)
    if (n && (!prev || f > prev.fecha)) recientes.set(n, { fecha: f, pedidos: ventasPorId.get(o.id)?.pedidos || 0 })
  }
  return { total, conVenta, base, grupos, recientes, llaves, demanda }
}

const tasa = (x, base) => (x.venta + PRIOR * base) / (x.pub + PRIOR)

// Cuánto sube o baja el puntaje de una oferta por lo aprendido, y por qué.
export function ajusteAprendido(o, ap) {
  if (!ap) return { delta: 0, razones: [] }
  let deltaTipo = 0, deltaOtros = 0
  const razones = []
  const k = ap.llaves(o)
  for (const [g, peso] of Object.entries(PESOS)) {
    const x = k[g] && ap.grupos[g].get(k[g])
    if (!x) continue
    const lift = tasa(x, ap.base) / ap.base
    const d = Math.max(-peso, Math.min(peso, Math.log2(lift) * peso))
    if (g === 'tipo') deltaTipo = d; else deltaOtros += d
    if (g === 'tipo' && x.pub >= MIN_RAZON) {
      if (x.venta === 0 && x.pub >= 4) razones.push(`publicaste ${x.pub} de ${o.tipo.toLowerCase()} y no se vendió ninguno`)
      else if (lift >= 1.4) razones.push(`de lo que publicas de ${o.tipo.toLowerCase()} se vende ${x.venta} de ${x.pub}`)
    }
  }
  let delta = deltaTipo + Math.max(-TOPE_OTROS, Math.min(TOPE_OTROS, deltaOtros))
  // Lo que los clientes piden por WhatsApp (de todo lo que publicas).
  const d = o.tipo && ap.demanda?.get(o.tipo.toLowerCase())
  if (d && d.pedidas >= 3) {
    delta += Math.min(10, Math.round(Math.log2(d.pedidas) * 2.5))
    razones.push(`te piden ${o.tipo.toLowerCase()}: ${d.pedidas} en 30 días`)
    if (d.agotadas >= 2) { delta += 4; razones.push(`se te agotó ${d.agotadas} veces`) }
  }
  // ¿Ya lo publicaste hace poco?
  const r = ap.recientes.get(normalizarDescripcion(o.nombre || ''))
  if (r && !o.publicado) {
    const dias = Math.floor((Date.now() - new Date(r.fecha).getTime()) / 86400000)
    if (dias <= 10) {
      if (r.pedidos > 0) { delta += 4; razones.push(`ya lo publicaste hace ${dias || 'menos de 1'} día${dias === 1 ? '' : 's'} y se vendió: repítelo`) }
      else { delta -= 12; razones.push(`ya lo publicaste hace ${dias || 'menos de 1'} día${dias === 1 ? '' : 's'} y no se vendió`) }
    }
  }
  return { delta: Math.round(delta), razones }
}
