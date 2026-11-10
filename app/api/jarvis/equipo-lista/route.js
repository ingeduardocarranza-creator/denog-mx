import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { hoyLocal, sumarDias } from '@/lib/jarvis/plan'

export const dynamic = 'force-dynamic'

// El admin arma la lista de cada colaborador: agregar, editar, quitar, ordenar y mover.
// Los ids con "p:" son tareas del plan (puntuales); los demás son actividades fijas del turno.
const limpio = (t, n) => String(t ?? '').trim().slice(0, n)
const esPuntual = (id) => typeof id === 'string' && id.startsWith('p:')
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  const mal = (mensaje) => NextResponse.json({ ok: false, mensaje }, { status: 400 })
  try {
    const uid = String(body.usuario_id || '')

    if (body.accion === 'orden') {
      const items = Array.isArray(body.items) ? body.items.map(String).slice(0, 80) : []
      if (!uid || !items.length) return mal('Faltan datos')
      const { error } = await supabase.from('jarvis_orden_equipo')
        .upsert(items.map((item, i) => ({ usuario_id: uid, item, posicion: i })), { onConflict: 'usuario_id,item' })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.accion === 'agregar') {
      const titulo = limpio(body.titulo, 120)
      if (!uid || !titulo) return mal('Escribe qué hay que hacer')
      const { data: h } = await supabase.from('jarvis_horarios').select('usuario_id').eq('usuario_id', uid).limit(1)
      if (!h?.length) return mal('Esa persona no es colaborador de Jarvis')
      const { error } = await supabase.from('jarvis_tareas').insert({
        titulo, detalle: limpio(body.detalle, 300) || null, prioridad: 2, xp: 25,
        es_venta: !!body.es_venta, requiere_foto: !!body.requiere_foto, para_usuario: uid, creada_por: sesion.id,
        dia_unico: body.solo_hoy ? hoyLocal() : null,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    const id = String(body.id || '')
    if (!id) return mal('Falta la actividad')

    if (body.accion === 'editar') {
      const titulo = limpio(body.titulo, 120)
      if (!titulo) return mal('El nombre no puede quedar vacío')
      const detalle = limpio(body.detalle, 300) || null
      if (esPuntual(id)) {
        const { error } = await supabase.from('jarvis_tareas').update({ titulo, detalle, requiere_foto: !!body.requiere_foto }).eq('id', id.slice(2))
        if (error) throw new Error(error.message)
      } else {
        const cambios = { titulo, detalle }
        if (body.hora !== undefined && body.hora !== '') {
          if (!HORA.test(String(body.hora))) return mal('Hora no válida')
          cambios.hora = `${body.hora}:00`
        }
        if (body.meta !== undefined && body.meta !== null && body.meta !== '') {
          const meta = Math.round(Number(body.meta))
          if (!Number.isFinite(meta) || meta < 1 || meta > 50) return mal('La cantidad debe estar entre 1 y 50')
          cambios.meta = meta
        }
        const { error } = await supabase.from('jarvis_plantillas').update(cambios).eq('id', id).eq('para', 'colaborador')
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true })
    }

    if (body.accion === 'quitar') {
      const { error } = esPuntual(id)
        ? await supabase.from('jarvis_tareas').update({ activa: false }).eq('id', id.slice(2))
        : await supabase.from('jarvis_plantillas').update({ activa: false }).eq('id', id).eq('para', 'colaborador')
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.accion === 'mover') {
      if (!esPuntual(id)) return mal('Solo se pueden mover las actividades agregadas')
      const tid = id.slice(2)
      if (body.destino === 'manana') {
        const { data: t } = await supabase.from('jarvis_tareas').select('dia_unico').eq('id', tid).maybeSingle()
        const base = t?.dia_unico && t.dia_unico > hoyLocal() ? t.dia_unico : hoyLocal()
        const { error } = await supabase.from('jarvis_tareas').update({ dia_unico: sumarDias(base, 1) }).eq('id', tid)
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      const dest = String(body.destino || '')
      const { data: h } = await supabase.from('jarvis_horarios').select('usuario_id').eq('usuario_id', dest).limit(1)
      if (!h?.length) return mal('Esa persona no es colaborador de Jarvis')
      const { error } = await supabase.from('jarvis_tareas').update({ para_usuario: dest }).eq('id', tid)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    return mal('Acción no válida')
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
