import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, estado, costo_envio, total, monto_cobrado_ext, metodo_cobrado_ext } = await req.json()

  // If canceling an external domicilio, restore stock
  if (estado === 'cancelado') {
    const { data: dom } = await supabase
      .from('domicilios')
      .select('es_externo, items_tienda')
      .eq('id', id)
      .single()

    if (dom?.es_externo && dom.items_tienda?.length) {
      for (const item of dom.items_tienda) {
        if (!item.productoId) continue
        const { data: prod } = await supabase
          .from('productos_tienda')
          .select('stock')
          .eq('id', item.productoId)
          .single()
        if (prod) {
          await supabase
            .from('productos_tienda')
            .update({ stock: (prod.stock || 0) + item.cantidad })
            .eq('id', item.productoId)
        }
      }
    }
  }

  const actualizacion = { estado }
  if (costo_envio !== undefined) actualizacion.costo_envio = costo_envio
  if (total !== undefined) actualizacion.total = total
  if (monto_cobrado_ext !== undefined) actualizacion.monto_cobrado_ext = monto_cobrado_ext
  if (metodo_cobrado_ext !== undefined) actualizacion.metodo_cobrado_ext = metodo_cobrado_ext

  const { error } = await supabase
    .from('domicilios')
    .update(actualizacion)
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // Insert payment into pagos so corte de caja picks it up
  if (monto_cobrado_ext) {
    await supabase.from('pagos').insert({
      cliente_id: null,
      entrega_id: null,
      tipo: 'Venta Liquidación',
      monto: monto_cobrado_ext,
      metodo: metodo_cobrado_ext || 'Efectivo',
    })
  }

  return NextResponse.json({ ok: true })
}
