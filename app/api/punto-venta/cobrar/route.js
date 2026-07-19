import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { construirVentaItems } from '@/lib/pos/tiendaUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  try {
    const {
      modo,
      clienteId,
      metodo1, monto1,
      metodo2, monto2,
      // modo1
      bloquesOrdenados,    // [{ entregaId, pedidoIds, totalPedidosBloque, anticiposDeEstaEntrega }]
      anticiposGenerales,  // [{ id, monto }]
      mercadito,           // [{ id, saldo }]
      carritoEncargoTienda,
      totalEncargoTienda,
      // modo2
      carritoVentaTienda,
      descuentoVentaTienda,
      clienteTiendaId,
    } = await req.json()

    const colaboradorId = sesion.id

    // Build the payment wallet
    const restante = {}
    if (monto1 > 0) restante[metodo1] = (restante[metodo1] || 0) + monto1
    if (monto2 > 0 && metodo2) restante[metodo2] = (restante[metodo2] || 0) + monto2

    const totalRestante = () => Object.values(restante).reduce((a, b) => a + b, 0)

    const aplicarPago = async (monto, campos) => {
      const insertados = []
      let porCubrir = monto
      for (const metodo of Object.keys(restante)) {
        if (porCubrir <= 0) break
        if (restante[metodo] <= 0) continue
        const usar = Math.min(restante[metodo], porCubrir)
        if (usar <= 0) continue
        const { data } = await supabase.from('pagos').insert({ ...campos, monto: usar, metodo }).select('id').single()
        insertados.push({ metodo, monto: usar, id: data?.id || null })
        restante[metodo] -= usar
        porCubrir -= usar
      }
      return insertados
    }

    if (modo === 'modo1' && clienteId) {
      // Track which general anticipos have been consumed across blocks
      const anticiposGeneralesMutables = (anticiposGenerales || []).map(a => ({ ...a }))

      for (const bloque of (bloquesOrdenados || [])) {
        const { entregaId, pedidoIds, totalPedidosBloque, anticiposDeEstaEntrega } = bloque
        if (!totalPedidosBloque || totalPedidosBloque === 0) continue

        // Consume anticipos of this delivery
        let netoBloque = totalPedidosBloque
        for (const anticipo of (anticiposDeEstaEntrega || [])) {
          if (netoBloque <= 0) break
          const montoAnticipo = Number(anticipo.monto)
          if (montoAnticipo <= netoBloque) {
            await supabase.from('pagos').delete().eq('id', anticipo.id)
            netoBloque -= montoAnticipo
          } else {
            await supabase.from('pagos').update({ monto: montoAnticipo - netoBloque }).eq('id', anticipo.id)
            netoBloque = 0
          }
        }

        // Consume general anticipos if still owed
        if (netoBloque > 0) {
          for (const anticipo of anticiposGeneralesMutables) {
            if (netoBloque <= 0) break
            const montoAnticipo = Number(anticipo.monto)
            if (montoAnticipo <= 0) continue
            if (montoAnticipo <= netoBloque) {
              await supabase.from('pagos').delete().eq('id', anticipo.id)
              netoBloque -= montoAnticipo
              anticipo.monto = 0
            } else {
              await supabase.from('pagos').update({ monto: montoAnticipo - netoBloque }).eq('id', anticipo.id)
              anticipo.monto = montoAnticipo - netoBloque
              netoBloque = 0
            }
          }
        }

        // Apply received payment to the remaining net
        if (netoBloque > 0 && totalRestante() > 0) {
          const montoAplicar = Math.min(totalRestante(), netoBloque)
          await aplicarPago(montoAplicar, {
            cliente_id: clienteId, entrega_id: entregaId, tipo: 'Venta Liquidación', vendedor_id: colaboradorId,
          })
        }
      }

      // Process mercadito orders
      for (const pm of (mercadito || [])) {
        let saldoPm = pm.saldo
        if (saldoPm > 0 && totalRestante() > 0) {
          const montoAplicar = Math.min(totalRestante(), saldoPm)
          await aplicarPago(montoAplicar, {
            cliente_id: clienteId, pedido_mercadito_id: pm.id, entrega_id: null, tipo: 'Venta Liquidación', vendedor_id: colaboradorId,
          })
          saldoPm -= montoAplicar
        }
        if (saldoPm <= 0.5) {
          await supabase.from('pedidos_mercadito').update({ estado: 'entregado', actualizado_en: new Date().toISOString() }).eq('id', pm.id)
        }
      }

      // Tienda items added during encargo
      if (carritoEncargoTienda?.length > 0 && totalRestante() > 0) {
        const montoAplicarTienda = Math.min(totalRestante(), totalEncargoTienda || 0)
        if (montoAplicarTienda > 0) {
          const pagosTienda = await aplicarPago(montoAplicarTienda, {
            cliente_id: clienteId, entrega_id: null, tipo: 'Venta Liquidación', vendedor_id: colaboradorId,
          })
          const detalleVenta = construirVentaItems(carritoEncargoTienda, { tipo: null, valor: 0 }, {
            pagoId: pagosTienda[0]?.id || null,
            vendedorId: colaboradorId,
          })
          if (pagosTienda[1]) detalleVenta.forEach(v => { v.pago_id_2 = pagosTienda[1].id })
          await supabase.from('ventas_tienda').insert(detalleVenta)
        }
      }

      // Leftover becomes a new anticipo
      if (totalRestante() > 0.5) {
        await aplicarPago(totalRestante(), {
          cliente_id: clienteId, entrega_id: null, tipo: 'Anticipo', vendedor_id: colaboradorId,
        })
      }

      // Mark pedidos as Entregado
      const todosLosIds = (bloquesOrdenados || []).flatMap(b => b.pedidoIds || [])
      for (const id of todosLosIds) {
        await supabase.from('pedidos').update({ estado: 'Entregado' }).eq('id', id)
      }

      // Update stock for tienda items in encargo
      for (const linea of (carritoEncargoTienda || [])) {
        if (linea.origen !== 'catalogo' || linea.stockDisponible == null) continue
        const nuevoStock = Math.max(0, linea.stockDisponible - linea.cantidad)
        await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', linea.productoId)
      }

    } else {
      // Modo tienda: simple payment + ventas_tienda
      const clienteIdTienda = clienteTiendaId ?? null
      const pagosTienda = await aplicarPago(totalRestante(), {
        cliente_id: clienteIdTienda || null, entrega_id: null, tipo: 'Venta Liquidación', vendedor_id: colaboradorId,
      })

      if (carritoVentaTienda?.length > 0) {
        const detalleVenta = construirVentaItems(carritoVentaTienda, descuentoVentaTienda || { tipo: null, valor: 0 }, {
          pagoId: pagosTienda[0]?.id || null,
          vendedorId: colaboradorId,
        })
        if (pagosTienda[1]) detalleVenta.forEach(v => { v.pago_id_2 = pagosTienda[1].id })
        await supabase.from('ventas_tienda').insert(detalleVenta)
      }

      // Update stock for tienda sale
      for (const linea of (carritoVentaTienda || [])) {
        if (linea.origen !== 'catalogo' || linea.stockDisponible == null) continue
        const nuevoStock = Math.max(0, linea.stockDisponible - linea.cantidad)
        await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', linea.productoId)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en cobro POS:', err)
    return NextResponse.json({ ok: false, mensaje: 'Error al procesar el cobro' }, { status: 500 })
  }
}
