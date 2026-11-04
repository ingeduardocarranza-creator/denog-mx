import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { generarMensaje } from '@/lib/jarvis/coach'
import { GET as resumenAdmin } from '../resumen/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ZONA = 'America/Hermosillo'
const hm = (t) => String(t).slice(0, 5)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const NADIE = '00000000-0000-0000-0000-000000000000'
function ahora() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` }
}
const dowDe = (f) => { const d = new Date(`${f}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d }
const resta = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
const DIAS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']
const minutos = (t) => { const [h, m] = hm(t).split(':').map(Number); return h * 60 + m }

// Resultado del día de un colaborador: actividades hechas / total + ventas de tienda.
async function hechosDia(supabase, uid, fecha, plantillas, horarios) {
  const hor = horarios.find(h => h.dia === dowDe(fecha))
  if (!hor) return null
  const dow = dowDe(fecha)
  const tareas = plantillas.filter(p => p.para === 'colaborador' && p.dias.includes(dow) && hm(p.hora) >= hm(hor.desde) && hm(p.hora) < hm(hor.hasta))
  const { data: hs } = await supabase.from('jarvis_hechas').select('plantilla_id, estado').eq('usuario_id', uid).eq('fecha', fecha)
  const ok = new Set((hs || []).filter(h => h.estado === 'hecha').map(h => h.plantilla_id))
  const { data: vs } = await supabase.from('ventas_tienda').select('cantidad, precio_unitario')
    .eq('vendedor_id', uid).gte('creado_en', `${fecha}T00:00:00`).lt('creado_en', `${resta(fecha, -1)}T00:00:00`)
  const ventas = vs || []
  return {
    fecha, turno: `${hm(hor.desde)}-${hm(hor.hasta)}`,
    actividades_total: tareas.length, actividades_hechas: tareas.filter(t => ok.has(t.id)).length,
    actividades_pendientes: tareas.filter(t => !ok.has(t.id)).map(t => t.titulo),
    ventas_tienda: ventas.length,
    vendido_pesos: r2(ventas.reduce((s, v) => s + (Number(v.precio_unitario) || 0) * (Number(v.cantidad) || 0), 0)),
    piezas: ventas.reduce((s, v) => s + (Number(v.cantidad) || 0), 0),
  }
}

async function cargarBase(supabase, uid) {
  const [pl, ho] = await Promise.all([
    supabase.from('jarvis_plantillas').select('*').eq('activa', true),
    uid ? supabase.from('jarvis_horarios').select('*').eq('usuario_id', uid) : supabase.from('jarvis_horarios').select('*'),
  ])
  return { plantillas: pl.data || [], horarios: ho.data || [] }
}

// Un mensaje por persona, tipo y día: si ya existe se reutiliza (no se vuelve a gastar IA).
async function obtener(supabase, uid, tipo, fecha, construir) {
  const { data: ex } = await supabase.from('jarvis_mensajes').select('*').eq('usuario_id', uid).eq('tipo', tipo).eq('fecha', fecha).maybeSingle()
  if (ex) return ex
  const contenido = await generarMensaje(tipo, await construir())
  await supabase.from('jarvis_mensajes').upsert({ usuario_id: uid, tipo, fecha, contenido }, { onConflict: 'usuario_id,tipo,fecha', ignoreDuplicates: true })
  const { data } = await supabase.from('jarvis_mensajes').select('*').eq('usuario_id', uid).eq('tipo', tipo).eq('fecha', fecha).maybeSingle()
  return data || { usuario_id: uid, tipo, fecha, contenido }
}

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const esAdmin = sesion.rol === 'admin'
  const url = new URL(req.url)
  const { fecha, hhmm } = ahora()
  const nombre = String(sesion.nombre || '').split(' ')[0]
  try {
    // Admin: retroalimentación de cierre de sus colaboradores (últimos 3 días)
    if (url.searchParams.get('equipo')) {
      if (!esAdmin) return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const { data: ms } = await supabase.from('jarvis_mensajes').select('*').eq('tipo', 'cierre').gte('fecha', resta(fecha, 3)).order('fecha', { ascending: false })
      const ids = [...new Set((ms || []).map(m => m.usuario_id))]
      const { data: cl } = await supabase.from('clientes').select('id, nombre').in('id', ids.length ? ids : [NADIE])
      return NextResponse.json({ ok: true, cierres: (ms || []).map(m => ({ ...m, nombre: cl?.find(c => c.id === m.usuario_id)?.nombre || '' })) })
    }

    if (esAdmin) {
      const m = await obtener(supabase, sesion.id, 'admin_manana', fecha, async () => {
        const r = await (await resumenAdmin(req)).json()
        const { plantillas, horarios } = await cargarBase(supabase, null)
        const ayer = resta(fecha, 1)
        const uids = [...new Set(horarios.map(h => h.usuario_id))]
        const { data: cl } = await supabase.from('clientes').select('id, nombre').in('id', uids.length ? uids : [NADIE])
        const equipo = []
        for (const uid of uids) {
          const h = await hechosDia(supabase, uid, ayer, plantillas, horarios.filter(x => x.usuario_id === uid))
          equipo.push({ nombre: cl?.find(c => c.id === uid)?.nombre, ayer: h })
        }
        return {
          nombre, hoy: fecha, hora_actual: hhmm, dia_semana: DIAS[dowDe(fecha) - 1],
          dinero_entrado: r.dinero,
          tienda: { hoy: r.tienda?.hoy, ayer: r.tienda?.ayer, semana: r.tienda?.semana, semana_anterior: r.tienda?.semana_anterior, piezas_semana: r.tienda?.piezas_semana },
          top_productos: r.top, por_resurtir: r.resurtir,
          requiere_atencion: (r.atencion || []).map(a => ({ tema: a.t, cantidad: a.n })),
          equipo,
        }
      })
      return NextResponse.json({ ok: true, admin_manana: m.contenido, creado_en: m.creado_en })
    }

    // Colaborador: arranque durante el turno, cierre en la última media hora
    const { plantillas, horarios } = await cargarBase(supabase, sesion.id)
    const hor = horarios.find(h => h.dia === dowDe(fecha))
    if (!hor) return NextResponse.json({ ok: true, arranque: null, cierre: null })
    const enTurno = hhmm >= hm(hor.desde)
    const casiFin = minutos(hhmm) >= minutos(hor.hasta) - 30
    const contexto = async () => {
      const hoyD = await hechosDia(supabase, sesion.id, fecha, plantillas, horarios)
      const ultimos = []
      for (let i = 1; i <= 7; i++) { const h = await hechosDia(supabase, sesion.id, resta(fecha, i), plantillas, horarios); if (h) ultimos.push(h) }
      return { nombre, hora_actual: hhmm, dia_semana: DIAS[dowDe(fecha) - 1], hoy: hoyD, turno_anterior: ultimos[0] || null, ultimos_turnos: ultimos }
    }
    const out = { ok: true, arranque: null, cierre: null }
    if (enTurno) out.arranque = (await obtener(supabase, sesion.id, 'arranque', fecha, contexto)).contenido
    if (casiFin) out.cierre = (await obtener(supabase, sesion.id, 'cierre', fecha, contexto)).contenido
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
