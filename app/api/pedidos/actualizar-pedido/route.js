import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function PUT(req) {
  const sesionPut = requerirStaff(req)
  if (!sesionPut) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesionPut)
  const { id, cliente_id, entrega_id, descripcion, lugar_compra, cantidad, fecha_compra,
    precio_usd, tipo_cambio, impuesto_pct, costo_mxn, precio_venta, utilidad, notas, estado, vendedor_id, categoria, apartado_fragil, imagen_url, tipo_empaque, pendiente_aprobacion,
    devuelto, devuelto_motivo, reembolso_usd, reembolso_en } = await req.json()

  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  // No permitir marcar como Entregado si el cliente aún tiene saldo pendiente en esa entrega
  if (estado === 'Entregado' && cliente_id && entrega_id) {
    const { data: pedidosEntrega } = await supabase
      .from('pedidos')
      .select('id, precio_venta, estado')
      .eq('cliente_id', cliente_id)
      .eq('entrega_id', entrega_id)

    const { data: pagosEntrega } = await supabase
      .from('pagos')
      .select('monto')
      .eq('cliente_id', cliente_id)
      .eq('entrega_id', entrega_id)

    const totalPedidos = (pedidosEntrega || [])
      .reduce((s, p) => s + (p.id === id ? (precio_venta || 0) : (p.precio_venta || 0)), 0)
    const totalPagado = (pagosEntrega || []).reduce((s, p) => s + (p.monto || 0), 0)
    const saldoPendiente = totalPedidos - totalPagado

    if (saldoPendiente > 0.5) {
      return NextResponse.json({
        ok: false,
        mensaje: `No se puede marcar como Entregado: el cliente tiene un saldo pendiente de $${saldoPendiente.toFixed(2)} en esta entrega.`
      })
    }
  }

  // Devolución a la tienda de EUA (Fase 7 — control de compras). Solo se
  // toca cuando el llamador manda el campo `devuelto`; si pasa de false a
  // true se deja constancia de quién y cuándo, igual que corte/retiro — un
  // movimiento de dinero (el reembolso) necesita nombre y fecha, no solo el
  // monto.
  let camposDevolucion = {}
  if (devuelto !== undefined) {
    const { data: actual } = await supabase.from('pedidos').select('devuelto').eq('id', id).single()
    camposDevolucion = {
      devuelto,
      devuelto_motivo: devuelto ? (devuelto_motivo || null) : null,
      reembolso_usd: devuelto && reembolso_usd !== '' && reembolso_usd != null ? Number(reembolso_usd) : null,
      reembolso_en: devuelto && reembolso_en ? reembolso_en : null,
      ...(devuelto && !actual?.devuelto ? { devuelto_en: new Date().toISOString(), devuelto_por: sesionPut.id } : {}),
      ...(!devuelto ? { devuelto_en: null, devuelto_por: null } : {}),
    }
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update({ cliente_id, entrega_id, descripcion, lugar_compra, cantidad, fecha_compra,
      precio_usd, tipo_cambio, impuesto_pct, costo_mxn, precio_venta, utilidad, notas, estado, vendedor_id, categoria, apartado_fragil: apartado_fragil || false, imagen_url: imagen_url || null, tipo_empaque: tipo_empaque || null,
      // Solo se manda cuando el llamador lo especifica (Aprobar / Descartar en
      // "Por aprobar"). Si no viene en el body, no se toca — evita que un
      // guardado normal del resto del panel lo reinicie sin querer.
      ...(pendiente_aprobacion !== undefined ? { pendiente_aprobacion } : {}),
      ...camposDevolucion })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, pedido: data })
}

export async function DELETE(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'ID requerido' })

  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
