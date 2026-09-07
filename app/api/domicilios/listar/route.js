import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff, requerirDuenoOStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  const fecha = searchParams.get('fecha')

  // Clientes pueden ver solo sus propios domicilios; staff ve todos
  if (cliente_id) {
    if (!requerirDuenoOStaff(req, cliente_id)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  } else {
    if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }

  let query = supabase
    .from('domicilios')
    .select('*, clientes(nombre, telefono)')
    .order('creado_en', { ascending: false })

  if (cliente_id) query = query.eq('cliente_id', cliente_id)
  if (fecha) query = query.eq('fecha_preferida', fecha)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const domiciliosConProductos = await Promise.all(
    data.map(async (d) => {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('descripcion, precio_venta, cantidad, entrega_id, entregas(fecha_entrega)')
        .eq('cliente_id', d.cliente_id)
        .in('entrega_id', d.entrega_ids || [])
        // Borradores de WhatsApp y descartados no son mercancía: no se cobran
        // en la puerta. Mismo criterio que lib/estadosCuenta/datosServidor.js.
        .eq('pendiente_aprobacion', false)
        .not('estado', 'in', '("Cancelado","no_llego","pendiente","descartado")')

      const { data: anticipos } = await supabase
        .from('pagos')
        .select('monto, creado_en, entrega_id')
        .eq('cliente_id', d.cliente_id)
        .ilike('tipo', 'anticipo')
        .in('entrega_id', d.entrega_ids || [])
        .order('creado_en', { ascending: true })

      // TODO lo que ya pagó de esas entregas, no solo los anticipos. Con solo
      // los anticipos, una entrega vieja que ya estaba pagada volvía a salir
      // como pendiente y se le cobraba de nuevo. Los envíos no cuentan: son
      // servicio, no mercancía.
      const { data: pagosEntregas } = await supabase
        .from('pagos')
        .select('monto, entrega_id')
        .eq('cliente_id', d.cliente_id)
        .neq('tipo', 'Envío')
        .in('entrega_id', d.entrega_ids || [])
      const pagado_por_entrega = {}
      for (const g of (pagosEntregas || [])) {
        pagado_por_entrega[g.entrega_id] = (pagado_por_entrega[g.entrega_id] || 0) + Number(g.monto || 0)
      }

      const { data: mercadito } = await supabase
        .from('pedidos_mercadito')
        .select('id, items, estado')
        .eq('domicilio_id', d.id)
        .neq('estado', 'cancelado')

      return {
        ...d,
        productos_detalle: pedidos || [],
        anticipos_detalle: anticipos || [],
        pagado_por_entrega,
        mercadito_detalle: mercadito || [],
      }
    })
  )

  return NextResponse.json({ ok: true, domicilios: domiciliosConProductos })
}