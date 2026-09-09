import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  let query = supabase
    .from('ventas_tienda')
    .select('*, clientes!ventas_tienda_vendedor_id_fkey(nombre), productos_tienda(stock), pagos!ventas_tienda_pago_id_fkey(metodo), pagos_2:pagos!ventas_tienda_pago_id_2_fkey(metodo)')

  if (desde) query = query.gte('creado_en', `${desde}T00:00:00`)
  if (hasta) query = query.lte('creado_en', `${hasta}T23:59:59`)

  const { data, error } = await query.order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, ventas: data || [] })
}

// Conciliación de costo: el admin captura costo_unitario para líneas
// manuales (origen manual_monto/manual_producto) que se cobraron sin costo
// conocido, para que la utilidad de esa venta quede exacta.
export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id, costo_unitario, conciliado_por } = await req.json()
  if (!id || costo_unitario == null || isNaN(Number(costo_unitario))) {
    return NextResponse.json({ ok: false, mensaje: 'id y costo_unitario son requeridos.' })
  }

  const { error } = await supabase
    .from('ventas_tienda')
    .update({
      costo_unitario: Number(costo_unitario),
      costo_conciliado_en: new Date().toISOString(),
      costo_conciliado_por: conciliado_por || null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
