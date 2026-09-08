// Carga de datos del estado de cuenta, del lado del servidor.
//
// Trae exactamente las mismas filas que pide la pantalla del panel
// (/api/reportes/pedidos y /api/reportes/pagos) y las pasa por el mismo
// armarPorEntrega. Si esto se desviara, la imagen que enviamos por WhatsApp
// diria un saldo distinto al que ve el equipo en pantalla.

import { armarPorEntrega } from './armar'

// PostgREST corta en 1000 filas por respuesta.
async function todas(consulta) {
  const PAGE = 1000
  let filas = []
  let desde = 0
  for (;;) {
    const { data, error } = await consulta.range(desde, desde + PAGE - 1)
    if (error) throw new Error(error.message)
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return filas
    desde += PAGE
  }
}

export async function cargarEstadosDeCuenta(supabase, entregaId) {
  const qPedidos = () => supabase
    .from('pedidos')
    .select('*, clientes!pedidos_cliente_id_fkey(nombre, telefono)')
    .eq('pendiente_aprobacion', false)   // los borradores de WhatsApp no son cuenta
    .order('creado_en')

  const [pedidosDeLaEntrega, todosPedidos, todosPagos, entregasRes, clientesRes] = await Promise.all([
    todas(qPedidos().eq('entrega_id', entregaId)),
    todas(qPedidos()),
    // Sin los envíos: el estado de cuenta es de la mercancía. El domicilio se
    // cobra y se reporta aparte.
    todas(supabase.from('pagos').select('*, clientes!pagos_cliente_id_fkey(nombre)').neq('tipo', 'Envío').order('creado_en')),
    supabase.from('entregas').select('*'),
    supabase.from('clientes').select('id, nombre, telefono, rol, codigo_recoleccion'),
  ])

  if (entregasRes.error) throw new Error(entregasRes.error.message)
  if (clientesRes.error) throw new Error(clientesRes.error.message)

  return armarPorEntrega({
    pedidosDeLaEntrega,
    todosPedidos,
    todosPagos,
    entregas: entregasRes.data || [],
    clientes: clientesRes.data || [],
    entregaId,
  })
}
