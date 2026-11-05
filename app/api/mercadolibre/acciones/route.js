import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import {
  clienteSupabaseServicio, obtenerAcceso, mlGet, mlPut, saleTermsConDias,
} from '@/lib/mercadolibre/api'

export const maxDuration = 60

// Cambios en tus publicaciones de MercadoLibre. Solo admin, y solo sobre
// publicaciones que ya están en tu lista.
//
// POST { acciones: [{ item_id, accion: 'pausar' | 'dias_entrega', dias? }] }
//   · pausar        → pone la publicación en pausa (se puede reactivar)
//   · dias_entrega  → pone el "tiempo de disponibilidad de stock" (días)
//
// Cada cambio se guarda en ml_acciones con cómo estaba antes. Devuelve el
// resultado de cada una por separado: si una falla, las demás siguen.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  let cuerpo
  try { cuerpo = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const acciones = Array.isArray(cuerpo?.acciones) ? cuerpo.acciones : null
  if (!acciones || acciones.length === 0 || acciones.length > 25) {
    return NextResponse.json({ ok: false, mensaje: 'Manda de 1 a 25 cambios por vez' }, { status: 400 })
  }
  for (const a of acciones) {
    const dias = Number(a?.dias)
    const valida = /^MLM\d+$/.test(String(a?.item_id || '')) && (
      a.accion === 'pausar' || (a.accion === 'dias_entrega' && Number.isInteger(dias) && dias >= 1 && dias <= 60)
    )
    if (!valida) return NextResponse.json({ ok: false, mensaje: 'Hay un cambio con datos inválidos' }, { status: 400 })
  }

  const supabase = clienteSupabaseServicio()
  let token
  try { ({ token } = await obtenerAcceso(supabase)) } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }

  const resultados = []
  for (const a of acciones) {
    const item_id = String(a.item_id)
    const registrar = async (ok, mensaje, antes, valor) => {
      await supabase.from('ml_acciones').insert({ item_id, accion: a.accion, valor: valor ?? null, antes: antes ?? null, ok, mensaje: mensaje || null, hecho_por: sesion.id })
      resultados.push({ item_id, accion: a.accion, ok, mensaje: mensaje || '' })
    }
    try {
      const { data: filas, error } = await supabase
        .from('ml_publicaciones').select('estado_ml, tiempo_preparacion').eq('item_id', item_id)
      if (error) throw new Error(error.message)
      if (!filas?.length) throw new Error('Esa publicación no está en tu lista; sincroniza primero.')
      const antes = { estado_ml: filas[0].estado_ml, tiempo_preparacion: filas[0].tiempo_preparacion }

      if (a.accion === 'pausar') {
        if (antes.estado_ml !== 'paused') await mlPut(token, `/items/${item_id}`, { status: 'paused' })
        await supabase.from('ml_publicaciones').update({ estado_ml: 'paused' }).eq('item_id', item_id)
        await registrar(true, antes.estado_ml === 'paused' ? 'Ya estaba pausada' : '', antes, 'paused')
      } else {
        const dias = Number(a.dias)
        const actual = await mlGet(token, `/items/${item_id}`, { attributes: 'sale_terms,status' })
        if (actual.status !== 'active') throw new Error(`La publicación está en estado "${actual.status}", no activa.`)
        await mlPut(token, `/items/${item_id}`, { sale_terms: saleTermsConDias(actual.sale_terms, dias) })
        await supabase.from('ml_publicaciones').update({ tiempo_preparacion: dias }).eq('item_id', item_id)
        await registrar(true, '', antes, String(dias))
      }
    } catch (e) {
      await registrar(false, String(e.message || 'No se pudo').slice(0, 300), null, a.dias != null ? String(a.dias) : null)
    }
  }
  return NextResponse.json({ ok: true, resultados })
}
