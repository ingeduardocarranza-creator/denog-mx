import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { hoyLocal, sumarDias, dowDe, NADIE } from '@/lib/jarvis/plan'
import { revisionDelDia, semanaDe } from '@/lib/jarvis/revision'

export const dynamic = 'force-dynamic'

// Admin: ?fecha=AAAA-MM-DD  → qué hizo y qué no cada colaborador ese día.
// Colaborador: ?mia=1       → su día anterior y la retroalimentación del admin.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const url = new URL(req.url)
  const hoy = hoyLocal()
  try {
    if (url.searchParams.get('mia')) {
      // Último día con turno antes de hoy (hasta 7 días atrás)
      const { data: ho } = await supabase.from('jarvis_horarios').select('dia').eq('usuario_id', sesion.id)
      let ayer = null
      for (let i = 1; i <= 7; i++) {
        const f = sumarDias(hoy, -i)
        if (!(ho || []).some(h => h.dia === dowDe(f))) continue
        const r = await revisionDelDia(supabase, { usuarioId: sesion.id, fecha: f })
        if (r.resumen.total > 0) {
          ayer = {
            fecha: f, hechas: r.resumen.hechas, total: r.resumen.total, ventas: r.ventas,
            faltaron: [...r.puntuales, ...r.fijas].filter(t => t.estado === 'falto').map(t => t.titulo).slice(0, 4),
          }
          break
        }
      }
      const { data: com } = await supabase.from('jarvis_comentarios').select('id, fecha, valoracion, comentario, leido_en')
        .eq('usuario_id', sesion.id).gte('fecha', sumarDias(hoy, -7)).order('fecha', { ascending: false }).limit(1).maybeSingle()
      return NextResponse.json({ ok: true, ayer, comentario: com || null })
    }

    if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
    const pedida = String(url.searchParams.get('fecha') || '')
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy
    const { data: hor } = await supabase.from('jarvis_horarios').select('usuario_id')
    const ids = [...new Set((hor || []).map(h => h.usuario_id))]
    const { data: cl } = await supabase.from('clientes').select('id, nombre').in('id', ids.length ? ids : [NADIE])
    const equipo = await Promise.all(ids.map(async uid => {
      const [dia, semana] = await Promise.all([
        revisionDelDia(supabase, { usuarioId: uid, fecha }),
        semanaDe(supabase, { usuarioId: uid, hasta: hoy }),
      ])
      return { usuario_id: uid, nombre: (cl || []).find(c => c.id === uid)?.nombre || 'Sin nombre', ...dia, semana }
    }))
    return NextResponse.json({ ok: true, hoy, fecha, equipo })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  try {
    if (body.accion === 'leido') {
      const { error } = await supabase.from('jarvis_comentarios').update({ leido_en: new Date().toISOString() })
        .eq('id', String(body.id)).eq('usuario_id', sesion.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'comentar') {
      if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || '')) ? body.fecha : null
      const uid = String(body.usuario_id || '')
      const valoracion = [1, 2, 3].includes(Number(body.valoracion)) ? Number(body.valoracion) : null
      const comentario = String(body.comentario || '').trim().slice(0, 400) || null
      if (!fecha || !uid) return NextResponse.json({ ok: false, mensaje: 'Faltan datos' }, { status: 400 })
      if (!valoracion && !comentario) return NextResponse.json({ ok: false, mensaje: 'Elige una carita o escribe algo' }, { status: 400 })
      const { error } = await supabase.from('jarvis_comentarios').upsert(
        { usuario_id: uid, fecha, valoracion, comentario, creado_por: sesion.id, creado_en: new Date().toISOString(), leido_en: null },
        { onConflict: 'usuario_id,fecha' })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
