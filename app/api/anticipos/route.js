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
  if (!requerirDuenoOStaff(req, cliente_id)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  let query = supabase
    .from('pagos')
    .select('id, cliente_id, entrega_id, monto, metodo, tipo, creado_en, clientes!pagos_cliente_id_fkey(nombre)')
    .eq('tipo', 'Anticipo')
    .order('creado_en', { ascending: false })

  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, anticipos: data })
}

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { cliente_id, entrega_id, monto, metodo, creado_en } = await req.json()

  if (!cliente_id || !monto || Number(monto) <= 0) {
    return NextResponse.json({ ok: false, mensaje: 'Faltan datos obligatorios' })
  }

  // Validate that the delivery hasn't already been fully delivered
  if (entrega_id) {
    const { data: pedidosEntrega } = await supabase
      .from('pedidos')
      .select('estado')
      .eq('cliente_id', cliente_id)
      .eq('entrega_id', entrega_id)

    if (pedidosEntrega && pedidosEntrega.length > 0) {
      const todosEntregados = pedidosEntrega.every(p => p.estado?.toLowerCase() === 'entregado')
      if (todosEntregados) {
        return NextResponse.json({ ok: false, mensaje: '⚠️ No se puede registrar — todos los pedidos de esta entrega ya fueron entregados y pagados.' })
      }
    }
  }

  const { data, error } = await supabase
    .from('pagos')
    .insert({ cliente_id, entrega_id: entrega_id || null, monto: Number(monto), metodo, tipo: 'Anticipo', creado_en })
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, anticipo: data })
}

export async function PATCH(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, monto } = await req.json()
  if (!id || !monto || Number(monto) <= 0) {
    return NextResponse.json({ ok: false, mensaje: 'ID y monto requeridos' })
  }

  const { error } = await supabase.from('pagos').update({ monto: Number(monto) }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { error } = await supabase.from('pagos').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
