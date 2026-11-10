import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { hoyLocal, sumarDias, r2, importe, diaDe, NADIE } from '@/lib/jarvis/plan'

export const dynamic = 'force-dynamic'

// Plan de trabajo del admin: tareas puntuales con prioridad (a uno o a todos los
// colaboradores) y la meta de venta diaria.
const limpio = (t, n) => String(t ?? '').trim().slice(0, n)
const XP_POR_PRIORIDAD = { 1: 40, 2: 25, 3: 15 }

export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const hoy = hoyLocal()
    const [tareasR, horR, cfgR, ventasR] = await Promise.all([
      supabase.from('jarvis_tareas').select('*').eq('activa', true).order('prioridad').order('creada_en', { ascending: false }).limit(100),
      supabase.from('jarvis_horarios').select('usuario_id'),
      supabase.from('jarvis_config').select('valor').eq('clave', 'meta_venta_diaria').maybeSingle(),
      supabase.from('ventas_tienda').select('cantidad, precio_unitario, creado_en')
        .gte('creado_en', `${sumarDias(hoy, -29)}T00:00:00`).lt('creado_en', `${sumarDias(hoy, 1)}T00:00:00`).limit(20000),
    ])
    for (const r of [tareasR, horR, ventasR]) if (r.error) throw new Error(r.error.message)
    const tareas = tareasR.data || []
    const ids = [...new Set((horR.data || []).map(h => h.usuario_id))]
    const [{ data: cl }, { data: hs }] = await Promise.all([
      supabase.from('clientes').select('id, nombre').in('id', ids.length ? ids : [NADIE]),
      supabase.from('jarvis_tareas_hechas').select('tarea_id, usuario_id, hecha_en').in('tarea_id', tareas.length ? tareas.map(t => t.id) : [NADIE]),
    ])
    const colaboradores = (cl || []).map(c => ({ id: c.id, nombre: c.nombre }))

    // Sugerencia de meta: promedio de los días de los últimos 30 que sí hubo venta.
    const porDia = {}
    for (const v of ventasR.data || []) porDia[diaDe(v.creado_en)] = (porDia[diaDe(v.creado_en)] || 0) + importe(v)
    const dias = Object.values(porDia)
    const promedio = dias.length ? r2(dias.reduce((s, n) => s + n, 0) / dias.length) : null

    return NextResponse.json({
      ok: true, colaboradores,
      meta_venta: Number(cfgR.data?.valor?.monto) || null,
      promedio_30_dias: promedio, dias_con_venta_30: dias.length,
      tareas: tareas.map(t => ({
        ...t,
        avance: colaboradores
          .filter(c => !t.para_usuario || t.para_usuario === c.id)
          .map(c => ({ usuario_id: c.id, nombre: c.nombre, hecha_en: (hs || []).find(h => h.tarea_id === t.id && h.usuario_id === c.id)?.hecha_en || null })),
      })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  try {
    if (body.accion === 'crear') {
      const titulo = limpio(body.titulo, 120)
      if (!titulo) return NextResponse.json({ ok: false, mensaje: 'Escribe qué hay que hacer' }, { status: 400 })
      const prioridad = [1, 2, 3].includes(Number(body.prioridad)) ? Number(body.prioridad) : 2
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha_limite || '')) ? body.fecha_limite : null
      const para = body.para_usuario ? String(body.para_usuario) : null
      if (para) {
        const { data: h } = await supabase.from('jarvis_horarios').select('usuario_id').eq('usuario_id', para).limit(1)
        if (!h?.length) return NextResponse.json({ ok: false, mensaje: 'Esa persona no es colaborador de Jarvis' }, { status: 400 })
      }
      const { data, error } = await supabase.from('jarvis_tareas').insert({
        titulo, detalle: limpio(body.detalle, 300) || null, prioridad, es_venta: !!body.es_venta,
        para_usuario: para, fecha_limite: fecha, xp: XP_POR_PRIORIDAD[prioridad], creada_por: sesion.id,
      }).select('id').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, id: data.id })
    }
    if (body.accion === 'archivar') {
      const { error } = await supabase.from('jarvis_tareas').update({ activa: false }).eq('id', String(body.id))
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'prioridad') {
      const prioridad = Number(body.prioridad)
      if (![1, 2, 3].includes(prioridad)) return NextResponse.json({ ok: false, mensaje: 'Prioridad no válida' }, { status: 400 })
      const { error } = await supabase.from('jarvis_tareas').update({ prioridad, xp: XP_POR_PRIORIDAD[prioridad] }).eq('id', String(body.id))
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'meta_venta') {
      const monto = Math.round(Number(body.monto))
      if (!Number.isFinite(monto) || monto < 0 || monto > 1000000) return NextResponse.json({ ok: false, mensaje: 'Pon un monto válido' }, { status: 400 })
      // monto 0 = quitar la meta
      const { error } = monto === 0
        ? await supabase.from('jarvis_config').delete().eq('clave', 'meta_venta_diaria')
        : await supabase.from('jarvis_config').upsert({ clave: 'meta_venta_diaria', valor: { monto }, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
