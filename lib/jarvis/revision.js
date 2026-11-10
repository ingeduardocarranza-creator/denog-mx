import { hm, dowDe, sumarDias, r2, importe, hoyLocal, tareasColaboradorDelDia, ZONA } from './plan'

// Revisión de un día de un colaborador: qué hizo, qué no, ventas y evidencias.
// Se calcula directo de la base (no depende de que la persona haya abierto Jarvis).
const AUTO = (v) => !!v && v !== 'foto' && v !== 'visita'
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const horaLocal = (iso) => iso
  ? new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  : null
export const diaLocal = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso))
const ahoraHHMM = () => horaLocal(new Date().toISOString())

// Estado de cada actividad fija de ese día.
export function evaluarFijas({ fecha, plantillas, horario, hechas, progreso }) {
  const hoy = hoyLocal()
  const ahora = minutos(ahoraHHMM())
  const dentroDeTurno = horario && fecha === hoy && minutos(hm(horario.desde)) <= ahora && ahora < minutos(hm(horario.hasta))
  return tareasColaboradorDelDia({ dow: dowDe(fecha), plantillas, horario }).map(t => {
    const h = hechas.find(x => x.plantilla_id === t.id)
    const actual = AUTO(t.verif) ? Number(progreso?.[t.verif] || 0) : null
    let estado
    if (AUTO(t.verif)) estado = actual >= t.meta ? 'hecha' : null
    else estado = h?.estado === 'hecha' ? 'hecha' : h?.estado === 'saltada' ? 'saltada' : null
    if (!estado) {
      if (fecha < hoy) estado = 'falto'
      else if (fecha === hoy && minutos(hm(t.hora)) <= ahora - 30 && (dentroDeTurno || ahora >= minutos(hm(horario.hasta)))) estado = 'atrasada'
      else estado = 'pendiente'
    }
    if (estado === 'saltada') estado = fecha < hoy ? 'falto' : 'atrasada'
    return {
      id: t.id, titulo: t.titulo, emoji: t.emoji, hora: hm(t.hora), estado, es_venta: !!t.es_venta,
      actual: actual === null ? null : Math.min(actual, t.meta), meta: AUTO(t.verif) ? t.meta : null,
      hecha_a: estado === 'hecha' ? horaLocal(h?.hecha_en) : null, foto_url: h?.foto_url || null,
    }
  })
}

export async function revisionDelDia(supabase, { usuarioId, fecha }) {
  const hoy = hoyLocal()
  const dow = dowDe(fecha)
  const [pl, ho, hs, ap, pts, vs, com, pr] = await Promise.all([
    supabase.from('jarvis_plantillas').select('*').eq('activa', true).order('hora').order('orden'),
    supabase.from('jarvis_horarios').select('*').eq('usuario_id', usuarioId),
    supabase.from('jarvis_hechas').select('*').eq('usuario_id', usuarioId).eq('fecha', fecha),
    supabase.from('jarvis_aperturas').select('*').eq('usuario_id', usuarioId).eq('fecha', fecha).maybeSingle(),
    supabase.from('jarvis_tareas').select('*').eq('activa', true).or(`para_usuario.is.null,para_usuario.eq.${usuarioId}`).order('creada_en'),
    supabase.from('ventas_tienda').select('cantidad, precio_unitario, transaccion_id, pago_id, id')
      .eq('vendedor_id', usuarioId).gte('creado_en', `${fecha}T00:00:00`).lt('creado_en', `${sumarDias(fecha, 1)}T00:00:00`).limit(5000),
    supabase.from('jarvis_comentarios').select('*').eq('usuario_id', usuarioId).eq('fecha', fecha).maybeSingle(),
    supabase.rpc('jarvis_progreso', { p_usuario: usuarioId, p_fecha: fecha }),
  ])
  for (const r of [pl, ho, hs, pts, vs]) if (r.error) throw new Error(r.error.message)
  const horario = (ho.data || []).find(h => h.dia === dow) || null
  const fijas = evaluarFijas({ fecha, plantillas: pl.data || [], horario, hechas: hs.data || [], progreso: pr.data || {} })

  // Tareas del plan (puntuales)
  const ids = (pts.data || []).map(t => t.id)
  const { data: ths } = ids.length
    ? await supabase.from('jarvis_tareas_hechas').select('*').eq('usuario_id', usuarioId).in('tarea_id', ids)
    : { data: [] }
  const puntuales = []
  for (const t of pts.data || []) {
    if (diaLocal(t.creada_en) > fecha) continue
    const th = (ths || []).find(x => x.tarea_id === t.id)
    const hechaEseDia = th && diaLocal(th.hecha_en) === fecha
    const venceEseDia = t.fecha_limite === fecha
    if (th && !hechaEseDia) continue
    if (!th && fecha < hoy && !venceEseDia) continue
    puntuales.push({
      id: `p:${t.id}`, titulo: t.titulo, emoji: t.es_venta ? '💰' : '🗓️', hora: 'plan', prioridad: t.prioridad, es_venta: t.es_venta,
      estado: hechaEseDia ? 'hecha' : fecha < hoy ? 'falto' : (t.fecha_limite && t.fecha_limite < hoy) ? 'atrasada' : 'pendiente',
      hecha_a: hechaEseDia ? horaLocal(th.hecha_en) : null, foto_url: th?.foto_url || null, requiere_foto: !!t.requiere_foto,
      actual: null, meta: null,
    })
  }

  const todas = [...puntuales, ...fijas]
  const hechas = todas.filter(t => t.estado === 'hecha').length
  const tickets = new Set((vs.data || []).map(v => v.transaccion_id || v.pago_id || v.id)).size
  return {
    fecha, trabaja: !!horario, turno: horario ? { desde: hm(horario.desde), hasta: hm(horario.hasta) } : null,
    resumen: { hechas, total: todas.length, faltan: todas.filter(t => t.estado === 'falto' || t.estado === 'atrasada').length },
    fijas, puntuales,
    ventas: { tickets, monto: r2((vs.data || []).reduce((s, v) => s + importe(v), 0)) },
    apertura: ap.data ? { veces: ap.data.aperturas, primera: horaLocal(ap.data.primera_en), ultima: horaLocal(ap.data.ultima_en) } : null,
    comentario: com.data || null,
  }
}

// Cumplimiento de los últimos 7 días (barra de la semana).
export async function semanaDe(supabase, { usuarioId, hasta }) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hasta, i - 6))
  const [pl, ho, hs, ...prs] = await Promise.all([
    supabase.from('jarvis_plantillas').select('*').eq('activa', true),
    supabase.from('jarvis_horarios').select('*').eq('usuario_id', usuarioId),
    supabase.from('jarvis_hechas').select('*').eq('usuario_id', usuarioId).gte('fecha', dias[0]).lte('fecha', hasta),
    ...dias.map(f => supabase.rpc('jarvis_progreso', { p_usuario: usuarioId, p_fecha: f })),
  ])
  return dias.map((f, i) => {
    const horario = (ho.data || []).find(h => h.dia === dowDe(f)) || null
    const fijas = evaluarFijas({ fecha: f, plantillas: pl.data || [], horario, hechas: (hs.data || []).filter(h => h.fecha === f), progreso: prs[i].data || {} })
    return { fecha: f, total: fijas.length, hechas: fijas.filter(t => t.estado === 'hecha').length }
  })
}
