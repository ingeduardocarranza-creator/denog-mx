import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes, vistaPaquete } from '@/lib/mercadolibre/empaque'

// "Se sustituye por": en lugar del producto vendido se manda otro(s) del
// catálogo. El stock se descuenta de lo que sí se mandó al verificar la
// etiqueta (función ml_empacar_paquete). Queda registro de quién fue.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const itemRow = Number(b.item_row_id)
  const lista = Array.isArray(b.productos) ? b.productos : []
  if (!b.paquete || !Number.isInteger(itemRow) || !lista.length || lista.length > 10) {
    return NextResponse.json({ ok: false, mensaje: 'Datos incompletos' }, { status: 400 })
  }
  const por = sesion.nombre || String(sesion.id)

  // Une repetidos y valida cantidades.
  const mapa = new Map()
  for (const x of lista) {
    const id = Number(x.producto_id), c = Number(x.cantidad)
    if (!Number.isInteger(id) || !Number.isInteger(c) || c < 1 || c > 999) return NextResponse.json({ ok: false, mensaje: 'Cantidad inválida' }, { status: 400 })
    mapa.set(id, (mapa.get(id) || 0) + c)
  }

  const supabase = clienteSupabaseServicio()
  try {
    const p = (await cargarPaquetes(supabase)).find(x => x.paquete === String(b.paquete))
    if (!p || !p.listo || !p.etiqueta_lista) return NextResponse.json({ ok: false, mensaje: 'Este paquete todavía no se puede empacar' })
    const item = p.items.find(i => i.id === itemRow)
    if (!item) return NextResponse.json({ ok: false, mensaje: 'Ese producto no está en este paquete' })

    const { data: prods } = await supabase.from('productos_tienda').select('id, nombre, stock, activo').in('id', [...mapa.keys()])
    const falta = []
    for (const [id, c] of mapa) {
      const pr = (prods || []).find(x => x.id === id)
      if (!pr) return NextResponse.json({ ok: false, mensaje: 'Un producto ya no existe en el catálogo' })
      if (pr.stock < c) falta.push(`${pr.nombre} (hay ${pr.stock})`)
    }
    if (falta.length) return NextResponse.json({ ok: false, mensaje: `No hay stock suficiente de: ${falta.join(', ')}` })

    const { data: fila } = await supabase.from('ml_venta_items').select('id, titulo, cantidad, producto_id').eq('id', itemRow).single()
    await supabase.from('ml_sustituciones').delete().eq('venta_item_id', itemRow)
    await supabase.from('ml_sustituciones').insert([...mapa].map(([producto_id, cantidad]) => ({
      venta_item_id: itemRow, paquete: p.paquete, producto_id, cantidad, hecho_por: por,
    })))
    // El producto vendido se da por cubierto y se libera su apartado.
    await supabase.from('ml_venta_items').update({ cantidad_escaneada: fila.cantidad, cantidad_reservada: 0 }).eq('id', itemRow)
    await supabase.from('ml_eventos').insert({
      paquete: p.paquete, tipo: 'sustitucion',
      detalle: { item_row: itemRow, vendido: fila.titulo, vendido_producto_id: fila.producto_id, enviado: (prods || []).map(x => ({ producto_id: x.id, nombre: x.nombre, cantidad: mapa.get(x.id) })) },
      hecho_por: por,
    })
    const nuevo = (await cargarPaquetes(supabase)).find(x => x.paquete === p.paquete)
    return NextResponse.json({ ok: true, paquete: nuevo ? vistaPaquete(nuevo) : null })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
