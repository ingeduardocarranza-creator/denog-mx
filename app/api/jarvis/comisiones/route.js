import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { pctEstandar } from '@/lib/jarvis/comisiones'

export const dynamic = 'force-dynamic'

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

// GET
//  · Colaborador: su monedero. Solo ve montos de comisión — nunca la utilidad
//    ni el porcentaje, porque con eso se podría deducir el costo.
//  · Admin con ?admin=1: solicitudes por aprobar + saldos por colaborador.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const esAdmin = sesion.rol === 'admin'
  const url = new URL(req.url)

  try {
    if (url.searchParams.get('admin')) {
      if (!esAdmin) return NextResponse.json({ ok: false, mensaje: 'Solo el admin' }, { status: 403 })
      const { data: todas, error } = await supabase
        .from('comisiones_colaborador').select('*').order('creada_en', { ascending: false }).limit(300)
      if (error) throw new Error(error.message)

      const ids = [...new Set((todas || []).map(c => c.colaborador_id))]
      const { data: nombres } = ids.length
        ? await supabase.from('clientes').select('id, nombre').in('id', ids) : { data: [] }
      const nombreDe = (id) => (nombres || []).find(n => n.id === id)?.nombre || 'Sin nombre'

      // Detalle de lo vendido, para que el admin sepa qué está aprobando.
      const pendientes = (todas || []).filter(c => c.estado === 'pendiente')
      const txIds = pendientes.map(c => c.transaccion_id).filter(Boolean)
      const domIds = pendientes.map(c => c.domicilio_id).filter(Boolean)
      const [{ data: tx }, { data: ventas }, { data: doms }] = await Promise.all([
        txIds.length ? supabase.from('transacciones').select('id, folio, cliente_id').in('id', txIds) : { data: [] },
        txIds.length ? supabase.from('ventas_tienda').select('transaccion_id, nombre_producto, cantidad, precio_unitario').in('transaccion_id', txIds) : { data: [] },
        domIds.length ? supabase.from('domicilios').select('id, nombre_externo, items_tienda').in('id', domIds) : { data: [] },
      ])

      const solicitudes = pendientes.map(c => {
        let detalle = [], titulo = ''
        if (c.origen === 'venta') {
          detalle = (ventas || []).filter(v => v.transaccion_id === c.transaccion_id)
            .map(v => `${v.cantidad}× ${v.nombre_producto}`)
          titulo = `Venta ${(tx || []).find(t => t.id === c.transaccion_id)?.folio || ''}`.trim()
        } else {
          const d = (doms || []).find(x => x.id === c.domicilio_id)
          detalle = (d?.items_tienda || []).map(i => `${i.cantidad}× ${i.nombre}`)
          titulo = `Domicilio · ${d?.nombre_externo || ''}`.trim()
        }
        return { ...c, colaborador: nombreDe(c.colaborador_id), titulo, detalle }
      })

      const saldos = ids.map(id => {
        const mias = (todas || []).filter(c => c.colaborador_id === id)
        const suma = (estado) => redondear(mias.filter(c => c.estado === estado).reduce((s, c) => s + Number(c.monto || 0), 0))
        return { colaborador_id: id, nombre: nombreDe(id), por_pagar: suma('aprobada'), pagado: suma('pagada'), pendientes: mias.filter(c => c.estado === 'pendiente').length }
      })
      return NextResponse.json({ ok: true, solicitudes, saldos, pct_estandar: await pctEstandar(supabase) })
    }

    // Monedero del colaborador
    const { data, error } = await supabase
      .from('comisiones_colaborador')
      .select('id, origen, total_venta, monto, estado, creada_en, pagada_en')
      .eq('colaborador_id', sesion.id).order('creada_en', { ascending: false }).limit(60)
    if (error) throw new Error(error.message)
    const lista = data || []
    const suma = (estado) => redondear(lista.filter(c => c.estado === estado).reduce((s, c) => s + Number(c.monto || 0), 0))
    return NextResponse.json({
      ok: true,
      saldo: suma('aprobada'),
      pagado: suma('pagada'),
      en_revision: lista.filter(c => c.estado === 'pendiente').length,
      historial: lista.map(c => ({
        id: c.id, origen: c.origen, total_venta: c.total_venta, estado: c.estado,
        monto: c.estado === 'aprobada' || c.estado === 'pagada' ? c.monto : null,
        fecha: c.creada_en,
      })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

// PATCH (solo admin): aprobar con % de utilidad (o monto manual), rechazar, o
// marcar como pagadas todas las aprobadas de un colaborador.
export async function PATCH(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))

  try {
    if (body.accion === 'config') {
      const n = Number(body.porcentaje)
      if (!(n >= 0 && n <= 100)) return NextResponse.json({ ok: false, mensaje: 'El porcentaje debe estar entre 0 y 100' })
      const { error } = await supabase.from('jarvis_config').upsert({ clave: 'comision_pct_default', valor: n, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, porcentaje: n })
    }

    if (body.accion === 'pagar') {
      if (!body.colaborador_id) return NextResponse.json({ ok: false, mensaje: 'Falta el colaborador' })
      const { data, error } = await supabase.from('comisiones_colaborador')
        .update({ estado: 'pagada', pagada_en: new Date().toISOString(), pagada_por: sesion.id })
        .eq('colaborador_id', body.colaborador_id).eq('estado', 'aprobada').select('id, monto')
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, pagadas: (data || []).length, total: redondear((data || []).reduce((s, c) => s + Number(c.monto || 0), 0)) })
    }

    const { data: c, error: e0 } = await supabase.from('comisiones_colaborador').select('*').eq('id', body.id).single()
    if (e0 || !c) return NextResponse.json({ ok: false, mensaje: 'No existe esa solicitud' })
    if (c.estado !== 'pendiente') return NextResponse.json({ ok: false, mensaje: 'Esa solicitud ya fue resuelta' })

    if (body.accion === 'rechazar') {
      const { error } = await supabase.from('comisiones_colaborador').update({
        estado: 'rechazada', nota: String(body.nota || '').trim().slice(0, 300) || null,
        resuelta_por: sesion.id, resuelta_en: new Date().toISOString(),
      }).eq('id', c.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (body.accion === 'aprobar') {
      let monto, porcentaje = null
      if (c.utilidad != null && body.porcentaje != null && body.porcentaje !== '') {
        porcentaje = Number(body.porcentaje)
        if (!(porcentaje >= 0 && porcentaje <= 100)) return NextResponse.json({ ok: false, mensaje: 'El porcentaje debe estar entre 0 y 100' })
        monto = redondear(Math.max(0, Number(c.utilidad)) * porcentaje / 100)
      } else {
        monto = redondear(body.monto)
        if (!(monto >= 0)) return NextResponse.json({ ok: false, mensaje: 'Escribe el monto de la comisión' })
      }
      const { error } = await supabase.from('comisiones_colaborador').update({
        estado: 'aprobada', porcentaje, monto,
        resuelta_por: sesion.id, resuelta_en: new Date().toISOString(),
      }).eq('id', c.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, monto })
    }
    return NextResponse.json({ ok: false, mensaje: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
