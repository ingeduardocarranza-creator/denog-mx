import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirDuenoOStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  if (!requerirDuenoOStaff(req, cliente_id)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const [{ data, error }, { data: cli, error: cliErr }] = await Promise.all([
    supabase.from('direcciones_clientes').select('*').eq('cliente_id', cliente_id).order('creado_en', { ascending: false }),
    supabase.from('clientes').select('nombre, celular_contacto, telefono').eq('id', cliente_id).single(),
  ])

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  if (cliErr) return NextResponse.json({ ok: false, mensaje: 'Error leyendo cliente: ' + cliErr.message })

  const perfil = { nombre: cli?.nombre || '', celular: cli?.celular_contacto?.trim() || cli?.telefono?.trim() || '' }

  // Auto-migrar dirección legacy de clientes si la nueva tabla está vacía
  if (data.length === 0) {
    if (cli?.direccion?.trim()) {
      const { data: migrada, error: insErr } = await supabase
        .from('direcciones_clientes')
        .insert({
          cliente_id,
          alias: 'Mi dirección',
          direccion: cli.direccion.trim(),
          colonia: cli.colonia?.trim() || '',
          referencias: cli.referencias?.trim() || null,
          celular_contacto: cli.celular_contacto?.trim() || null,
        })
        .select()
        .single()

      if (insErr) return NextResponse.json({ ok: false, mensaje: 'Error migrando dirección: ' + insErr.message })
      if (migrada) return NextResponse.json({ ok: true, direcciones: [migrada], perfil })
    } else {
      return NextResponse.json({ ok: true, direcciones: [], perfil })
    }
  }

  return NextResponse.json({ ok: true, direcciones: data, perfil })
}

export async function POST(req) {
  const { cliente_id, alias, direccion, colonia, referencias, celular_contacto } = await req.json()
  if (!requerirDuenoOStaff(req, String(cliente_id))) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  if (!direccion?.trim() || !colonia?.trim()) return NextResponse.json({ ok: false, mensaje: 'Dirección y colonia son obligatorias' })

  const { data, error } = await supabase
    .from('direcciones_clientes')
    .insert({ cliente_id, alias: alias?.trim() || null, direccion: direccion.trim(), colonia: colonia.trim(), referencias: referencias?.trim() || null, celular_contacto: celular_contacto?.trim() || null })
    .select().single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, direccion: data })
}

export async function PATCH(req) {
  const { id, cliente_id, alias, direccion, colonia, referencias, celular_contacto } = await req.json()
  if (!requerirDuenoOStaff(req, String(cliente_id))) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  if (!direccion?.trim() || !colonia?.trim()) return NextResponse.json({ ok: false, mensaje: 'Dirección y colonia son obligatorias' })

  const { data, error } = await supabase
    .from('direcciones_clientes')
    .update({ alias: alias?.trim() || null, direccion: direccion.trim(), colonia: colonia.trim(), referencias: referencias?.trim() || null, celular_contacto: celular_contacto?.trim() || null })
    .eq('id', id)
    .eq('cliente_id', cliente_id)
    .select().single()

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, direccion: data })
}

export async function DELETE(req) {
  const { id, cliente_id } = await req.json()
  if (!requerirDuenoOStaff(req, String(cliente_id))) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { error } = await supabase
    .from('direcciones_clientes')
    .delete()
    .eq('id', id)
    .eq('cliente_id', cliente_id)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
