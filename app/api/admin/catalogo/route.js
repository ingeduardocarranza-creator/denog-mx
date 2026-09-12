import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

const CAMPOS_PERMITIDOS = [
  'nombre', 'codigo_barras', 'costo', 'precio_venta', 'stock',
  'categoria', 'imagen_url', 'activo', 'mostrar_en_mercadito',
  'descripcion', 'galeria', 'pendiente_aprobacion',
]

// Returns all products (including inactive) with creator join
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
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
export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ ok: false, mensaje: 'id requerido' })
  const datos = Object.fromEntries(CAMPOS_PERMITIDOS.filter(k => k in rest).map(k => [k, rest[k]]))
  const { error } = await supabase.from('productos_tienda').update(datos).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
