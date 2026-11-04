import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export const dynamic = 'force-dynamic'

const TIPOS = ['relevo', 'pidieron', 'se_acaba', 'danado', 'otro']

// GET
//  · Colaborador: la nota de relevo más reciente (últimas 36 h) de OTRA persona
//    que todavía no ha leído.
//  · Admin con ?admin=1: avisos por atender (todo menos relevos) + últimos relevos.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const url = new URL(req.url)
  try {
    const nombres = async (ids) => {
      const lista = [...new Set(ids)]
      if (!lista.length) return {}
      const { data } = await supabase.from('clientes').select('id, nombre').in('id', lista)
      return Object.fromEntries((data || []).map(c => [c.id, c.nombre]))
    }

    if (url.searchParams.get('admin')) {
      if (sesion.rol !== 'admin') return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const { data, error } = await supabase.from('jarvis_avisos').select('*').order('creado_en', { ascending: false }).limit(80)
      if (error) throw new Error(error.message)
      const nom = await nombres((data || []).map(a => a.creado_por))
      const lista = (data || []).map(a => ({ ...a, autor: (nom[a.creado_por] || 'Alguien').split(' ')[0] }))
      return NextResponse.json({
        ok: true,
        pendientes: lista.filter(a => a.tipo !== 'relevo' && !a.resuelto_en),
        resueltos: lista.filter(a => a.tipo !== 'relevo' && a.resuelto_en).slice(0, 10),
        relevos: lista.filter(a => a.tipo === 'relevo').slice(0, 5),
      })
    }

    const desde = new Date(Date.now() - 36 * 3600000).toISOString()
    const { data, error } = await supabase.from('jarvis_avisos').select('*')
      .eq('tipo', 'relevo').neq('creado_por', sesion.id).gte('creado_en', desde)
      .order('creado_en', { ascending: false }).limit(5)
    if (error) throw new Error(error.message)
    const sinLeer = (data || []).filter(a => !(a.leido_por || []).includes(sesion.id))
    const nom = await nombres(sinLeer.map(a => a.creado_por))
    return NextResponse.json({
      ok: true,
      relevos: sinLeer.map(a => ({ id: a.id, texto: a.texto, autor: (nom[a.creado_por] || 'Tu compañero').split(' ')[0], creado_en: a.creado_en })),
    })
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
    if (body.accion === 'crear') {
      const texto = String(body.texto || '').trim().slice(0, 600)
      if (!TIPOS.includes(body.tipo)) return NextResponse.json({ ok: false, mensaje: 'Tipo no válido' }, { status: 400 })
      if (texto.length < 3) return NextResponse.json({ ok: false, mensaje: 'Escribe un poco más de detalle' })
      const { error } = await supabase.from('jarvis_avisos').insert({ tipo: body.tipo, texto, creado_por: sesion.id })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'leer') {
      const { data: a, error: e0 } = await supabase.from('jarvis_avisos').select('id, leido_por').eq('id', body.id).single()
      if (e0 || !a) return NextResponse.json({ ok: false, mensaje: 'No existe' })
      const leido = [...new Set([...(a.leido_por || []), sesion.id])]
      const { error } = await supabase.from('jarvis_avisos').update({ leido_por: leido }).eq('id', a.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'resolver') {
      if (sesion.rol !== 'admin') return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const { error } = await supabase.from('jarvis_avisos').update({ resuelto_en: new Date().toISOString(), resuelto_por: sesion.id }).eq('id', body.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
