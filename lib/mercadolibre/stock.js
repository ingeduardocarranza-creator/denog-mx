import { mlPut } from '@/lib/mercadolibre/api'

// Manda a MercadoLibre la cantidad disponible del catálogo.
// Cantidad = stock del catálogo − lo ya apartado para ventas de MercadoLibre que
// todavía no se empacan (MercadoLibre ya las descontó de su lado).
// Solo publicaciones LIGADAS a un producto y sin variantes. Nunca reactiva una
// publicación pausada: solo cambia la cantidad.

export async function cantidadParaML(supabase, productoId) {
  const { data: prod } = await supabase.from('productos_tienda').select('stock').eq('id', productoId).maybeSingle()
  const { data: ap } = await supabase.from('ml_venta_items').select('cantidad_reservada').eq('producto_id', productoId).eq('estado', 'reservado')
  const apartado = (ap || []).reduce((s, x) => s + (x.cantidad_reservada || 0), 0)
  return Math.max(0, (prod?.stock ?? 0) - apartado)
}

// pub: fila de ml_publicaciones. Devuelve { ok, cantidad, mensaje, sinCambio? }
export async function enviarStock(supabase, token, pub, { por = null, automatico = false } = {}) {
  const registrar = async (ok, mensaje, antes, valor) => {
    await supabase.from('ml_publicaciones').update({ sync_stock_en: new Date().toISOString(), sync_stock_msg: (mensaje || (ok ? 'OK' : 'Error')).slice(0, 200) }).eq('id', pub.id)
    if (ok || !automatico) {
      await supabase.from('ml_acciones').insert({ item_id: pub.item_id, accion: automatico ? 'stock_auto' : 'stock', valor: valor == null ? null : String(valor), antes: antes ?? null, ok, mensaje: mensaje || null, hecho_por: por })
    }
  }
  try {
    if (!pub.producto_id || pub.liga_estado !== 'ligada') throw new Error('La publicación no está ligada a un producto del catálogo.')
    if (pub.variacion_id) throw new Error('Tiene variantes: por ahora el stock de variantes se cambia en MercadoLibre.')
    if (!['active', 'paused'].includes(pub.estado_ml)) throw new Error(`Está en estado "${pub.estado_ml}"; no se toca.`)
    const cantidad = await cantidadParaML(supabase, pub.producto_id)
    if (pub.stock_ml === cantidad) { await registrar(true, 'Ya estaba igual', { stock_ml: pub.stock_ml }, cantidad); return { ok: true, cantidad, sinCambio: true, mensaje: 'Ya estaba igual' } }
    await mlPut(token, `/items/${pub.item_id}`, { available_quantity: cantidad })
    await supabase.from('ml_publicaciones').update({ stock_ml: cantidad }).eq('id', pub.id)
    const msg = cantidad === 0 ? 'Stock en 0: MercadoLibre pausará la publicación.' : `Stock enviado: ${cantidad}`
    await registrar(true, msg, { stock_ml: pub.stock_ml }, cantidad)
    return { ok: true, cantidad, mensaje: msg }
  } catch (e) {
    const m = String(e.message || 'No se pudo').slice(0, 250)
    await registrar(false, m, null, null)
    return { ok: false, mensaje: m }
  }
}
