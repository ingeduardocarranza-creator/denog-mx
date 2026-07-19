import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const tipo = searchParams.get('tipo')
  const resumen = searchParams.get('resumen')

  if (resumen === 'true') {
    const desde = searchParams.get('desde')
    const inicio = desde || `${fecha}T00:00:00`
    const fin = `${fecha}T23:59:59`
    const { data, error } = await supabase
      .from('pagos')
      .select('monto, metodo')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })

    const efectivo = data.filter(p => p.metodo?.toLowerCase() === 'efectivo').reduce((s, p) => s + p.monto, 0)
    const transferencia = data.filter(p => p.metodo?.toLowerCase() === 'transferencia').reduce((s, p) => s + p.monto, 0)
    const terminal = data.filter(p => p.metodo?.toLowerCase() === 'terminal').reduce((s, p) => s + p.monto, 0)

    const { data: retiros } = await supabase
      .from('retiros_caja')
      .select('monto')
      .eq('estado', 'confirmado')
      .gte('creado_en', inicio)
      .lte('creado_en', fin)

    const totalRetiros = (retiros || []).reduce((s, r) => s + r.monto, 0)

    return NextResponse.json({ ok: true, efectivo, transferencia, terminal, totalRetiros })
  }

  let query = supabase
    .from('cortes_caja')
    .select('*, clientes(nombre)')
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
  const {
    tipo,
    billetes_1000, billetes_500, billetes_200, billetes_100, billetes_50, billetes_20,
    monedas_20, monedas_10, monedas_5, monedas_2, monedas_1, monedas_50c,
    total_contado, total_esperado, diferencia, justificacion,
    total_efectivo, total_transferencia, total_terminal, total_retiros,
  } = await req.json()

  if (!['apertura', 'corte'].includes(tipo)) {
    return NextResponse.json({ ok: false, mensaje: 'Tipo inválido' })
  }

  const { data, error } = await supabase
    .from('cortes_caja')
    .insert([{
      colaborador_id: sesion.id,
      tipo,
      billetes_1000, billetes_500, billetes_200, billetes_100, billetes_50, billetes_20,
      monedas_20, monedas_10, monedas_5, monedas_2, monedas_1, monedas_50c,
      total_contado, total_esperado, diferencia, justificacion,
      total_efectivo, total_transferencia, total_terminal, total_retiros,
    }])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, corte: data[0] })
}