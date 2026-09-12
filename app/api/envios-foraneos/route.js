import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// Lista y crea envíos foráneos (paquetería dentro del país, distinto de
// domicilio local). Ver claude/envios-foraneos-plan.md para el diseño
// completo: por qué es tabla aparte, y cómo el costo entra a Anticipos.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const cliente_id = searchParams.get('cliente_id')

  let query = supabase
    .from('envios_foraneos')
    .select('*, clientes!envios_foraneos_cliente_id_fkey(nombre, telefono)')
    .order('creado_en', { ascending: false })

  if (estado) query = query.eq('estado', estado)
  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, envios: data })
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { cliente_id, entrega_ids, paqueteria, numero_guia, costo_envio, skydropx_shipment_id, notas } = await req.json()

  if (!cliente_id) return NextResponse.json({ ok: false, mensaje: 'Falta el cliente' })

  const { data, error } = await supabase
    .from('envios_foraneos')
    .insert({
      cliente_id,
      entrega_ids: Array.isArray(entrega_ids) ? entrega_ids : [],
      paqueteria: paqueteria || null,
      numero_guia: numero_guia || null,
      costo_envio: Number(costo_envio || 0),
      skydropx_shipment_id: skydropx_shipment_id || null,
      notas: notas || null,
      estado: 'borrador',
      vendedor_id: sesion.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, envio: data })
}
