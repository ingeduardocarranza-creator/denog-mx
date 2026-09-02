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
  const { cliente_id, entrega_id, monto, metodo, creado_en, pendiente_id, confirmar_duplicado } = await req.json()

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
      // Antes esto bloqueaba en seco. Pero un comprobante que llego tarde, o
      // un pago que nunca se capturo, se tiene que poder registrar despues de
      // entregado: si no, el dinero se queda fuera del sistema. Ahora avisa y
      // pide confirmacion en vez de cerrar la puerta.
      if (todosEntregados && !confirmar_duplicado) {
        return NextResponse.json({
          ok: false,
          requiere_confirmacion: true,
          mensaje: 'Todos los pedidos de esta entrega ya estan entregados. Registra el anticipo solo si de verdad falto capturar este dinero.',
        })
      }
    }
  }

  // Guardia anti-duplicado. No bloquea (dos abonos iguales el mismo dia son
  // posibles y ya existen en el historico): avisa y exige confirmacion
  // explicita. El error caro aqui es capturar dos veces el mismo dinero.
  if (!confirmar_duplicado) {
    const dia = (creado_en || new Date().toISOString()).slice(0, 10)
    let q = supabase
      .from('pagos')
      .select('id, monto, metodo, creado_en')
      .eq('cliente_id', cliente_id)
      .eq('tipo', 'Anticipo')
      .eq('monto', Number(monto))
      .gte('creado_en', `${dia}T00:00:00`)
      .lte('creado_en', `${dia}T23:59:59`)
    q = entrega_id ? q.eq('entrega_id', entrega_id) : q.is('entrega_id', null)
    const { data: gemelos } = await q
    if (gemelos?.length) {
      return NextResponse.json({
        ok: false,
        requiere_confirmacion: true,
        mensaje: `Ya existe un anticipo de $${Number(monto).toLocaleString('es-MX')} para este cliente en esta entrega el mismo dia. Confirma si de verdad son dos abonos distintos.`,
        existentes: gemelos,
      })
    }
  }

  const { data, error } = await supabase
    .from('pagos')
    .insert({
      cliente_id,
      entrega_id: entrega_id || null,
      monto: Number(monto),
      metodo,
      tipo: 'Anticipo',
      pendiente_id: pendiente_id || null,
      creado_en,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // Si el anticipo nace de un comprobante de WhatsApp, el comprobante se
  // cierra aqui mismo. Nunca son dos acciones separadas: esa separacion es
  // la que dejo 22 comprobantes resueltos sin pago entre agosto y hoy.
  if (pendiente_id) {
    const sesion = requerirStaff(req)
    await supabase
      .from('pendientes')
      .update({ estado: 'resuelto', resuelto_por: sesion?.id || null, resuelto_en: new Date().toISOString() })
      .eq('id', pendiente_id)
  }

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

// Cancelar, no borrar. Un anticipo es dinero: desaparecer sin rastro no es
// una opcion. La fila se mueve completa a pagos_cancelados con el motivo y
// quien lo hizo, y sale de los saldos porque ya no esta en pagos.
export async function DELETE(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id, motivo } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })
  if (!motivo || !String(motivo).trim()) {
    return NextResponse.json({ ok: false, mensaje: 'Escribe el motivo de la cancelacion' })
  }

  const { data: pago, error: errorLectura } = await supabase
    .from('pagos').select('*').eq('id', id).single()
  if (errorLectura || !pago) return NextResponse.json({ ok: false, mensaje: 'No se encontro el anticipo' })

  const { error: errorBitacora } = await supabase.from('pagos_cancelados').insert({
    ...pago,
    cancelado_por: sesion.id,
    cancelado_motivo: String(motivo).trim(),
  })
  if (errorBitacora) return NextResponse.json({ ok: false, mensaje: errorBitacora.message })

  const { error } = await supabase.from('pagos').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // El comprobante que lo origino vuelve a la bandeja: el dinero sigue sin
  // aplicarse y no puede quedar invisible.
  if (pago.pendiente_id) {
    await supabase.from('pendientes')
      .update({ estado: 'visto', resuelto_por: null, resuelto_en: null })
      .eq('id', pago.pendiente_id)
  }

  return NextResponse.json({ ok: true })
}
