import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// Fase 6 del control interno: conteo físico de inventario contra el stock del
// sistema, por categoría (ciclo de inventario, no todo el catálogo de golpe).
//
// GET ?resumen=categorias  → una fila por categoría: cuántos productos activos
//                             tiene y si ya hay una sesión abierta.
// GET ?id=<uuid>            → una sesión con cada producto de su categoría,
//                             cruzado con lo que ya se contó (para reanudar).
// GET (sin parámetros)      → historial de sesiones, más recientes primero.
// POST { categoria }        → abre una sesión nueva, o reanuda la que ya
//                             estuviera abierta para esa categoría.
// PATCH { conteo_id, producto_id, cantidad_contada, justificacion }
//                            → guarda el conteo de un producto y ajusta su
//                             stock (vía aplicar_conteo_inventario).
// PUT { id }                 → cierra la sesión.

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  const resumen = searchParams.get('resumen')
  const id = searchParams.get('id')

  if (resumen === 'categorias') {
    const [{ data: productos, error: errProd }, { data: abiertas, error: errAbiertas }] = await Promise.all([
      supabase.from('productos_tienda').select('categoria').eq('activo', true),
      supabase.from('conteos_inventario').select('id, categoria').eq('estado', 'abierto'),
    ])
    if (errProd) return NextResponse.json({ ok: false, mensaje: errProd.message })
    if (errAbiertas) return NextResponse.json({ ok: false, mensaje: errAbiertas.message })

    const conteoPorCategoria = {}
    for (const p of productos || []) {
      const cat = p.categoria || 'Sin categoría'
      conteoPorCategoria[cat] = (conteoPorCategoria[cat] || 0) + 1
    }
    const abiertaPorCategoria = {}
    for (const a of abiertas || []) abiertaPorCategoria[a.categoria] = a.id

    const categorias = Object.keys(conteoPorCategoria).sort().map(categoria => ({
      categoria,
      total_productos: conteoPorCategoria[categoria],
      sesion_abierta_id: abiertaPorCategoria[categoria] || null,
    }))

    return NextResponse.json({ ok: true, categorias })
  }

  if (id) {
    const { data: sesionConteo, error: errSesion } = await supabase
      .from('conteos_inventario')
      .select('*, iniciador:clientes!conteos_inventario_iniciado_por_fkey(nombre), cerrador:clientes!conteos_inventario_cerrado_por_fkey(nombre)')
      .eq('id', id)
      .single()
    if (errSesion) return NextResponse.json({ ok: false, mensaje: errSesion.message })

    const [{ data: productos, error: errProd }, { data: detalle, error: errDet }] = await Promise.all([
      supabase.from('productos_tienda').select('id, nombre, codigo_barras, stock')
        .eq('activo', true).eq('categoria', sesionConteo.categoria).order('nombre'),
      supabase.from('conteos_inventario_detalle')
        .select('*, contador:clientes(nombre)').eq('conteo_id', id),
    ])
    if (errProd) return NextResponse.json({ ok: false, mensaje: errProd.message })
    if (errDet) return NextResponse.json({ ok: false, mensaje: errDet.message })

    const detallePorProducto = Object.fromEntries((detalle || []).map(d => [d.producto_id, d]))
    const items = (productos || []).map(p => ({
      ...p,
      conteo: detallePorProducto[p.id] || null,
    }))

    return NextResponse.json({ ok: true, sesion: sesionConteo, items })
  }

  const { data: sesiones, error } = await supabase
    .from('conteos_inventario')
    .select('*, iniciador:clientes!conteos_inventario_iniciado_por_fkey(nombre), cerrador:clientes!conteos_inventario_cerrado_por_fkey(nombre)')
    .order('iniciado_en', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // Progreso de cada sesión, en una sola consulta extra en vez de una por
  // sesión.
  const ids = (sesiones || []).map(s => s.id)
  let porSesion = {}
  if (ids.length) {
    const { data: detalles } = await supabase
      .from('conteos_inventario_detalle')
      .select('conteo_id, diferencia')
      .in('conteo_id', ids)
    for (const d of detalles || []) {
      const acc = (porSesion[d.conteo_id] ||= { contados: 0, con_diferencia: 0 })
      acc.contados += 1
      if (d.diferencia !== 0) acc.con_diferencia += 1
    }
  }

  const conProgreso = (sesiones || []).map(s => ({
    ...s,
    contados: porSesion[s.id]?.contados || 0,
    con_diferencia: porSesion[s.id]?.con_diferencia || 0,
  }))

  return NextResponse.json({ ok: true, sesiones: conProgreso })
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { categoria } = await req.json()
  if (!categoria || !categoria.trim()) {
    return NextResponse.json({ ok: false, mensaje: 'Falta la categoría' })
  }

  // Si ya hay una sesión abierta para esta categoría, se reanuda esa en vez
  // de abrir otra — el conteo de un pasillo no se hace siempre de una sentada.
  const { data: existente, error: errExistente } = await supabase
    .from('conteos_inventario')
    .select('*')
    .eq('categoria', categoria)
    .eq('estado', 'abierto')
    .maybeSingle()
  if (errExistente) return NextResponse.json({ ok: false, mensaje: errExistente.message })
  if (existente) return NextResponse.json({ ok: true, sesion: existente, reanudada: true })

  const { count } = await supabase
    .from('productos_tienda')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('categoria', categoria)

  const { data: nueva, error } = await supabase
    .from('conteos_inventario')
    .insert([{ categoria, iniciado_por: sesion.id, total_productos: count || 0 }])
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, sesion: nueva, reanudada: false })
}

export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { conteo_id, producto_id, cantidad_contada, justificacion } = await req.json()

  if (!conteo_id || !producto_id || cantidad_contada === undefined || cantidad_contada === null) {
    return NextResponse.json({ ok: false, mensaje: 'Faltan datos del conteo' })
  }

  const { data: sesionConteo, error: errSesion } = await supabase
    .from('conteos_inventario')
    .select('id, estado')
    .eq('id', conteo_id)
    .single()
  if (errSesion) return NextResponse.json({ ok: false, mensaje: errSesion.message })
  if (sesionConteo.estado !== 'abierto') {
    return NextResponse.json({ ok: false, mensaje: 'Esta sesión de conteo ya está cerrada' })
  }

  const { data, error } = await supabase.rpc('aplicar_conteo_inventario', {
    p_conteo_id: conteo_id,
    p_producto_id: producto_id,
    p_cantidad_contada: cantidad_contada,
    p_justificacion: justificacion || null,
    p_contado_por: sesion.id,
  })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const fila = data?.[0]
  return NextResponse.json({
    ok: true,
    resultado: fila ? {
      producto_id: fila.out_producto_id,
      stock_sistema: fila.out_stock_sistema,
      cantidad_contada: fila.out_cantidad_contada,
      diferencia: fila.out_diferencia,
    } : null,
  })
}

export async function PUT(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'id requerido' })

  const { data, error } = await supabase
    .from('conteos_inventario')
    .update({ estado: 'cerrado', cerrado_por: sesion.id, cerrado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'abierto')
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  if (!data) return NextResponse.json({ ok: false, mensaje: 'La sesión ya estaba cerrada o no existe' })
  return NextResponse.json({ ok: true, sesion: data })
}
