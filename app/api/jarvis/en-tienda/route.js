import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { a10Digitos, paraWaMe } from '@/lib/whatsapp/telefono'
import { enviarEstadoCuentaPorWhatsapp } from '@/lib/whatsapp/enviarDocumentos'
import { cerrarComoEntregado } from '@/lib/jarvis/enTienda'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const horaLocal = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Hermosillo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date())

// GET (admin): lo que los colaboradores confirmaron, ordenado por cliente.
//  - por_avisar: siguen en tienda (con foto), aún sin avisar al cliente.
//  - por_investigar: "no está".
//  - avisados: ya avisados (últimos 30).
//  - regularizados: pedidos que se cerraron como Entregado por error de no marcarlos.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const { data: confs, error } = await supabase.from('jarvis_confirmaciones')
      .select('id, cliente_id, entrega_id, resultado, foto_url, piezas, monto, confirmado_por, creada_en, avisado_en, resuelto_en, nota')
      .in('resultado', ['en_tienda', 'no_esta']).order('creada_en', { ascending: false }).limit(1000)
    if (error) throw new Error(error.message)

    const cliIds = [...new Set((confs || []).map(c => c.cliente_id))]
    const entIds = [...new Set((confs || []).map(c => c.entrega_id))]
    const quienIds = [...new Set((confs || []).map(c => c.confirmado_por).filter(Boolean))]
    const [{ data: clientes }, { data: entregas }, { data: quienes }] = await Promise.all([
      cliIds.length ? supabase.from('clientes').select('id, nombre, telefono').in('id', cliIds) : { data: [] },
      entIds.length ? supabase.from('entregas').select('id, fecha_entrega').in('id', entIds) : { data: [] },
      quienIds.length ? supabase.from('clientes').select('id, nombre').in('id', quienIds) : { data: [] },
    ])
    const nombreDe = (id) => (clientes || []).find(c => c.id === id)
    const fila = (c) => {
      const cl = nombreDe(c.cliente_id)
      const tel = a10Digitos(cl?.telefono)
      return {
        id: c.id, cliente_id: c.cliente_id, entrega_id: c.entrega_id, nombre: cl?.nombre || 'Cliente',
        tiene_telefono: !!tel, wa: tel ? paraWaMe(tel) : null,
        fecha_entrega: (entregas || []).find(e => e.id === c.entrega_id)?.fecha_entrega || null,
        foto_url: c.foto_url, piezas: c.piezas, monto: Number(c.monto) || 0, nota: c.nota,
        confirmo: ((quienes || []).find(q => q.id === c.confirmado_por)?.nombre || '').split(' ')[0] || null,
        creada_en: c.creada_en, avisado_en: c.avisado_en,
      }
    }
    const agrupar = (filas) => {
      const m = {}
      for (const f of filas) (m[f.cliente_id] ||= { cliente_id: f.cliente_id, nombre: f.nombre, wa: f.wa, tiene_telefono: f.tiene_telefono, entregas: [] }).entregas.push(f)
      return Object.values(m).map(c => ({ ...c, entregas: c.entregas.sort((a, b) => String(a.fecha_entrega).localeCompare(String(b.fecha_entrega))) }))
        .sort((a, b) => String(a.entregas[0].fecha_entrega).localeCompare(String(b.entregas[0].fecha_entrega)))
    }
    const lista = (confs || []).map(fila)
    const { count: regul } = await supabase.from('pedidos').select('id', { count: 'exact', head: true }).not('regularizado_en', 'is', null)
    return NextResponse.json({
      ok: true,
      por_avisar: agrupar(lista.filter((f, i) => confs[i].resultado === 'en_tienda' && !confs[i].avisado_en)),
      cerrados: agrupar(lista.filter((f, i) => confs[i].resultado === 'no_esta').slice(0, 60)),
      avisados: lista.filter((f, i) => confs[i].resultado === 'en_tienda' && confs[i].avisado_en).slice(0, 30),
      regularizados: regul || 0,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

// POST (admin):
//  { accion:'avisar', id }            → manda el estado de cuenta (plantilla) y marca avisado.
//  { accion:'ya_avise', id }          → marca avisado sin enviar (si ya le escribiste tú).
//  { accion:'aparecio', id }          → un "no está" que sí aparecio: pasa a por avisar.
//  { accion:'entregado', id }         → un "no está" que sí se había entregado: se cierra.
//  { accion:'reabrir', id }           → borra la confirmación para que el colaborador la vuelva a ver.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  const { data: conf } = await supabase.from('jarvis_confirmaciones').select('*').eq('id', body.id).maybeSingle()
  if (!conf) return NextResponse.json({ ok: false, mensaje: 'No se encontró la confirmación' }, { status: 404 })
  const ahora = horaLocal()
  try {
    if (body.accion === 'avisar') {
      if (conf.resultado !== 'en_tienda') return NextResponse.json({ ok: false, mensaje: 'Solo se avisa lo que sigue en tienda' })
      const r = await enviarEstadoCuentaPorWhatsapp(supabase, { entregaId: conf.entrega_id, clienteId: conf.cliente_id, enviadoPor: sesion.id })
      if (!r.ok) return NextResponse.json({ ok: false, mensaje: r.mensaje || 'No se pudo enviar' })
      await supabase.from('jarvis_confirmaciones').update({ avisado_en: ahora, avisado_por: sesion.id }).eq('id', conf.id)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'ya_avise') {
      await supabase.from('jarvis_confirmaciones').update({ avisado_en: ahora, avisado_por: sesion.id }).eq('id', conf.id)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'aparecio') {
      await supabase.from('jarvis_confirmaciones').update({ resultado: 'en_tienda', resuelto_en: ahora, resuelto_por: sesion.id }).eq('id', conf.id)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'entregado') {
      const { data: peds } = await supabase.from('pedidos').select('id').eq('cliente_id', conf.cliente_id).eq('entrega_id', conf.entrega_id).eq('estado', 'empacado')
      await cerrarComoEntregado(supabase, { ids: (peds || []).map(p => p.id), usuarioId: sesion.id, ahora })
      await supabase.from('jarvis_confirmaciones').update({ resultado: 'entregado', resuelto_en: ahora, resuelto_por: sesion.id }).eq('id', conf.id)
      return NextResponse.json({ ok: true })
    }
    if (body.accion === 'reabrir') {
      if (conf.resultado === 'no_esta') {
        // Deshace el cierre: los pedidos que se cerraron por esta confirmación vuelven a empacado.
        await supabase.from('pedidos').update({ estado: 'empacado', regularizado_en: null, regularizado_por: null })
          .eq('cliente_id', conf.cliente_id).eq('entrega_id', conf.entrega_id).eq('estado', 'Entregado').not('regularizado_en', 'is', null)
      }
      await supabase.from('jarvis_confirmaciones').delete().eq('id', conf.id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
