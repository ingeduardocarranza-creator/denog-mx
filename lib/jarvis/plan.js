// Piezas compartidas del plan de trabajo de Jarvis: tareas puntuales del admin,
// meta de venta y ventas del día. La base trabaja en hora de Hermosillo
// (TimeZone del servidor), así que los 10 primeros caracteres de una fecha que
// regresa PostgREST ya son el día local.
export const ZONA = 'America/Hermosillo'
export const NADIE = '00000000-0000-0000-0000-000000000000'
export const hm = (t) => String(t).slice(0, 5)
export const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())
export const dowDe = (f) => { const d = new Date(`${f}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d } // 1=lunes … 7=domingo
export const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const importe = (v) => (Number(v.precio_unitario) || 0) * (Number(v.cantidad) || 0)
export const diaDe = (ts) => String(ts).slice(0, 10)
export const horaDe = (ts) => String(ts).slice(11, 16)

// Actividades fijas de un colaborador ese día de la semana, según su turno.
export function tareasColaboradorDelDia({ dow, plantillas, horario }) {
  if (!horario) return []
  return plantillas.filter(p => p.para === 'colaborador' && p.dias.includes(dow) && hm(p.hora) >= hm(horario.desde) && hm(p.hora) < hm(horario.hasta))
}

// Orden en que se le muestran las tareas: lo que ya toca va primero, y dentro de
// eso manda la prioridad (alta > venta > media > resto por hora > baja).
export function rango(t) {
  if (t.puntual && t.prioridad === 1) return 0
  if (t.es_venta) return 1
  if (t.puntual && t.prioridad === 2) return 2
  if (t.puntual && t.prioridad === 3) return 4
  return 3
}
export function ordenarTareas(tareas) {
  return [...tareas].sort((a, b) =>
    (a.toca === b.toca ? 0 : a.toca ? -1 : 1) || rango(a) - rango(b) || String(a.hora).localeCompare(String(b.hora)))
}

// Tareas puntuales que le tocan a una persona. Se ven hasta 2 días después de
// su fecha límite (marcadas vencidas) y una vez hechas solo ese mismo día.
export async function cargarPuntuales(supabase, usuarioId, fecha) {
  const { data: ts, error } = await supabase.from('jarvis_tareas').select('*').eq('activa', true)
    .or(`para_usuario.is.null,para_usuario.eq.${usuarioId}`).order('creada_en', { ascending: true })
  if (error) throw new Error(error.message)
  const vigentes = (ts || []).filter(t => !t.fecha_limite || t.fecha_limite >= sumarDias(fecha, -2))
  if (!vigentes.length) return []
  const { data: hs, error: eh } = await supabase.from('jarvis_tareas_hechas').select('tarea_id, hecha_en, xp')
    .eq('usuario_id', usuarioId).in('tarea_id', vigentes.map(t => t.id))
  if (eh) throw new Error(eh.message)
  const hecha = Object.fromEntries((hs || []).map(h => [h.tarea_id, h]))
  return vigentes
    .filter(t => !hecha[t.id] || diaDe(hecha[t.id].hecha_en) === fecha)
    .map(t => ({
      id: `p:${t.id}`, titulo: t.titulo, detalle: t.detalle, emoji: t.es_venta ? '💰' : t.emoji,
      hora: t.fecha_limite ? `vence ${t.fecha_limite.slice(8, 10)}/${t.fecha_limite.slice(5, 7)}` : 'plan',
      xp: t.xp, enlace: null, estado: hecha[t.id] ? 'hecha' : 'pendiente', toca: true,
      modo: 'manual', auto: false, verif: null, meta: null, actual: null,
      puntual: true, prioridad: t.prioridad, es_venta: t.es_venta,
      vencida: !!t.fecha_limite && t.fecha_limite < fecha && !hecha[t.id],
      xp_ganado: hecha[t.id] ? hecha[t.id].xp : 0,
    }))
}

// Meta de venta diaria (la fija el admin) y cómo va la tienda hoy.
export async function cargarVentaDelDia(supabase, usuarioId, fecha) {
  const [cfg, vs] = await Promise.all([
    supabase.from('jarvis_config').select('valor').eq('clave', 'meta_venta_diaria').maybeSingle(),
    supabase.from('ventas_tienda').select('cantidad, precio_unitario, vendedor_id')
      .gte('creado_en', `${fecha}T00:00:00`).lt('creado_en', `${sumarDias(fecha, 1)}T00:00:00`).limit(5000),
  ])
  if (vs.error) throw new Error(vs.error.message)
  const ventas = vs.data || []
  const meta = Number(cfg.data?.valor?.monto) || null
  return {
    meta,
    hoy: r2(ventas.reduce((s, v) => s + importe(v), 0)),
    mia: r2(ventas.filter(v => v.vendedor_id === usuarioId).reduce((s, v) => s + importe(v), 0)),
    piezas_hoy: ventas.reduce((s, v) => s + (Number(v.cantidad) || 0), 0),
  }
}
