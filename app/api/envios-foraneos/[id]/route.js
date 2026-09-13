import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { revertirAtribucionEnvioForaneo } from '@/lib/enviosForaneos/atribuirAnticipos'

// Editar un envío foráneo mientras sigue en borrador. Una vez aprobado, su
// costo ya se atribuyó contra anticipos (ver /aprobar) -- cambiarlo aquí
// después descuadraría esa atribución, así que solo se permite mientras es
// borrador.
export async function PATCH(req, { params }) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await params

  const { data: actual } = await supabase.from('envios_foraneos').select('estado').eq('id', id).single()
  if (!actual) return NextResponse.json({ ok: false, mensaje: 'No se encontró el envío' })
  if (actual.estado !== 'borrador') {
    return NextResponse.json({ ok: false, mensaje: 'Ya fue aprobado -- no se puede editar desde aquí.' })
  }

  const body = await req.json()
  const campos = {}
  for (const k of ['entrega_ids', 'paqueteria', 'numero_guia', 'costo_envio', 'skydropx_shipment_id', 'notas']) {
    if (k in body) campos[k] = body[k]
  }
  if (campos.costo_envio != null) campos.costo_envio = Number(campos.costo_envio)

  const { data, error } = await supabase.from('envios_foraneos').update(campos).eq('id', id).select().single()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, envio: data })
}

// Cancelar un envío foráneo.
//   - Si sigue en borrador: no hay dinero atribuido todavía, cualquier staff
//     puede cancelarlo.
//   - Si ya fue aprobado o notificado: ya movió dinero (atribuyó anticipos
//     del cliente). Cancelarlo lo revierte -- los pagos regresan a ser
//     anticipo general (ver revertirAtribucionEnvioForaneo) -- así que solo
//     un administrador puede hacerlo.
export async function DELETE(req, { params }) {
  const sesionStaff = requerirStaff(req)
  if (!sesionStaff) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { id } = await params

  const supabaseInicial = supabaseConSesion(sesionStaff)
  const { data: actual } = await supabaseInicial.from('envios_foraneos').select('estado').eq('id', id).single()
  if (!actual) return NextResponse.json({ ok: false, mensaje: 'No se encontró el envío' })

  if (actual.estado === 'cancelado') {
    return NextResponse.json({ ok: false, mensaje: 'Este envío ya está cancelado.' })
  }

  if (actual.estado === 'borrador') {
    const { error } = await supabaseInicial.from('envios_foraneos').update({ estado: 'cancelado' }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true })
  }

  // aprobado o notificado: ya hay dinero atribuido -- solo admin.
  const sesion = requerirAdmin(req)
  if (!sesion) {
    return NextResponse.json({ ok: false, mensaje: 'Solo un administrador puede cancelar un envío ya aprobado.' }, { status: 403 })
  }
  const supabase = supabaseConSesion(sesion)
  try {
    await revertirAtribucionEnvioForaneo(supabase, id)
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: err.message })
  }
  const { error } = await supabase.from('envios_foraneos').update({ estado: 'cancelado' }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
