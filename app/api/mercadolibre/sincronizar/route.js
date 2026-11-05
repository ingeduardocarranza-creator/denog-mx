import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import {
  clienteSupabaseServicio, obtenerAcceso, listarIdsPublicaciones, detallePublicaciones,
  filasDePublicacion, ligarPorSku, normalizarCodigo,
} from '@/lib/mercadolibre/api'

export const maxDuration = 60

// Trae las publicaciones de MercadoLibre y las liga con el catálogo por SKU.
// Respeta las ligas hechas a mano: solo recalcula las automáticas.
export async function POST(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()

  try {
    const { token, userId } = await obtenerAcceso(supabase)
    if (!userId) throw new Error('Falta el id de la cuenta de MercadoLibre; vuelve a conectar.')

    const ids = await listarIdsPublicaciones(token, userId)
    const todas = await detallePublicaciones(token, ids)
    // Las cerradas ya no se pueden reactivar ni vender: se dejan fuera (y si ya
    // estaban guardadas, se quitan de la lista en esta misma sincronización).
    const items = todas.filter(i => i.status !== 'closed')
    const cerradas = todas.length - items.length
    const filas = items.flatMap(filasDePublicacion)

    // Índice código → productos del catálogo (todos, activos o no, para no
    // perder la liga de una publicación cuyo producto está pausado).
    const { data: productos, error: errProd } = await supabase
      .from('productos_tienda')
      .select('id, codigo_barras')
    if (errProd) throw new Error(errProd.message)
    const indice = new Map()
    for (const p of productos || []) {
      const c = normalizarCodigo(p.codigo_barras)
      if (!c) continue
      if (!indice.has(c)) indice.set(c, [])
      indice.get(c).push(p)
    }

    // Ligas manuales ya existentes: no se pisan.
    const { data: existentes, error: errEx } = await supabase
      .from('ml_publicaciones')
      .select('item_id, variacion_id, producto_id, liga_estado, liga_manual')
    if (errEx) throw new Error(errEx.message)
    const manual = new Map()
    for (const e of existentes || []) if (e.liga_manual) manual.set(`${e.item_id}:${e.variacion_id}`, e)

    const ahora = new Date().toISOString()
    const aGuardar = filas.map(f => {
      const m = manual.get(`${f.item_id}:${f.variacion_id}`)
      const liga = m
        ? { liga_estado: m.liga_estado, producto_id: m.producto_id, liga_manual: true }
        : { ...ligarPorSku(f, indice), liga_manual: false }
      return { ...f, ...liga, sincronizado_en: ahora }
    })

    for (let i = 0; i < aGuardar.length; i += 100) {
      const { error } = await supabase
        .from('ml_publicaciones')
        .upsert(aGuardar.slice(i, i + 100), { onConflict: 'item_id,variacion_id' })
      if (error) throw new Error(error.message)
    }

    // Publicaciones que ya no existen en MercadoLibre se quitan de la lista.
    const vigentes = new Set(aGuardar.map(f => `${f.item_id}:${f.variacion_id}`))
    const aBorrar = (existentes || []).filter(e => !vigentes.has(`${e.item_id}:${e.variacion_id}`))
    for (const e of aBorrar) {
      await supabase.from('ml_publicaciones').delete().eq('item_id', e.item_id).eq('variacion_id', e.variacion_id)
    }

    const resumen = { publicaciones: items.length, cerradas, filas: aGuardar.length, quitadas: aBorrar.length }
    for (const f of aGuardar) resumen[f.liga_estado] = (resumen[f.liga_estado] || 0) + 1
    return NextResponse.json({ ok: true, resumen })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message || 'No se pudo sincronizar' })
  }
}
