import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { traerTodo } from '@/lib/traerTodo'
import { normalizarDescripcion, descripcionUtil, TEMPORADAS, FAMILIAS } from '@/lib/tendencias/comun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const LOTE = 80

// POST /api/tendencias/etiquetar — etiqueta el siguiente lote de productos
// que todavía no tienen tipo/marca/temporada. La pantalla lo llama en ciclo
// hasta que "faltan" llega a 0. Solo toca producto_etiquetas, nunca pedidos.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  try {
    const [pedidos, hechas] = await Promise.all([
      traerTodo((a, b) => supabase.from('pedidos').select('descripcion, lugar_compra').range(a, b)),
      traerTodo((a, b) => supabase.from('producto_etiquetas').select('descripcion_norm').range(a, b)),
    ])
    const ya = new Set(hechas.map(h => h.descripcion_norm))
    const pendientes = new Map()
    for (const p of pedidos) {
      if (!descripcionUtil(p.descripcion)) continue
      const k = normalizarDescripcion(p.descripcion)
      if (!ya.has(k) && !pendientes.has(k)) pendientes.set(k, { texto: p.descripcion.trim(), tienda: p.lugar_compra || '' })
    }
    const faltanAntes = pendientes.size
    if (faltanAntes === 0) return NextResponse.json({ ok: true, hechos: 0, faltan: 0 })

    const lote = [...pendientes.entries()].slice(0, LOTE)
    const lineas = lote.map(([, v], i) => `${i}\t${v.texto}${v.tienda ? `\t(${v.tienda})` : ''}`).join('\n')

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 9000,
      system: `Clasificas productos que una tienda de Hermosillo, Sonora compra en tiendas de EE.UU. (Ross, Walmart, Costco, Target, Sam's, etc.) y revende por WhatsApp.
Para cada producto devuelve:
- "tipo": tipo de producto genérico y corto en español, sin marca ni talla ni color, en singular, reutilizable entre productos parecidos. Ejemplos: "Body mist", "Loción corporal", "Leggings", "Sudadera", "Colores (lápices)", "Libro para colorear", "Dulces de Halloween", "Café molido", "Figuras de juguete", "Limpiador multiusos", "Tenis", "Bolsa", "Proteína en polvo".
- "marca": la marca si aparece (ej. "Bath & Body Works", "Crayola", "Great Value"), o null.
- "familia": exactamente una de: ${FAMILIAS.join(' | ')}.
- "temporadas": lista con una o más de estas llaves: ${Object.keys(TEMPORADAS).join(', ')}. Usa "todo_el_ano" si no es de temporada. Productos con tema o aroma de temporada (calabaza, esqueletos, Santa, corazones, útiles escolares, mochilas, chamarras, trajes de baño) llevan esa temporada.
Responde SOLO con un arreglo JSON, un objeto por renglón: [{"i":0,"tipo":"...","marca":null,"familia":"...","temporadas":["..."]}]`,
      messages: [{ role: 'user', content: lineas }],
    })

    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    const inicio = raw.indexOf('['), fin = raw.lastIndexOf(']')
    const arr = JSON.parse(raw.slice(inicio, fin + 1))
    const validas = new Set(Object.keys(TEMPORADAS))
    const ahora = new Date().toISOString()
    const filas = []
    for (const r of arr) {
      const item = lote[Number(r.i)]
      if (!item || !r.tipo) continue
      filas.push({
        descripcion_norm: item[0],
        tipo: String(r.tipo).trim().slice(0, 60),
        marca: r.marca ? String(r.marca).trim().slice(0, 60) : null,
        familia: FAMILIAS.includes(r.familia) ? r.familia : 'Otro',
        temporadas: (Array.isArray(r.temporadas) ? r.temporadas : []).filter(t => validas.has(t)),
        etiquetado_en: ahora,
      })
    }
    // Lo que la IA no devolvió se marca como "Otro" para no atorar el ciclo.
    const devueltas = new Set(filas.map(f => f.descripcion_norm))
    for (const [k] of lote) if (!devueltas.has(k)) filas.push({ descripcion_norm: k, tipo: null, marca: null, familia: 'Otro', temporadas: [], etiquetado_en: ahora })

    const { error } = await supabase.from('producto_etiquetas').upsert(filas, { onConflict: 'descripcion_norm' })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, hechos: lote.length, faltan: Math.max(0, faltanAntes - lote.length), total: ya.size + faltanAntes })
  } catch (e) {
    console.error('[tendencias/etiquetar] error:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
