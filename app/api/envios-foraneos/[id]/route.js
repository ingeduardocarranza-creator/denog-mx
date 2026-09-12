import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

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

// Cancelar un borrador. Si ya se aprobó (ya hay dinero atribuido), no se
// borra por aquí -- eso necesitaría devolver la atribución, y por ahora se
// maneja a mano igual que cualquier corrección de dinero delicada.
export async function DELETE(req, { params }) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await params

  const { data: actual } = await supabase.from('envios_foraneos').select('estado').eq('id', id).single()
  if (!actual) return NextResponse.json({ ok: false, mensaje: 'No se encontró el envío' })
  if (actual.estado !== 'borrador') {
    return NextResponse.json({ ok: false, mensaje: 'Ya fue aprobado -- ya tiene dinero atribuido, no se puede cancelar desde aquí.' })
  }

  const { error } = await supabase.from('envios_foraneos').update({ estado: 'cancelado' }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
