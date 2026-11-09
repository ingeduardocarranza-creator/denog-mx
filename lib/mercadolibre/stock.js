import { mlGet, mlPut, saleTermsConDias } from '@/lib/mercadolibre/api'

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
  // automatico: si el catálogo está en 0 NO se cambia nada; se avisa al admin para que decida.
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
    const libre = await cantidadParaML(supabase, pub.producto_id)
    if (libre > 0 && pub.sync_pendiente) await supabase.from('ml_publicaciones').update({ sync_pendiente: null }).eq('id', pub.id)
    if (libre === 0 && automatico) {
      if (!pub.sync_pendiente) await supabase.from('ml_publicaciones').update({ sync_pendiente: 'sin_stock' }).eq('id', pub.id)
      await registrar(true, pub.sync_pendiente === 'ignorado' ? 'Catálogo en 0 (dejada como está)' : 'Catálogo en 0: espera tu decisión', null, 0)
      return { ok: true, cantidad: 0, sinCambio: true, pendiente: true, mensaje: 'Catálogo en 0: espera tu decisión' }
    }
    if (libre === 0 && pub.sync_pendiente) await supabase.from('ml_publicaciones').update({ sync_pendiente: null }).eq('id', pub.id)
    const actual = await mlGet(token, `/items/${pub.item_id}`, { attributes: 'available_quantity,sale_terms,status' })
    const tieneDias = (actual.sale_terms || []).some(t => t.id === 'MANUFACTURING_TIME')
    const cuerpo = {}
    let modo, cantidad
    if (libre > 0) {
      // MODO 1 — con stock: igual al catálogo y entrega inmediata.
      modo = 'con_stock'; cantidad = libre
      if (actual.available_quantity !== cantidad) cuerpo.available_quantity = cantidad
      if (tieneDias) {
        const otros = saleTermsConDias(actual.sale_terms, 0).filter(t => t.id !== 'MANUFACTURING_TIME')
        cuerpo.sale_terms = otros.length ? otros : [{ id: 'MANUFACTURING_TIME', value_name: null }]
      }
    } else {
      // MODO 2 — bajo pedido: N piezas con X días de entrega.
      modo = 'bajo_pedido'; cantidad = Math.max(1, Number(pub.bajo_pedido_piezas) || 10)
      const dias = Math.max(1, Number(pub.bajo_pedido_dias) || 9)
      if (actual.available_quantity !== cantidad) cuerpo.available_quantity = cantidad
      const diasActuales = (actual.sale_terms || []).find(t => t.id === 'MANUFACTURING_TIME')
      if (!tieneDias || parseInt(diasActuales?.value_name, 10) !== dias) cuerpo.sale_terms = saleTermsConDias(actual.sale_terms, dias)
    }
    const antes = { stock_ml: actual.available_quantity, con_dias: tieneDias }
    if (!Object.keys(cuerpo).length) { await registrar(true, 'Ya estaba igual', antes, cantidad); return { ok: true, cantidad, modo, sinCambio: true, mensaje: 'Ya estaba igual' } }
    await mlPut(token, `/items/${pub.item_id}`, cuerpo)
    await supabase.from('ml_publicaciones').update({ stock_ml: cantidad, tiempo_preparacion: modo === 'bajo_pedido' ? Math.max(1, Number(pub.bajo_pedido_dias) || 9) : null }).eq('id', pub.id)
    const msg = modo === 'con_stock' ? `Con stock: ${cantidad} pieza(s), entrega inmediata.` : `Bajo pedido: ${cantidad} pieza(s), entrega en ${Math.max(1, Number(pub.bajo_pedido_dias) || 9)} días.`
    await registrar(true, msg, antes, `${modo}:${cantidad}`)
    return { ok: true, cantidad, modo, mensaje: msg }
  } catch (e) {
    const m = String(e.message || 'No se pudo').slice(0, 250)
    await registrar(false, m, null, null)
    return { ok: false, mensaje: m }
  }
}
