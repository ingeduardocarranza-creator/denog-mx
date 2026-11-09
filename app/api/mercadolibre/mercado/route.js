import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso, mlGet } from '@/lib/mercadolibre/api'

export const maxDuration = 60

// Diagnóstico de SOLO LECTURA: prueba qué datos de mercado deja leer
// MercadoLibre con esta cuenta (más vendidos, tendencias, búsqueda, catálogo).
// No cambia nada en MercadoLibre ni en el sitio.
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams.get('q') || 'vitaminas'
  const supabase = clienteSupabaseServicio()
  try {
    const { token } = await obtenerAcceso(supabase)
    const pid = new URL(req.url).searchParams.get('producto')
    const pruebas = pid ? {
      producto: [`/products/${pid}`, {}],
      producto_ofertas: [`/products/${pid}/items`, { limit: '10' }],
      producto_buybox: [`/products/${pid}/buy_box_winner`, {}],
      categoria_mas_vendidos_salud: ['/highlights/MLM/category/MLM1246', {}],
      item_publico: [`/items/${new URL(req.url).searchParams.get('item') || 'MLM2123159549'}`, {}],
    } : {
      tendencias_pais: ['/trends/MLM', {}],
      tendencias_categoria: ['/trends/MLM/MLM1276', {}],
      mas_vendidos_categoria: ['/highlights/MLM/category/MLM1276', {}],
      busqueda_publica: ['/sites/MLM/search', { q, limit: '5' }],
      busqueda_por_categoria: ['/sites/MLM/search', { category: 'MLM1276', limit: '5', sort: 'sold_quantity_desc' }],
      catalogo_productos: ['/products/search', { status: 'active', site_id: 'MLM', q, limit: '5' }],
      categorias_sitio: ['/sites/MLM/categories', {}],
      predictor_categoria: ['/sites/MLM/domain_discovery/search', { q, limit: '3' }],
    }
    const resultados = {}
    for (const [k, [ruta, params]] of Object.entries(pruebas)) {
      try {
        const r = await mlGet(token, ruta, params)
        const lista = Array.isArray(r) ? r : (r.results || r.content || r.trends || null)
        resultados[k] = { ok: true, tipo: Array.isArray(r) ? 'lista' : 'objeto', total: Array.isArray(lista) ? lista.length : null, claves: Array.isArray(r) ? undefined : Object.keys(r).slice(0, 12), muestra: JSON.stringify(Array.isArray(lista) ? lista.slice(0, 2) : r).slice(0, pid ? 1500 : 700) }
      } catch (e) {
        resultados[k] = { ok: false, error: String(e.message).slice(0, 200) }
      }
    }
    return NextResponse.json({ ok: true, q, resultados })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: String(e.message).slice(0, 300) })
  }
}
