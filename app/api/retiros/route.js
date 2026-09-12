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
    // Nota: antes esto limitaba "pendiente" al día actual. Como ya no hay
    // auto-confirmación, un retiro puede quedar pendiente más de un día —
    // limitarlo a hoy lo escondía de la lista de pendientes por confirmar.
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiros: data })
}

export async function POST(req) {
  // Solo el admin puede sacar dinero de caja. La sección de retiro es
  // exclusiva de admin (decisión de Eduardo), así que aquí también se
  // exige admin y no solo staff.
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { monto, motivo } = await req.json()
  // Todo retiro nace pendiente. Ya no existe la auto-confirmación: hace
  // falta un paso extra de "Confirmar" (lo puede dar cualquier admin,
  // incluso el mismo que lo sacó) para que quede marcado como confirmado.
  const { data, error } = await supabase
    .from('retiros_caja')
    .insert([{
      monto,
      motivo,
      estado: 'pendiente',
      admin_id: sesion.id,
    }])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiro: data[0] })
}
