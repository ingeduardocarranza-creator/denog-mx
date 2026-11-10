import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { hoyLocal, sumarDias, dowDe, hm, r2, importe, diaDe, horaDe, tareasColaboradorDelDia, NADIE } from '@/lib/jarvis/plan'

export const dynamic = 'force-dynamic'

// Números para el admin, por colaborador y por día: cuánto cumplen, cuánto usan
// Jarvis y cuánto venden (tienda, separado de encargos). "Mensaje visto" = el
// mensaje del coach se mostró en su pantalla.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const url = new URL(req.url)
  const dias = Math.min(30, Math.max(3, Number(url.searchParams.get('dias')) || 14))
  try {
    const hoy = hoyLocal()
    const desde = sumarDias(hoy, -(dias - 1))
    const fechas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i))
    const [horR, plR, cfgR] = await Promise.all([
      supabase.from('jarvis_horarios').select('*'),
      supabase.from('jarvis_plantillas').select('id, para, dias, hora').eq('activa', true),
      supabase.from('jarvis_config').select('valor').eq('clave', 'meta_venta_diaria').maybeSingle(),
    ])
    for (const r of [horR, plR]) if (r.error) throw new Error(r.error.message)
    const horarios = horR.data || [], plantillas = plR.data || []
    const ids = [...new Set(horarios.map(h => h.usuario_id))]
    const idsQ = ids.length ? ids : [NADIE]
    const [clR, hechasR, apR, msgR, ventasR, tareasR, tHechasR] = await Promise.all([
      supabase.from('clientes').select('id, nombre').in('id', idsQ),
      supabase.from('jarvis_hechas').select('usuario_id, fecha, plantilla_id, estado').gte('fecha', desde).in('usuario_id', idsQ).limit(5000),
      supabase.from('jarvis_aperturas').select('*').gte('fecha', desde).in('usuario_id', idsQ),
      supabase.from('jarvis_mensajes').select('usuario_id, tipo, fecha, leido_en').gte('fecha', desde).in('usuario_id', idsQ),
      supabase.from('ventas_tienda').select('cantidad, precio_unitario, vendedor_id, creado_en, pago_id')
        .gte('creado_en', `${desde}T00:00:00`).lt('creado_en', `${sumarDias(hoy, 1)}T00:00:00`).limit(20000),
      supabase.from('jarvis_tareas').select('id, para_usuario, creada_en').gte('creada_en', `${desde}T00:00:00`),
      supabase.from('jarvis_tareas_hechas').select('tarea_id, usuario_id, hecha_en').gte('hecha_en', `${desde}T00:00:00`),
    ])
    for (const r of [clR, hechasR, apR, msgR, ventasR, tareasR, tHechasR]) if (r.error) throw new Error(r.error.message)
    const nombres = Object.fromEntries((clR.data || []).map(c => [c.id, c.nombre]))
    const ventas = ventasR.data || []
    const meta = Number(cfgR.data?.valor?.monto) || null

    // Tienda por día (todo el mostrador) frente a la meta
    const tienda = fechas.map(f => {
      const del = ventas.filter(v => diaDe(v.creado_en) === f)
      return { fecha: f, total: r2(del.reduce((s, v) => s + importe(v), 0)), piezas: del.reduce((s, v) => s + (Number(v.cantidad) || 0), 0) }
    })

    const colaboradores = ids.map(uid => {
      const mios = horarios.filter(h => h.usuario_id === uid)
      const filas = fechas.map(f => {
        const dow = dowDe(f)
        const horario = mios.find(h => h.dia === dow) || null
        const tareas = tareasColaboradorDelDia({ dow, plantillas, horario })
        const hechas = (hechasR.data || []).filter(h => h.usuario_id === uid && h.fecha === f && h.estado === 'hecha' && tareas.some(t => t.id === h.plantilla_id)).length
        const ap = (apR.data || []).find(a => a.usuario_id === uid && a.fecha === f)
        const propias = ventas.filter(v => v.vendedor_id === uid && diaDe(v.creado_en) === f)
        const enTurno = horario ? ventas.filter(v => diaDe(v.creado_en) === f && horaDe(v.creado_en) >= hm(horario.desde) && horaDe(v.creado_en) < hm(horario.hasta)) : []
        return {
          fecha: f, turno: horario ? `${hm(horario.desde)}-${hm(horario.hasta)}` : null,
          total: tareas.length, hechas,
          abrio: !!ap, aperturas: ap?.aperturas || 0, primera_en: ap?.primera_en || null, ultima_en: ap?.ultima_en || null,
          vendido: r2(propias.reduce((s, v) => s + importe(v), 0)),
          tickets: new Set(propias.map(v => v.pago_id).filter(Boolean)).size,
          vendido_en_turno: r2(enTurno.reduce((s, v) => s + importe(v), 0)),
        }
      })
      const conTurno = filas.filter(d => d.turno && d.fecha <= hoy)
      const totalT = conTurno.reduce((s, d) => s + d.total, 0), hechasT = conTurno.reduce((s, d) => s + d.hechas, 0)
      const mensajes = (msgR.data || []).filter(m => m.usuario_id === uid && m.tipo !== 'admin_manana')
      const asignadas = (tareasR.data || []).filter(t => !t.para_usuario || t.para_usuario === uid)
      const puntualesHechas = (tHechasR.data || []).filter(h => h.usuario_id === uid && asignadas.some(t => t.id === h.tarea_id))
      return {
        usuario_id: uid, nombre: nombres[uid] || 'Sin nombre', dias: filas,
        resumen: {
          dias_con_turno: conTurno.length,
          dias_que_abrio: conTurno.filter(d => d.abrio).length,
          cumplimiento_pct: totalT ? Math.round((hechasT / totalT) * 100) : null,
          vendido: r2(filas.reduce((s, d) => s + d.vendido, 0)),
          vendido_en_turno: r2(conTurno.reduce((s, d) => s + d.vendido_en_turno, 0)),
          mensajes_generados: mensajes.length, mensajes_vistos: mensajes.filter(m => m.leido_en).length,
          puntuales_asignadas: asignadas.length, puntuales_hechas: puntualesHechas.length,
          ultima_apertura: filas.map(d => d.ultima_en).filter(Boolean).sort().pop() || null,
        },
      }
    })
    return NextResponse.json({ ok: true, hoy, desde, dias, meta, tienda, colaboradores })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
