import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarPuntuales, cargarVentaDelDia, ordenarTareas, cargarOrden } from '@/lib/jarvis/plan'

export const dynamic = 'force-dynamic'

// Jarvis: tablero de actividades por turno.
// Hermosillo no cambia de horario (UTC-7 todo el año).
const ZONA = 'America/Hermosillo'
const META = 0.7 // un día cuenta para la racha si se hizo el 70% o más

function ahoraHermosillo() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(x => [x.type, x.value])
  )
  const fecha = `${p.year}-${p.month}-${p.day}`
  return { fecha, hhmm: `${p.hour}:${p.minute}`, dow: dowDe(fecha) }
}
function dowDe(fecha) { // 1=lunes ... 7=domingo
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}
function restarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const hm = (t) => String(t).slice(0, 5)
function restarMinutos(hhmm, n) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.max(0, h * 60 + m - n)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Las actividades que le tocan a alguien en un día de la semana.
function tareasDeDia({ dow, rolAdmin, plantillas, horario }) {
  if (rolAdmin) {
    return plantillas.filter(p => p.para === 'admin' && p.dias.includes(dow))
  }
  if (!horario) return []
  return plantillas.filter(p =>
    p.para === 'colaborador' && p.dias.includes(dow) &&
    hm(p.hora) >= hm(horario.desde) && hm(p.hora) < hm(horario.hasta)
  )
}

async function cargarBase(supabase, usuarioId) {
  const [pl, ho] = await Promise.all([
    supabase.from('jarvis_plantillas').select('*').eq('activa', true).order('hora').order('orden'),
    supabase.from('jarvis_horarios').select('*').eq('usuario_id', usuarioId),
  ])
  if (pl.error) throw new Error(pl.error.message)
  if (ho.error) throw new Error(ho.error.message)
  return { plantillas: pl.data || [], horarios: ho.data || [] }
}

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const esAdmin = sesion.rol === 'admin'
  const url = new URL(req.url)
  const { fecha, hhmm, dow } = ahoraHermosillo()

  try {
    // ----- Vista del admin: cómo va el equipo -----
    if (url.searchParams.get('equipo')) {
      if (!esAdmin) return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const { data: horarios } = await supabase.from('jarvis_horarios').select('*')
      const { data: plantillas } = await supabase.from('jarvis_plantillas').select('*').eq('activa', true)
      const ids = [...new Set((horarios || []).map(h => h.usuario_id))]
      const { data: nombres } = await supabase.from('clientes').select('id, nombre').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const desde = restarDias(fecha, 7)
      const { data: hechas } = await supabase.from('jarvis_hechas').select('*').gte('fecha', desde).in('usuario_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      const { data: retros } = await supabase.from('jarvis_retros').select('*').gte('fecha', desde).order('fecha', { ascending: false })

      const enTurnoAhora = (h) => !!h && hm(h.desde) <= hhmm && hhmm < hm(h.hasta)
      const equipo = ids.map(uid => {
        const nombre = (nombres || []).find(n => n.id === uid)?.nombre || 'Sin nombre'
        const mios = (horarios || []).filter(h => h.usuario_id === uid)
        const dia = (f) => {
          const d = dowDe(f)
          const horario = mios.find(h => h.dia === d)
          const tareas = tareasDeDia({ dow: d, rolAdmin: false, plantillas: plantillas || [], horario })
          const hs = (hechas || []).filter(h => h.usuario_id === uid && h.fecha === f)
          const hechasOk = hs.filter(h => h.estado === 'hecha' && tareas.some(t => t.id === h.plantilla_id))
          return {
            fecha: f, total: tareas.length, hechas: hechasOk.length,
            saltadas: hs.filter(h => h.estado === 'saltada').length,
            xp: hs.reduce((n, h) => n + h.xp, 0),
            // Atrasada = pasaron 30 min de su hora y nadie la marcó, y solo
            // cuenta mientras la persona está en turno (no de noche).
            atrasadas: f === fecha && enTurnoAhora(horario)
              ? tareas.filter(t => hm(t.hora) <= restarMinutos(hhmm, 30) && !hs.some(h => h.plantilla_id === t.id)).length
              : 0,
            ultima: hs.length ? hs.map(h => h.hecha_en).sort().pop() : null,
          }
        }
        const semana = Array.from({ length: 7 }, (_, i) => dia(restarDias(fecha, 6 - i)))
        return {
          usuario_id: uid, nombre,
          trabaja_hoy: mios.some(h => h.dia === dow),
          en_turno: enTurnoAhora(mios.find(h => h.dia === dow)),
          horario_hoy: mios.find(h => h.dia === dow) ? { desde: hm(mios.find(h => h.dia === dow).desde), hasta: hm(mios.find(h => h.dia === dow).hasta) } : null,
          hoy: dia(fecha), semana,
          retros: (retros || []).filter(r => r.usuario_id === uid).slice(0, 5),
        }
      })
      const { data: fotosHoy } = await supabase.from('jarvis_hechas').select('usuario_id, plantilla_id, foto_url, hecha_en').eq('fecha', fecha).not('foto_url', 'is', null)
      for (const e of equipo) {
        e.fotos = (fotosHoy || []).filter(f => f.usuario_id === e.usuario_id).map(f => ({
          titulo: (plantillas || []).find(p => p.id === f.plantilla_id)?.titulo || 'Actividad', foto_url: f.foto_url, hecha_en: f.hecha_en,
        }))
      }
      return NextResponse.json({ ok: true, fecha, ahora: hhmm, equipo })
    }

    // ----- Mi día -----
    const { plantillas, horarios } = await cargarBase(supabase, sesion.id)
    const horarioHoy = horarios.find(h => h.dia === dow) || null
    const tareasHoy = tareasDeDia({ dow, rolAdmin: esAdmin, plantillas, horario: horarioHoy })

    const desde = restarDias(fecha, 14)
    let q = supabase.from('jarvis_hechas').select('*').gte('fecha', desde)
    if (!esAdmin) q = q.eq('usuario_id', sesion.id)
    const { data: hechas, error: eh } = await q
    if (eh) throw new Error(eh.message)

    // Tareas que se comprueban solas: Jarvis cuenta en la base lo que hizo
    // esta persona hoy, y si llegó a la meta la marca como hecha.
    let progreso = {}
    if (tareasHoy.some(t => t.verif)) {
      const { data: pr } = await supabase.rpc('jarvis_progreso', { p_usuario: sesion.id, p_fecha: fecha })
      progreso = pr || {}
      const nuevas = []
      for (const t of tareasHoy) {
        if (!t.verif || t.verif === 'foto' || t.verif === 'visita') continue
        const actual = Number(progreso[t.verif] || 0)
        const yaHecha = hechas.some(h => h.fecha === fecha && h.plantilla_id === t.id && h.estado === 'hecha')
        if (actual >= t.meta && !yaHecha) {
          nuevas.push({ fecha, plantilla_id: t.id, usuario_id: sesion.id, estado: 'hecha', xp: t.xp, auto: true, hecha_en: new Date().toISOString() })
        }
      }
      if (nuevas.length) {
        const { error: ea } = await supabase.from('jarvis_hechas').upsert(nuevas, { onConflict: 'fecha,plantilla_id,usuario_id' })
        if (ea) throw new Error(ea.message)
        for (const n of nuevas) {
          const i = hechas.findIndex(h => h.fecha === fecha && h.plantilla_id === n.plantilla_id && h.usuario_id === n.usuario_id)
          if (i >= 0) hechas[i] = { ...hechas[i], ...n }; else hechas.push(n)
        }
      }
    }

    const deDia = (f) => hechas.filter(h => h.fecha === f)
    const estadoDe = (f, plantillaId) => deDia(f).find(h => h.plantilla_id === plantillaId)?.estado || 'pendiente'

    const puntuales = esAdmin ? [] : await cargarPuntuales(supabase, sesion.id, fecha)
    const tareasFijas = tareasHoy.map(t => {
      const estado = estadoDe(fecha, t.id)
      return {
        id: t.id, titulo: t.titulo, detalle: t.detalle, emoji: t.emoji,
        hora: hm(t.hora), xp: t.xp, enlace: t.enlace, estado, es_venta: !!t.es_venta,
        toca: hm(t.hora) <= hhmm,
        modo: t.verif === 'foto' ? 'foto' : t.verif === 'visita' ? 'visita' : t.verif ? 'auto' : 'manual',
        auto: !!t.verif && t.verif !== 'foto' && t.verif !== 'visita',
        verif: t.verif || null,
        meta: t.meta,
        actual: t.verif ? Math.min(Number(progreso[t.verif] || 0), t.meta) : null,
      }
    })
    // Las tareas del plan (puntuales) y las de venta van primero; ver lib/jarvis/plan.js
    const tareas = ordenarTareas([...puntuales, ...tareasFijas], esAdmin ? null : await cargarOrden(supabase, sesion.id))
    const hechasHoy = tareas.filter(t => t.estado === 'hecha').length
    const xpHoy = deDia(fecha).filter(h => esAdmin || h.usuario_id === sesion.id).reduce((n, h) => n + h.xp, 0)
      + puntuales.reduce((n, t) => n + (t.xp_ganado || 0), 0)
    const venta = await cargarVentaDelDia(supabase, sesion.id, fecha)

    // Día anterior con turno, para "mejor que ayer"
    const resumenDe = (f) => {
      const d = dowDe(f)
      const ts = tareasDeDia({ dow: d, rolAdmin: esAdmin, plantillas, horario: horarios.find(h => h.dia === d) })
      const ok = ts.filter(t => estadoDe(f, t.id) === 'hecha').length
      return { fecha: f, total: ts.length, hechas: ok, xp: deDia(f).reduce((n, h) => n + h.xp, 0) }
    }
    let ayer = null
    for (let i = 1; i <= 7; i++) {
      const r = resumenDe(restarDias(fecha, i))
      if (r.total > 0) { ayer = r; break }
    }

    // Racha: días seguidos (con turno) en que se cumplió la meta.
    let racha = 0
    for (let i = 1; i <= 14; i++) {
      const r = resumenDe(restarDias(fecha, i))
      if (r.total === 0) continue
      if (r.hechas / r.total >= META) racha++
      else break
    }
    if (tareas.length > 0 && hechasHoy / tareas.length >= META) racha++

    // Retro del día
    const { data: retro } = await supabase.from('jarvis_retros').select('*').eq('fecha', fecha).eq('usuario_id', sesion.id).maybeSingle()

    return NextResponse.json({
      ok: true,
      usuario: { id: sesion.id, nombre: sesion.nombre, rol: sesion.rol },
      fecha, ahora: hhmm,
      turno: horarioHoy ? { desde: hm(horarioHoy.desde), hasta: hm(horarioHoy.hasta) } : null,
      tareas, venta,
      resumen: { hechas: hechasHoy, total: tareas.length, xp_hoy: xpHoy, meta: Math.ceil(tareas.length * META) },
      ayer, racha,
      retro_hecha: !!retro,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const esAdmin = sesion.rol === 'admin'
  const body = await req.json().catch(() => ({}))
  const { fecha, dow } = ahoraHermosillo()

  try {
    if (body.accion === 'retro') {
      const animo = [1, 2, 3].includes(Number(body.animo)) ? Number(body.animo) : null
      const limpio = (t) => String(t || '').trim().slice(0, 500) || null
      const { error } = await supabase.from('jarvis_retros').upsert({
        fecha, usuario_id: sesion.id, animo, dificil: limpio(body.dificil), ayuda: limpio(body.ayuda),
      }, { onConflict: 'fecha,usuario_id' })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    // Registro de uso: cada vez que alguien abre Jarvis (una vez por visita).
    if (body.accion === 'abrir') {
      const ahora = new Date().toISOString()
      const { data: ap } = await supabase.from('jarvis_aperturas').select('aperturas').eq('usuario_id', sesion.id).eq('fecha', fecha).maybeSingle()
      const { error: ea } = ap
        ? await supabase.from('jarvis_aperturas').update({ aperturas: (ap.aperturas || 0) + 1, ultima_en: ahora }).eq('usuario_id', sesion.id).eq('fecha', fecha)
        : await supabase.from('jarvis_aperturas').insert({ usuario_id: sesion.id, fecha, aperturas: 1, primera_en: ahora, ultima_en: ahora })
      if (ea) throw new Error(ea.message)
      return NextResponse.json({ ok: true })
    }

    // Tareas puntuales del plan de trabajo (id "p:<uuid>"): se marcan por persona.
    if (typeof body.plantilla_id === 'string' && body.plantilla_id.startsWith('p:')) {
      if (esAdmin) return NextResponse.json({ ok: false, mensaje: 'Las tareas del plan son para los colaboradores' }, { status: 400 })
      const { data: t, error: et } = await supabase.from('jarvis_tareas').select('*').eq('id', body.plantilla_id.slice(2)).eq('activa', true).maybeSingle()
      if (et) throw new Error(et.message)
      if (!t || (t.para_usuario && t.para_usuario !== sesion.id)) return NextResponse.json({ ok: false, mensaje: 'Esa tarea no te toca' }, { status: 400 })
      if (body.accion === 'hecha') {
        const foto = String(body.foto_url || '')
        if (t.requiere_foto && !/^https:\/\//.test(foto)) return NextResponse.json({ ok: false, mensaje: 'Esta tarea necesita foto de evidencia' }, { status: 400 })
        const { error } = await supabase.from('jarvis_tareas_hechas').upsert({ tarea_id: t.id, usuario_id: sesion.id, hecha_en: new Date().toISOString(), xp: t.xp, foto_url: /^https:\/\//.test(foto) ? foto : null }, { onConflict: 'tarea_id,usuario_id' })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, xp: t.xp })
      }
      if (body.accion === 'deshacer') {
        const { error } = await supabase.from('jarvis_tareas_hechas').delete().eq('tarea_id', t.id).eq('usuario_id', sesion.id)
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ ok: false, mensaje: 'Las tareas del plan no se saltan: ¡a sacarlas!' }, { status: 400 })
    }

    const { plantillas, horarios } = await cargarBase(supabase, sesion.id)
    const horario = horarios.find(h => h.dia === dow) || null
    const tarea = tareasDeDia({ dow, rolAdmin: esAdmin, plantillas, horario }).find(t => t.id === body.plantilla_id)
    if (!tarea) return NextResponse.json({ ok: false, mensaje: 'Esa actividad no te toca hoy' }, { status: 400 })

    if (body.accion === 'deshacer') {
      let del = supabase.from('jarvis_hechas').delete().eq('fecha', fecha).eq('plantilla_id', tarea.id)
      if (!esAdmin) del = del.eq('usuario_id', sesion.id)
      else del = del.eq('usuario_id', sesion.id)
      const { error } = await del
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    // Con foto: la actividad física se comprueba con una foto de cómo quedó.
    if (tarea.verif === 'foto' && body.accion === 'hecha') {
      const foto = String(body.foto_url || '')
      if (!/^https:\/\//.test(foto)) return NextResponse.json({ ok: false, mensaje: 'Sube la foto para marcarla' }, { status: 400 })
      const { error: ef } = await supabase.from('jarvis_hechas').upsert({
        fecha, plantilla_id: tarea.id, usuario_id: sesion.id, estado: 'hecha', xp: tarea.xp,
        hecha_en: new Date().toISOString(), foto_url: foto,
      }, { onConflict: 'fecha,plantilla_id,usuario_id' })
      if (ef) throw new Error(ef.message)
      return NextResponse.json({ ok: true, xp: tarea.xp })
    }
    // De revisión: se registra cuando abres la pantalla.
    if (tarea.verif === 'visita' && body.accion === 'visita') {
      const { error: ev } = await supabase.from('jarvis_hechas').upsert({
        fecha, plantilla_id: tarea.id, usuario_id: sesion.id, estado: 'hecha', xp: tarea.xp,
        hecha_en: new Date().toISOString(), auto: true,
      }, { onConflict: 'fecha,plantilla_id,usuario_id' })
      if (ev) throw new Error(ev.message)
      return NextResponse.json({ ok: true, xp: tarea.xp })
    }
    if (body.accion === 'hecha' && tarea.verif) {
      return NextResponse.json({ ok: false, mensaje: 'Esta actividad se marca sola cuando la hagas de verdad.' }, { status: 400 })
    }
    if (body.accion === 'saltada' && tarea.verif) {
      return NextResponse.json({ ok: false, mensaje: 'Esta actividad no se salta: se marca sola cuando la hagas.' }, { status: 400 })
    }
    if (!['hecha', 'saltada'].includes(body.accion)) {
      return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
    }
    const { error } = await supabase.from('jarvis_hechas').upsert({
      fecha, plantilla_id: tarea.id, usuario_id: sesion.id,
      estado: body.accion, xp: body.accion === 'hecha' ? tarea.xp : 0,
      hecha_en: new Date().toISOString(),
    }, { onConflict: 'fecha,plantilla_id,usuario_id' })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, xp: body.accion === 'hecha' ? tarea.xp : 0 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
