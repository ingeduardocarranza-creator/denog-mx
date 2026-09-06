import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { construirVentaItems } from '@/lib/pos/tiendaUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Hora de Hermosillo en el formato que guarda la base (timestamp sin zona).
// `new Date().toISOString()` guardaria UTC y los cobros de la tarde saldrian
// con fecha del dia siguiente.
function horaLocal() {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Hermosillo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
  return p.replace(' ', 'T')
}

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
      vendedorTiendaId,
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
      // Verify order totals from DB — never trust client-supplied totalPedidosBloque
      const todosLosPedidoIds = (bloquesOrdenados || []).flatMap(b => b.pedidoIds || [])
      const { data: pedidosDB } = await supabase
        .from('pedidos')
        .select('id, precio_venta, entrega_id')
        .in('id', todosLosPedidoIds)
      const precioPorPedido = Object.fromEntries((pedidosDB || []).map(p => [p.id, p.precio_venta || 0]))

      // Los anticipos se releen de la base, igual que los precios: el monto que
      // manda la pantalla sirve para pintar, no para decidir dinero.
      const idsAnticipos = [
        ...(bloquesOrdenados || []).flatMap(b => (b.anticiposDeEstaEntrega || []).map(a => a.id)),
        ...(anticiposGenerales || []).map(a => a.id),
      ].filter(Boolean)
      const { data: anticiposDB } = idsAnticipos.length
        ? await supabase.from('pagos').select('id, cliente_id, entrega_id, monto, metodo, tipo').in('id', idsAnticipos)
        : { data: [] }
      const anticipoPorId = Object.fromEntries(
        (anticiposDB || [])
          .filter(a => a.tipo === 'Anticipo' && a.cliente_id === clienteId)
          .map(a => [a.id, { ...a, monto: Number(a.monto) || 0 }])
      )

      // La cuenta de cada entrega, tal como la ven el estado de cuenta y la
      // pantalla de Anticipos: TODO lo que vale la entrega menos TODOS sus
      // pagos. Se relee de la base entera, no solo lo que se esta cobrando
      // ahora, porque una entrega se puede cobrar en dos vueltas.
      const idsBloques = [...new Set((bloquesOrdenados || []).map(b => b.entregaId).filter(Boolean))]
      const yaEntregado = {}   // por entrega: mercancia que ya se llevo
      const pagadoEntrega = {} // por entrega: todo lo que ya abono ahi
      if (idsBloques.length > 0) {
        const [{ data: pedsEntrega }, { data: pagosEntrega }] = await Promise.all([
          supabase.from('pedidos')
            .select('entrega_id, precio_venta')
            .eq('cliente_id', clienteId)
            .eq('pendiente_aprobacion', false)
            .eq('estado', 'Entregado')
            .in('entrega_id', idsBloques),
          // El envío se excluye a propósito: es un servicio, no mercancía.
          supabase.from('pagos')
            .select('entrega_id, monto')
            .eq('cliente_id', clienteId)
            .neq('tipo', 'Envío')
            .in('entrega_id', idsBloques),
        ])
        for (const x of (pedsEntrega || [])) {
          yaEntregado[x.entrega_id] = (yaEntregado[x.entrega_id] || 0) + Number(x.precio_venta || 0)
        }
        for (const x of (pagosEntrega || [])) {
          pagadoEntrega[x.entrega_id] = (pagadoEntrega[x.entrega_id] || 0) + Number(x.monto || 0)
        }
      }

      // ── Candado: nada que no esté en tienda se cobra ──────────────────
      // Una entrega "en proceso" es mercancía que todavía no llegó. Cobrarla
      // por accidente deja al cliente pagado y sin producto, y descuadra la
      // caja del día. Se revisa aquí, antes de escribir un solo pago: si algo
      // viene mal, no se hace nada. Las pantallas ya lo bloquean, pero esta es
      // la barrera que ninguna pantalla puede saltar.
      const idsEntregasCobradas = [...new Set((pedidosDB || []).map(p => p.entrega_id).filter(Boolean))]
      if (idsEntregasCobradas.length > 0) {
        const { data: entregasDB } = await supabase
          .from('entregas')
          .select('id, fecha_entrega, estado')
          .in('id', idsEntregasCobradas)
        const noEnTienda = (entregasDB || []).filter(e => e.estado !== 'en_tienda')
        if (noEnTienda.length > 0) {
          const fechas = noEnTienda.map(e => e.fecha_entrega).join(', ')
          return NextResponse.json({
            ok: false,
            mensaje: `No se puede cobrar: la entrega del ${fechas} todavía no está en tienda. Marca la entrega como "En tienda" antes de cobrarla.`,
          }, { status: 409 })
        }
      }

      for (const bloque of (bloquesOrdenados || [])) {
        const { entregaId, pedidoIds } = bloque

        // Calculate verified total from DB prices (ignores client-supplied value)
        const totalVerificado = (pedidoIds || []).reduce((s, id) => s + (precioPorPedido[id] || 0), 0)
        if (!totalVerificado || totalVerificado === 0) continue

        // Lo que falta por cobrar de ESTA entrega, no solo de lo que se esta
        // entregando en este momento:
        //
        //   (mercancia ya entregada + la que se entrega ahora) - todo lo pagado
        //
        // Los anticipos de la entrega ya estan dentro de `pagadoEntrega`, asi
        // que descuentan solos y NO hay que tocarlos. Antes se "gastaban"
        // borrando la fila: eso hacia desaparecer el dinero del registro y,
        // ademas, una entrega cobrada en dos vueltas descontaba el mismo
        // anticipo dos veces porque la segunda vuelta solo miraba lo que se
        // estaba entregando.
        let netoBloque = Math.max(
          0,
          (yaEntregado[entregaId] || 0) + totalVerificado - (pagadoEntrega[entregaId] || 0)
        )

        // Un anticipo general (sin entrega) si se mueve, pero para atribuirlo:
        // se le pone la entrega que esta pagando. Si solo se usa una parte, se
        // parte en dos filas — la suma de `pagos` no cambia nunca.
        for (const ref of (anticiposGenerales || [])) {
          if (netoBloque <= 0) break
          const a = anticipoPorId[ref.id]
          if (!a || a.monto <= 0 || a.entrega_id) continue
          const usar = Math.min(a.monto, netoBloque)
          if (usar >= a.monto) {
            await supabase.from('pagos').update({ entrega_id: entregaId }).eq('id', a.id)
            a.entrega_id = entregaId
          } else {
            await supabase.from('pagos').update({ monto: a.monto - usar }).eq('id', a.id)
            await supabase.from('pagos').insert({
              cliente_id: clienteId, entrega_id: entregaId, tipo: 'Anticipo',
              monto: usar, metodo: a.metodo, vendedor_id: colaboradorId,
            })
          }
          a.monto -= usar
          netoBloque -= usar
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

      // Mark pedidos as Entregado. `entregado_en` es el dia real en que el
      // cliente se llevo la mercancia — no se puede deducir despues: si el
      // anticipo cubria todo, no queda ni un pago con esa fecha. Hora local de
      // Hermosillo, misma convencion que pagos.creado_en.
      const entregadoEn = horaLocal()
      const todosLosIds = (bloquesOrdenados || []).flatMap(b => b.pedidoIds || [])
      for (const id of todosLosIds) {
        await supabase.from('pedidos').update({ estado: 'Entregado', entregado_en: entregadoEn }).eq('id', id)
      }

      // Update stock for tienda items in encargo — re-query DB stock to avoid client manipulation
      const idsEncargo = (carritoEncargoTienda || []).filter(l => l.origen === 'catalogo' && l.productoId).map(l => l.productoId)
      if (idsEncargo.length > 0) {
        const { data: stocksEncargo } = await supabase.from('productos_tienda').select('id, stock').in('id', idsEncargo)
        const stockMapEncargo = Object.fromEntries((stocksEncargo || []).map(p => [p.id, p.stock ?? 0]))
        for (const linea of (carritoEncargoTienda || [])) {
          if (linea.origen !== 'catalogo' || !linea.productoId) continue
          const nuevoStock = Math.max(0, (stockMapEncargo[linea.productoId] ?? 0) - linea.cantidad)
          await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', linea.productoId)
        }
      }

    } else {
      // Modo tienda: simple payment + ventas_tienda
      const clienteIdTienda = clienteTiendaId ?? null
      const vendedorIdTienda = vendedorTiendaId ?? colaboradorId
      const pagosTienda = await aplicarPago(totalRestante(), {
        cliente_id: clienteIdTienda || null, entrega_id: null, tipo: 'Venta Liquidación', vendedor_id: vendedorIdTienda,
      })

      if (carritoVentaTienda?.length > 0) {
        const detalleVenta = construirVentaItems(carritoVentaTienda, descuentoVentaTienda || { tipo: null, valor: 0 }, {
          pagoId: pagosTienda[0]?.id || null,
          vendedorId: vendedorIdTienda,
        })
        if (pagosTienda[1]) detalleVenta.forEach(v => { v.pago_id_2 = pagosTienda[1].id })
        await supabase.from('ventas_tienda').insert(detalleVenta)
      }

      // Update stock for tienda sale — re-query DB stock to avoid client manipulation
      const idsTienda = (carritoVentaTienda || []).filter(l => l.origen === 'catalogo' && l.productoId).map(l => l.productoId)
      if (idsTienda.length > 0) {
        const { data: stocksTienda } = await supabase.from('productos_tienda').select('id, stock').in('id', idsTienda)
        const stockMapTienda = Object.fromEntries((stocksTienda || []).map(p => [p.id, p.stock ?? 0]))
        for (const linea of (carritoVentaTienda || [])) {
          if (linea.origen !== 'catalogo' || !linea.productoId) continue
          const nuevoStock = Math.max(0, (stockMapTienda[linea.productoId] ?? 0) - linea.cantidad)
          await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', linea.productoId)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en cobro POS:', err)
    return NextResponse.json({ ok: false, mensaje: 'Error al procesar el cobro' }, { status: 500 })
  }
}
