import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { cliente_id, entrega_id, pagos, vendedor_id } = await req.json()

  // Mismo candado que en /api/punto-venta/cobrar: esta ruta es la que usa el
  // cobro a domicilio, y también liquida una entrega. Si la mercancía todavía
  // no llega a tienda, no hay nada que liquidar.
  if (entrega_id) {
    const { data: entrega } = await supabase
      .from('entregas')
      .select('fecha_entrega, estado')
      .eq('id', entrega_id)
      .single()
    if (entrega && entrega.estado !== 'en_tienda') {
      return NextResponse.json({
        ok: false,
        mensaje: `No se puede cobrar: la entrega del ${entrega.fecha_entrega} todavía no está en tienda.`,
      }, { status: 409 })
    }
  }

  const registros = pagos.map(p => ({
    cliente_id,
    entrega_id,
    monto: p.monto,
    metodo: p.metodo,
    tipo: 'Venta Liquidación',
    // Quién cobró. Se venía mandando desde el POS y se tiraba aquí: todos los
    // cobros a domicilio quedaban sin responsable, igual que pasaba con los
    // retiros de caja.
    vendedor_id: vendedor_id || sesion.id,
  }))

  const { error } = await supabase.from('pagos').insert(registros)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}