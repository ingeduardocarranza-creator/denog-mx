import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Checkout del Mercadito: crea el pedido y descuenta stock de forma atómica
// (vía mercadito_descontar_stock, ver db/migrations/2026-07-10_mercadito.sql)
// para que dos clientes comprando la última pieza al mismo tiempo no
// sobrevendan. Si alguna línea falla a mitad del proceso, revierte las que
// ya se habían descontado.
export async function POST(req) {
  try {
    const body = await req.json()
    const { items, cliente_id, invitado } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, mensaje: 'El carrito está vacío.' })
    }
    if (!cliente_id && !(invitado?.nombre && invitado?.telefono)) {
      return NextResponse.json({ ok: false, mensaje: 'Falta identificar al cliente o los datos de invitado.' })
    }

    const ids = items.map((it) => it.producto_id)
    const { data: productos, error: errProductos } = await supabase
      .from('productos_tienda')
      .select('id, nombre, precio_venta, stock')
      .in('id', ids)
    if (errProductos) return NextResponse.json({ ok: false, mensaje: errProductos.message })

    const productosPorId = Object.fromEntries((productos || []).map((p) => [p.id, p]))

    const descontados = []
    for (const it of items) {
      const producto = productosPorId[it.producto_id]
      if (!producto) {
        await revertir(descontados)
        return NextResponse.json({ ok: false, mensaje: 'Uno de los productos ya no existe en el catálogo.' })
      }
      const { data: exito, error: errRpc } = await supabase.rpc('mercadito_descontar_stock', {
        p_producto_id: it.producto_id,
        p_cantidad: it.cantidad,
      })
      if (errRpc || !exito) {
        await revertir(descontados)
        return NextResponse.json({ ok: false, mensaje: `Ya no hay suficiente stock de "${producto.nombre}". Actualiza tu carrito.` })
      }
      descontados.push({ producto_id: it.producto_id, cantidad: it.cantidad })
    }

    const itemsSnapshot = items.map((it) => {
      const producto = productosPorId[it.producto_id]
      return {
        producto_id: it.producto_id,
        nombre: producto.nombre,
        precio_unitario: Number(producto.precio_venta) || 0,
        cantidad: it.cantidad,
        apartado_fragil: false,
      }
    })

    const actorLabel = cliente_id ? 'Pedido recibido desde el sitio web' : 'Pedido recibido desde el sitio web (invitado)'

    const { data: pedido, error: errInsert } = await supabase
      .from('pedidos_mercadito')
      .insert([{
        cliente_id: cliente_id || null,
        invitado_nombre: invitado?.nombre || null,
        invitado_telefono: invitado?.telefono || null,
        items: itemsSnapshot,
        estado: 'nuevo',
        historial: [{ ts: new Date().toISOString(), label: actorLabel, actor_id: null }],
        notas_internas: [],
      }])
      .select()
      .single()

    if (errInsert) {
      await revertir(descontados)
      return NextResponse.json({ ok: false, mensaje: errInsert.message })
    }

    return NextResponse.json({ ok: true, pedido })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}

async function revertir(descontados) {
  for (const d of descontados) {
    await supabase.rpc('mercadito_restituir_stock', { p_producto_id: d.producto_id, p_cantidad: d.cantidad })
  }
}
