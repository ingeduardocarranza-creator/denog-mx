import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// POST /api/cobranza/seguimiento
//   { cliente_id, accion: 'pausar', fecha, nota }
//   { cliente_id, accion: 'quitar_pausa' }
//   { cliente_id, accion: 'promesa', fecha, nota }
//   { cliente_id, accion: 'quitar_promesa' }
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { cliente_id, accion, fecha, nota } = await req.json().catch(() => ({}))
  if (!cliente_id) return NextResponse.json({ ok: false, mensaje: 'Falta cliente_id' }, { status: 400 })

  let cambios
  if (accion === 'pausar' || accion === 'promesa') {
    if (!FECHA.test(String(fecha || ''))) return NextResponse.json({ ok: false, mensaje: 'Elige una fecha' }, { status: 400 })
    const texto = String(nota || '').trim().slice(0, 300) || null
    cambios = accion === 'pausar'
      ? { pausado_hasta: fecha, pausa_nota: texto }
      : { promesa_fecha: fecha, promesa_nota: texto }
  } else if (accion === 'quitar_pausa') {
    cambios = { pausado_hasta: null, pausa_nota: null }
  } else if (accion === 'quitar_promesa') {
    cambios = { promesa_fecha: null, promesa_nota: null }
  } else {
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  }

  const supabase = supabaseConSesion(sesion)
  const { error } = await supabase.from('cobranza_seguimiento').upsert({
    cliente_id, ...cambios, actualizado_por: sesion.id || null, actualizado_en: new Date().toISOString(),
  }, { onConflict: 'cliente_id' })
  if (error) return NextResponse.json({ ok: false, mensaje: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
