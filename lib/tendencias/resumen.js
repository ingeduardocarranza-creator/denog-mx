import { traerTodo } from '@/lib/traerTodo'
import {
  normalizarDescripcion, descripcionUtil, normalizarTienda, TIENDAS_FISICAS,
  TEMPORADAS, calendario, hoyHermosillo,
} from './comun'

// ---------------------------------------------------------------------------
// Lo que te funciona: todo sale de la tabla de pedidos (encargos), cruzada
// con producto_etiquetas. Los devueltos no cuentan.
// ---------------------------------------------------------------------------

const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const mediana = (xs) => {
  const v = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

export async function cargarPedidosEtiquetados(supabase) {
  const [pedidos, etiquetas] = await Promise.all([
    traerTodo((a, b) => supabase.from('pedidos')
      .select('descripcion, lugar_compra, cantidad, precio_usd, precio_venta, utilidad, tipo_cambio, impuesto_pct, fecha_compra, creado_en, cliente_id, devuelto')
      .order('creado_en', { ascending: true }).range(a, b)),
    traerTodo((a, b) => supabase.from('producto_etiquetas').select('*').range(a, b)),
  ])
  const mapa = new Map(etiquetas.map(e => [e.descripcion_norm, e]))
  const filas = []
  for (const p of pedidos) {
    if (p.devuelto) continue
    if (!descripcionUtil(p.descripcion)) continue
    const llave = normalizarDescripcion(p.descripcion)
    const fecha = String(p.fecha_compra || p.creado_en || '').slice(0, 10)
    filas.push({ ...p, llave, fecha, tienda: normalizarTienda(p.lugar_compra), piezas: Number(p.cantidad) || 1, et: mapa.get(llave) || null })
  }
  return filas
}

export async function cargarResumen(supabase) {
  const hoy = hoyHermosillo()
  const [filas, { data: entregas }, { data: ultimaLista }] = await Promise.all([
    cargarPedidosEtiquetados(supabase),
    supabase.from('entregas').select('fecha_entrega, estado').eq('estado', 'futura').order('fecha_entrega', { ascending: true }).limit(1),
    supabase.from('tendencias_listas').select('*').order('creado_en', { ascending: false }).limit(1),
  ])

  const proximaEntrega = entregas?.[0]?.fecha_entrega || null
  const hace30 = sumarDias(hoy, -30), hace60 = sumarDias(hoy, -60), hace90 = sumarDias(hoy, -90)

  // ── Meses ──
  const meses = new Map()
  for (const f of filas) {
    const k = f.fecha.slice(0, 7)
    if (!k) continue
    const m = meses.get(k) || { mes: k, piezas: 0, utilidad: 0 }
    m.piezas += f.piezas; m.utilidad += Number(f.utilidad) || 0
    meses.set(k, m)
  }
  const listaMeses = [...meses.values()].filter(m => m.piezas >= 20).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ ...m, utilidad: Math.round(m.utilidad), nombre: `${MES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}` }))
  const mejorMes = [...listaMeses].sort((a, b) => b.utilidad - a.utilidad)[0] || null

  // ── Tiendas ──
  const tiendas = new Map()
  for (const f of filas) tiendas.set(f.tienda, (tiendas.get(f.tienda) || 0) + f.piezas)
  const totalPiezas = filas.reduce((s, f) => s + f.piezas, 0)
  const listaTiendas = [...tiendas.entries()].filter(([t]) => t !== 'Otro' && t !== 'Sin tienda')
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([nombre, piezas]) => ({ nombre, piezas, pct: totalPiezas ? piezas / totalPiezas : 0 }))

  // ── Tipos de producto (lo que de verdad dice qué publicar) ──
  const tipos = new Map()
  for (const f of filas) {
    if (!f.et?.tipo) continue
    const k = f.et.tipo.toLowerCase()
    const t = tipos.get(k) || { tipo: f.et.tipo, familia: f.et.familia, marcas: new Map(), tiendas: new Map(), ejemplos: new Map(),
      temporadas: new Set(), piezas: 0, piezas90: 0, piezas30: 0, piezasPrev30: 0, utilidad: 0, utilidad90: 0, usd: [], venta: [], clientes: new Set() }
    t.piezas += f.piezas
    t.utilidad += Number(f.utilidad) || 0
    if (f.fecha >= hace90) { t.piezas90 += f.piezas; t.utilidad90 += Number(f.utilidad) || 0 }
    if (f.fecha >= hace30) t.piezas30 += f.piezas
    else if (f.fecha >= hace60) t.piezasPrev30 += f.piezas
    if (Number(f.precio_usd) > 0) t.usd.push(Number(f.precio_usd))
    if (Number(f.precio_venta) > 0) t.venta.push(Number(f.precio_venta))
    if (f.et.marca) t.marcas.set(f.et.marca, (t.marcas.get(f.et.marca) || 0) + f.piezas)
    t.tiendas.set(f.tienda, (t.tiendas.get(f.tienda) || 0) + f.piezas)
    t.ejemplos.set(f.descripcion.trim(), (t.ejemplos.get(f.descripcion.trim()) || 0) + f.piezas)
    for (const s of f.et.temporadas || []) t.temporadas.add(s)
    if (f.cliente_id) t.clientes.add(f.cliente_id)
    tipos.set(k, t)
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const listaTipos = [...tipos.values()].map(t => ({
    tipo: t.tipo, familia: t.familia,
    marca: top(t.marcas), tienda: top(t.tiendas), ejemplo: top(t.ejemplos),
    temporadas: [...t.temporadas],
    piezas: t.piezas, piezas90: t.piezas90, piezas30: t.piezas30, piezasPrev30: t.piezasPrev30,
    utilidad: Math.round(t.utilidad), utilidad90: Math.round(t.utilidad90),
    utilidadPieza: t.piezas ? Math.round(t.utilidad / t.piezas) : 0,
    usd: mediana(t.usd), venta: mediana(t.venta), clientes: t.clientes.size,
    subiendo: t.piezas30 >= 4 && t.piezas30 >= t.piezasPrev30 * 1.5,
  }))
  const masVendidos = [...listaTipos].sort((a, b) => b.piezas90 - a.piezas90 || b.utilidad90 - a.utilidad90).slice(0, 12)
  const masUtilidad = [...listaTipos].filter(t => t.piezas >= 3).sort((a, b) => b.utilidadPieza - a.utilidadPieza).slice(0, 8)
  const subiendo = listaTipos.filter(t => t.subiendo).sort((a, b) => (b.piezas30 - b.piezasPrev30) - (a.piezas30 - a.piezasPrev30)).slice(0, 8)

  // ── Marcas ──
  const marcas = new Map()
  for (const f of filas) if (f.et?.marca) marcas.set(f.et.marca, (marcas.get(f.et.marca) || 0) + f.piezas)
  const listaMarcas = [...marcas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([marca, piezas]) => ({ marca, piezas }))

  // ── Guía para tienda física (Ross, Burlington…) ──
  const guia = listaTipos.filter(t => TIENDAS_FISICAS.includes(t.tienda) && t.piezas >= 3)
    .sort((a, b) => b.utilidad90 - a.utilidad90).slice(0, 8)

  // ── Guía para el equipo, por tienda (incluye las que también se visitan en persona) ──
  const TIENDAS_GUIA = [...TIENDAS_FISICAS, 'Walmart', 'Costco', "Sam's", 'Target']
  const porTiendaTipo = new Map()   // tienda → tipo → { piezas90, utilidad90, usd[], venta[], ejemplo }
  for (const f of filas) {
    if (!f.et?.tipo || f.fecha < hace90 || !TIENDAS_GUIA.includes(f.tienda)) continue
    const m = porTiendaTipo.get(f.tienda) || new Map()
    const k = f.et.tipo
    const t = m.get(k) || { tipo: k, piezas90: 0, utilidad90: 0, usd: [], venta: [], ejemplos: new Map() }
    t.piezas90 += f.piezas; t.utilidad90 += Number(f.utilidad) || 0
    if (Number(f.precio_usd) > 0) t.usd.push(Number(f.precio_usd))
    if (Number(f.precio_venta) > 0) t.venta.push(Number(f.precio_venta))
    t.ejemplos.set(f.descripcion.trim(), (t.ejemplos.get(f.descripcion.trim()) || 0) + 1)
    m.set(k, t); porTiendaTipo.set(f.tienda, m)
  }
  const guiaPorTienda = TIENDAS_GUIA.filter(t => porTiendaTipo.has(t)).map(tienda => ({
    tienda,
    tipos: [...porTiendaTipo.get(tienda).values()].filter(t => t.piezas90 >= 2)
      .sort((a, b) => b.utilidad90 - a.utilidad90).slice(0, 6)
      .map(t => ({ tipo: t.tipo, piezas90: t.piezas90, utilidad90: Math.round(t.utilidad90), usd: mediana(t.usd), venta: mediana(t.venta), ejemplo: top(t.ejemplos) })),
  })).filter(g => g.tipos.length).sort((a, b) => b.tipos.reduce((s, t) => s + t.utilidad90, 0) - a.tipos.reduce((s, t) => s + t.utilidad90, 0))

  // Lo que se vende pero deja poco por pieza: no vale la pena cargarlo.
  const margenBajo = listaTipos.filter(t => t.piezas >= 5 && t.utilidadPieza > 0 && t.utilidadPieza < 40)
    .sort((a, b) => a.utilidadPieza - b.utilidadPieza).slice(0, 6)

  // ── Calendario + lo que ya vendiste de cada temporada ──
  const cal = calendario(hoy, proximaEntrega).map(e => {
    const deEsta = listaTipos.filter(t => t.temporadas.includes(e.clave)).sort((a, b) => b.piezas - a.piezas).slice(0, 5)
    return { ...e, tuyos: deEsta.map(t => ({ tipo: t.tipo, piezas: t.piezas })) }
  })

  // ── Reglas de precio sacadas de tus últimos 60 días ──
  const recientes = filas.filter(f => f.fecha >= hace60 && Number(f.precio_usd) > 0 && Number(f.precio_venta) > 0)
  const precios = {
    factor: Math.round((mediana(recientes.map(f => f.precio_venta / f.precio_usd)) || 31) * 10) / 10,
    tipoCambio: mediana(recientes.map(f => Number(f.tipo_cambio)).filter(Boolean)) || 17.5,
    impuesto: mediana(recientes.map(f => Number(f.impuesto_pct)).filter(x => x >= 0)) ?? 8.6,
  }

  const llaves = new Set(filas.map(f => f.llave))
  const etiquetadas = new Set(filas.filter(f => f.et).map(f => f.llave))

  return {
    hoy, proximaEntrega,
    totales: { pedidos: filas.length, piezas: totalPiezas, desde: filas.reduce((m, f) => (f.fecha && (!m || f.fecha < m) ? f.fecha : m), null) },
    etiquetas: { total: llaves.size, hechas: etiquetadas.size, faltan: llaves.size - etiquetadas.size },
    meses: listaMeses, mejorMes, tiendas: listaTiendas, marcas: listaMarcas,
    masVendidos, masUtilidad, subiendo, guia, guiaPorTienda, margenBajo, todosTipos: listaTipos,
    calendario: cal, temporadas: TEMPORADAS, precios,
    lista: ultimaLista?.[0] || null,
  }
}
