import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const estado = searchParams.get('estado')
  // `desde` sirve para "los retiros posteriores a este momento", que es lo que
  // necesita la caja para saber cuanto quedo en el cajon. Con `fecha` sola, un
  // retiro de ayer desaparecia del calculo hoy y el fondo esperado salia
  // inflado por el monto del retiro.
  const desde = searchParams.get('desde')

  let query = supabase
    .from('retiros_caja')
    .select('*')
    .order('creado_en', { ascending: false })

  if (desde) {
    query = query.gte('creado_en', desde)
  } else if (fecha) {
    const inicio = `${fecha}T00:00:00`
    const fin = `${fecha}T23:59:59`
    query = query.gte('creado_en', inicio).lte('creado_en', fin)
  }

  if (estado) {
    query = query.eq('estado', estado)
    // Solo retiros pendientes del día actual
    if (estado === 'pendiente') {
      const ahora = new Date()
      const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
      query = query.gte('creado_en', `${hoy}T00:00:00`).lte('creado_en', `${hoy}T23:59:59`)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiros: data })
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { monto, motivo, estado: estadoSolicitado } = await req.json()
  // Only admins can create a retiro already confirmed; vendors always go through approval.
  const esAdmin = sesion.rol === 'admin'
  const estado = esAdmin && estadoSolicitado === 'confirmado' ? 'confirmado' : 'pendiente'
  const { data, error } = await supabase
    .from('retiros_caja')
    .insert([{
      monto,
      motivo,
      estado,
      // Quién sacó el dinero. Estaba sin guardar: TODOS los retiros históricos
      // tienen admin_id null, así que la caja perdía efectivo sin nombre que
      // lo respalde. En una operación con efectivo eso no puede quedar así.
      admin_id: sesion.id,
      ...(estado === 'confirmado' ? { confirmado_en: new Date().toISOString() } : {})
    }])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiro: data[0] })
}