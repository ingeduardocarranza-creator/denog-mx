import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

const CAMPOS_PERMITIDOS = [
  'nombre', 'codigo_barras', 'costo', 'precio_venta', 'stock',
  'categoria', 'imagen_url', 'activo', 'mostrar_en_mercadito',
  'descripcion', 'galeria', 'pendiente_aprobacion', 'costo_usd',
  'grupo_id', 'variante',
]

// Lo único que se permite cambiar a varios artículos a la vez.
const CAMPOS_LOTE = ['activo', 'mostrar_en_mercadito', 'categoria', 'pendiente_aprobacion']

// Returns all products (including inactive) with creator join
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  // Historial de un artículo: lo que registra la bitácora (quién, cuándo, qué cambió).
  const hid = new URL(req.url).searchParams.get('historial')
  if (hid) {
    const { data, error } = await supabase
      .from('bitacora')
      .select('id, operacion, cambios, antes, despues, ocurrio_en, actor_nombre')
      .eq('tabla', 'productos_tienda')
      .eq('registro_id', String(hid))
      .order('id', { ascending: false })
      .limit(40)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, items: data })
  }

  const { data, error } = await supabase
    .from('productos_tienda')
    .select('*, creador:clientes(nombre)')
    .order('id', { ascending: false })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, productos: data })
}

// Create a new product
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json()
  const datos = Object.fromEntries(CAMPOS_PERMITIDOS.filter(k => k in body).map(k => [k, body[k]]))
  datos.creado_por = sesion.id
  const { data, error } = await supabase.from('productos_tienda').insert([datos]).select('id').single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, id: data.id })
}

// Update an existing product. Si cambia stock/costo/precio_venta, la
// bitácora lo registra con quién de verdad lo hizo (supabaseConSesion manda
// el header que el trigger lee) — antes se guardaba con el rol de servicio y
// no quedaba rastro de quién tocó el número.
//
// Con `ids` (arreglo) en vez de `id` cambia varios artículos a la vez, pero
// solo pausar/activar, Mercadito y categoría — nunca precios ni stock en lote.
export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json()
  const { id, ids, ...rest } = body

  // Agrupar artículos que ya existen como variantes de uno solo. El primero de
  // la lista es la "cabeza" del grupo. Cada uno conserva su costo, precio,
  // stock y código; solo cambia su nombre ("<título> · <variante>") y su grupo.
  if (rest.accion === 'agrupar') {
    const titulo = String(rest.titulo || '').trim()
    const miembros = Array.isArray(rest.miembros) ? rest.miembros : []
    if (!titulo) return NextResponse.json({ ok: false, mensaje: 'Escribe el nombre del grupo' })
    if (miembros.length < 2) return NextResponse.json({ ok: false, mensaje: 'Elige al menos 2 artículos' })
    if (miembros.some(m => !m.id || !String(m.variante || '').trim())) {
      return NextResponse.json({ ok: false, mensaje: 'Cada artículo necesita el nombre de su variante' })
    }
    const idsMiembros = miembros.map(m => m.id)
    const { data: filas, error: e1 } = await supabase
      .from('productos_tienda').select('id, nombre, grupo_id, pendiente_aprobacion').in('id', idsMiembros)
    if (e1) return NextResponse.json({ ok: false, mensaje: e1.message })
    if ((filas || []).length !== idsMiembros.length) return NextResponse.json({ ok: false, mensaje: 'Algún artículo ya no existe' })
    if (filas.some(f => f.grupo_id != null)) return NextResponse.json({ ok: false, mensaje: 'Alguno de los artículos ya es variante de otro grupo' })
    if (filas.some(f => f.pendiente_aprobacion)) return NextResponse.json({ ok: false, mensaje: 'Aprueba primero los artículos que están por aprobar' })
    const { data: hijos, error: e2 } = await supabase
      .from('productos_tienda').select('id').in('grupo_id', idsMiembros).limit(1)
    if (e2) return NextResponse.json({ ok: false, mensaje: e2.message })
    if ((hijos || []).length > 0) return NextResponse.json({ ok: false, mensaje: 'Alguno de los artículos ya tiene variantes propias' })

    const cabezaId = miembros[0].id
    for (let i = 0; i < miembros.length; i++) {
      const variante = String(miembros[i].variante).trim()
      const { error } = await supabase.from('productos_tienda').update({
        nombre: `${titulo} · ${variante}`,
        variante,
        grupo_id: i === 0 ? null : cabezaId,
      }).eq('id', miembros[i].id)
      if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    }
    return NextResponse.json({ ok: true, cambiados: miembros.length })
  }

  if (Array.isArray(ids)) {
    if (ids.length === 0) return NextResponse.json({ ok: false, mensaje: 'No hay artículos seleccionados' })
    const datos = Object.fromEntries(CAMPOS_LOTE.filter(k => k in rest).map(k => [k, rest[k]]))
    if (Object.keys(datos).length === 0) return NextResponse.json({ ok: false, mensaje: 'Nada que cambiar' })
    // Aprobar en lote: ningún artículo se aprueba sin precio de venta.
    if (datos.pendiente_aprobacion === false) {
      const { data: filas, error: ep } = await supabase
        .from('productos_tienda').select('nombre, precio_venta').in('id', ids)
      if (ep) return NextResponse.json({ ok: false, mensaje: ep.message })
      const faltan = (filas || []).filter(p => !(Number(p.precio_venta) > 0)).map(p => p.nombre)
      if (faltan.length > 0) return NextResponse.json({ ok: false, mensaje: `Falta el precio de venta de: ${faltan.join(', ')}` })
    }
    const { error } = await supabase.from('productos_tienda').update(datos).in('id', ids)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, cambiados: ids.length })
  }

  if (!id) return NextResponse.json({ ok: false, mensaje: 'id requerido' })
  const datos = Object.fromEntries(CAMPOS_PERMITIDOS.filter(k => k in rest).map(k => [k, rest[k]]))
  const { error } = await supabase.from('productos_tienda').update(datos).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}

// Eliminar artículos (uno con `id`, varios con `ids`). Solo admin.
// Un artículo con historial — ventas, reseñas o conteos de inventario — NO se
// borra: se deja intacto y se avisa, porque borrarlo dejaría esas ventas sin
// saber de qué producto fueron. Para esos, la salida correcta es "Pausar".
export async function DELETE(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : [])
  if (ids.length === 0) return NextResponse.json({ ok: false, mensaje: 'id requerido' })

  const { data: productos, error: e0 } = await supabase.from('productos_tienda').select('id, nombre').in('id', ids)
  if (e0) return NextResponse.json({ ok: false, mensaje: e0.message })

  const conHistorial = new Set()
  for (const tabla of ['ventas_tienda', 'mercadito_resenas', 'conteos_inventario_detalle']) {
    const { data, error } = await supabase.from(tabla).select('producto_id').in('producto_id', ids)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    for (const r of data || []) conHistorial.add(r.producto_id)
  }

  // Una cabeza con variantes solo se borra si TODAS sus variantes se borran
  // junto con ella; si no, se queda (y las variantes no quedan huérfanas).
  const { data: hijos, error: eh } = await supabase.from('productos_tienda').select('id, grupo_id').in('grupo_id', ids)
  if (eh) return NextResponse.json({ ok: false, mensaje: eh.message })
  const sinHistorial = new Set((productos || []).filter(p => !conHistorial.has(p.id)).map(p => p.id))
  const seBorran = new Set(sinHistorial)
  let cambio = true
  while (cambio) {
    cambio = false
    for (const h of hijos || []) {
      if (!seBorran.has(h.id) && seBorran.has(h.grupo_id)) { seBorran.delete(h.grupo_id); cambio = true }
    }
  }

  const borrables = (productos || []).filter(p => seBorran.has(p.id))
  const omitidos = (productos || []).filter(p => conHistorial.has(p.id)).map(p => p.nombre)
  const omitidosVariantes = (productos || []).filter(p => sinHistorial.has(p.id) && !seBorran.has(p.id)).map(p => p.nombre)

  if (borrables.length > 0) {
    const { error } = await supabase.from('productos_tienda').delete().in('id', borrables.map(p => p.id))
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  }
  return NextResponse.json({ ok: true, eliminados: borrables.length, omitidos, omitidosVariantes })
}
