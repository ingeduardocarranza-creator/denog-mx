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
  try {
    const body = await req.json()
    const {
      // Regular domicilio fields
      cliente_id, entrega_ids, direccion, colonia,
      referencias, celular_contacto, celular_contacto_adicional,
      fecha_preferida, horario, notas, distancia_km, costo_envio,
      subtotal, total,
      // External customer fields
      es_externo, nombre_externo, telefono_externo,
      items_tienda, forma_pago_ext, pago_anticipado_ext, metodo_pago_ext,
    } = body

    // For external orders, deduct stock immediately
    if (es_externo && items_tienda?.length) {
      for (const item of items_tienda) {
        if (!item.productoId || item.stockDisponible == null) continue
        const nuevoStock = Math.max(0, item.stockDisponible - item.cantidad)
        await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', item.productoId)
      }
    }

    const { data, error } = await supabase
      .from('domicilios')
      .insert([{
        cliente_id: es_externo ? null : cliente_id,
        entrega_ids: es_externo ? [] : entrega_ids,
        direccion, colonia, referencias,
        celular_contacto: es_externo ? telefono_externo : celular_contacto,
        celular_contacto_adicional,
        fecha_preferida, horario, notas, distancia_km, costo_envio,
        subtotal, total,
        // External fields
        es_externo: !!es_externo,
        nombre_externo: es_externo ? nombre_externo : null,
        telefono_externo: es_externo ? telefono_externo : null,
        items_tienda: es_externo ? items_tienda : null,
        forma_pago_ext: es_externo ? forma_pago_ext : null,
        pago_anticipado_ext: es_externo ? (pago_anticipado_ext || 0) : null,
        metodo_pago_ext: es_externo ? metodo_pago_ext : null,
        // External orders skip the cost-confirmation step
        estado: es_externo ? 'confirmado' : 'pendiente',
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, domicilio: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
