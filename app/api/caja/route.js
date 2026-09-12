import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const tipo = searchParams.get('tipo')
  const resumen = searchParams.get('resumen')

  if (resumen === 'true') {
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const inicio = desde || `${fecha}T00:00:00`
    // El corte cubre hasta AHORA, no hasta el final del día. Con el fin en
    // 23:59 el resumen incluía lo que todavía no pasaba, y dos turnos del
    // mismo día se pisaban.
    const fin = hasta || `${fecha}T23:59:59`
    const { data, error } = await supabase
      .from('pagos')
      .select('monto, metodo')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })

    const efectivo = data.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
    const transferencia = data.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
    const terminal = data.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)

    // El dinero sale de caja en el momento del retiro, no cuando otro
    // admin lo confirma despues. `confirmado` es un control de auditoria
    // (segregacion de funciones), no debe afectar el calculo de efectivo:
    // si se filtrara solo por confirmados, un retiro pendiente de confirmar
    // se veria como si el dinero siguiera en el cajon, y el corte saldria
    // sobrante por el monto exacto del retiro.
    const { data: retiros } = await supabase
      .from('retiros_caja')
      .select('monto')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)

    const totalRetiros = (retiros || []).reduce((s, r) => s + r.monto, 0)

    return NextResponse.json({ ok: true, efectivo, transferencia, terminal, totalRetiros })
  }

  // El embed automático de `clientes` quedó ambiguo desde que cortes_caja
  // tiene dos FK hacia clientes (colaborador_id y el nuevo revisado_por,
  // Fase 5). Sin el hint del nombre de columna, PostgREST no sabe por cuál
  // unir y la consulta entera fallaba (rompía apertura de turno y toda la
  // pantalla de caja del admin).
  let query = supabase
    .from('cortes_caja')
    .select('*, clientes!colaborador_id(nombre)')
    .order('creado_en', { ascending: false })

  if (fecha) {
    const inicio = `${fecha}T00:00:00`
    const fin = `${fecha}T23:59:59`
    query = query.gte('creado_en', inicio).lte('creado_en', fin)
  }

  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, cortes: data })
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const {
    tipo,
    billetes_1000, billetes_500, billetes_200, billetes_100, billetes_50, billetes_20,
    monedas_20, monedas_10, monedas_5, monedas_2, monedas_1, monedas_50c,
    total_contado, total_esperado, diferencia, justificacion,
    total_efectivo, total_transferencia, total_terminal, total_retiros,
    desde, hasta,
    // El resumen por método se calcula en pantalla llamando a este mismo
    // endpoint con resumen=true. Si esa llamada falla, el corte no debe
    // guardarse con ceros disfrazados de "no hubo ventas": totales_verificados
    // en false dice explícitamente que esos números no se pudieron calcular.
    totales_verificados,
  } = await req.json()

  if (!['apertura', 'corte'].includes(tipo)) {
    return NextResponse.json({ ok: false, mensaje: 'Tipo inválido' })
  }

  // Solo hay UNA caja física: no puede haber dos turnos abiertos al mismo
  // tiempo, ni aunque sea la misma persona dándole doble clic a "Abrir
  // turno". Si el último movimiento registrado (de cualquier colaborador)
  // es una apertura sin corte después, ya hay alguien con el turno abierto
  // y no se deja abrir otro hasta que esa persona cierre el suyo.
  if (tipo === 'apertura') {
    const { data: ultimoMovimiento, error: errUltimo } = await supabase
      .from('cortes_caja')
      .select('tipo, colaborador_id, clientes!colaborador_id(nombre)')
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errUltimo) return NextResponse.json({ ok: false, mensaje: errUltimo.message })
    if (ultimoMovimiento?.tipo === 'apertura') {
      const quien = ultimoMovimiento.colaborador_id === sesion.id ? 'Tú ya tienes' : `${ultimoMovimiento.clientes?.nombre || 'Alguien'} ya tiene`
      return NextResponse.json({
        ok: false,
        mensaje: `${quien} un turno abierto. Hay que cerrarlo antes de poder abrir otro — solo hay una caja.`,
      }, { status: 409 })
    }
  }

  const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)

  if (tipo === 'corte') {
    const verificados = totales_verificados !== false
    if (verificados) {
      // Caso normal: el resumen del turno cargó bien, y estos cuatro números
      // vienen de ahí, no de lo que el colaborador escribió a mano.
      if (![total_efectivo, total_transferencia, total_terminal, total_retiros].every(esNumero)) {
        return NextResponse.json({
          ok: false,
          mensaje: 'Faltan los totales por método del turno (efectivo, transferencia, terminal). Actualiza el resumen antes de cerrar.',
        })
      }
    } else if (!justificacion || !justificacion.trim()) {
      // Válvula de escape: si el resumen de verdad no carga, no se puede dejar
      // a un colaborador sin poder cerrar su turno. Pero cerrar sin esos
      // totales exige explicar por qué, siempre — no solo cuando hay
      // diferencia de efectivo.
      return NextResponse.json({
        ok: false,
        mensaje: 'Para cerrar sin los totales verificados hay que explicar qué pasó.',
      })
    }
  }

  const { data, error } = await supabase
    .from('cortes_caja')
    .insert([{
      colaborador_id: sesion.id,
      tipo,
      billetes_1000, billetes_500, billetes_200, billetes_100, billetes_50, billetes_20,
      monedas_20, monedas_10, monedas_5, monedas_2, monedas_1, monedas_50c,
      total_contado, total_esperado, diferencia, justificacion,
      total_efectivo: esNumero(total_efectivo) ? total_efectivo : null,
      total_transferencia: esNumero(total_transferencia) ? total_transferencia : null,
      total_terminal: esNumero(total_terminal) ? total_terminal : null,
      total_retiros: esNumero(total_retiros) ? total_retiros : null,
      // Qué periodo cubre este corte. Sin este dato el corte no se puede
      // conciliar contra `pagos`: no hay contra qué rango compararlo, y hay
      // que adivinar la ventana. Adivinarla daba cortes con $40,128 de
      // transferencias en 73 minutos.
      desde: desde || null,
      // Y hasta dónde. Es el mismo momento con el que se calcularon los totales
      // que el colaborador vio en pantalla al contar. Sin él, el cuadre
      // comparaba hasta la hora de guardar y un cobro hecho mientras se contaba
      // el efectivo salía como sobrante falso.
      hasta: hasta || null,
      totales_verificados: tipo === 'corte' ? totales_verificados !== false : true,
    }])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, corte: data[0] })
}