// Armado del estado de cuenta por entrega.
//
// Funcion pura: recibe las filas crudas y devuelve la lista de clientes con sus
// grupos, lista para dibujar. La usan la pantalla del panel y el envio por
// WhatsApp, para que los dos calculen exactamente el mismo saldo.

export function armarPorEntrega({ pedidosDeLaEntrega, todosPedidos, todosPagos, entregas, clientes, entregaId }) {
  // Clientes que aparecen en la entrega seleccionada
  const clientesEnEntrega = new Set((pedidosDeLaEntrega || []).map(p => String(p.cliente_id)))
  if (clientesEnEntrega.size === 0) return []

  const pedidos = (todosPedidos || []).filter(p =>
    clientesEnEntrega.has(String(p.cliente_id)) && p.estado !== 'no_llego'
  )
  const pagos = (todosPagos || []).filter(p => clientesEnEntrega.has(String(p.cliente_id)))

  // cliente -> entrega -> { pedidos, pagos }
  const porCliente = {}
  const pagosSinGrupo = []

  pedidos.forEach(p => {
    const cid = String(p.cliente_id)
    if (!porCliente[cid]) porCliente[cid] = { nombre: p.clientes?.nombre || '', porEntrega: {} }
    const eid = String(p.entrega_id || 'sin')
    if (!porCliente[cid].porEntrega[eid]) porCliente[cid].porEntrega[eid] = { pedidos: [], pagos: [] }
    porCliente[cid].porEntrega[eid].pedidos.push(p)
  })

  pagos.forEach(p => {
    const cid = String(p.cliente_id)
    if (!porCliente[cid]) return
    const eid = String(p.entrega_id || 'sin')
    if (porCliente[cid].porEntrega[eid]) porCliente[cid].porEntrega[eid].pagos.push(p)
    else pagosSinGrupo.push({ cliente_id: cid, tipo: p.tipo, entrega_id: p.entrega_id, monto: p.monto })
  })

  const lista = Object.entries(porCliente).map(([id, d]) => {
    const cl = (clientes || []).find(c => String(c.id) === id)
    let grupos = Object.entries(d.porEntrega).map(([eid, data]) => ({
      entrega: (entregas || []).find(e => String(e.id) === eid) || null,
      pedidos: data.pedidos,
      pagos: data.pagos
    })).sort((a, b) => {
      if (!a.entrega) return 1
      if (!b.entrega) return -1
      return new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega)
    })

    // En entregas anteriores a la mas reciente, ocultar lo ya entregado: el
    // recordatorio solo debe mostrar lo pendiente de recoger. Si se esta
    // consultando una entrega vieja, se muestra todo (evidencia historica).
    const fechaMasReciente = grupos.reduce((max, g) => {
      if (!g.entrega) return max
      const f = new Date(g.entrega.fecha_entrega)
      return (!max || f > max) ? f : max
    }, null)
    const entregaConsultada = (entregas || []).find(e => String(e.id) === String(entregaId))
    const consultandoLaMasReciente = entregaConsultada && fechaMasReciente &&
      new Date(entregaConsultada.fecha_entrega).getTime() === fechaMasReciente.getTime()

    if (consultandoLaMasReciente) {
      grupos = grupos.map(g => {
        const esLaMasReciente = g.entrega && fechaMasReciente && new Date(g.entrega.fecha_entrega).getTime() === fechaMasReciente.getTime()
        if (esLaMasReciente) return g
        const pedidosPendientes = g.pedidos.filter(p => p.estado !== 'Entregado')
        const totalEntregadosOriginal = g.pedidos.filter(p => p.estado === 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
        if (pedidosPendientes.length === 0) return { ...g, pedidos: [], pagos: [] }
        return { ...g, pedidos: pedidosPendientes, totalEntregadosOriginal }
      }).filter(g => g.pedidos.length > 0 || g.pagos.length > 0)
    }

    return {
      cliente: { id, nombre: d.nombre || cl?.nombre || '', telefono: cl?.telefono || '' },
      grupos
    }
  }).sort((a, b) => a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'))

  lista.pagosSinGrupo = pagosSinGrupo
  return lista
}
