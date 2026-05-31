import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha')
  const tipo = searchParams.get('tipo')
  const resumen = searchParams.get('resumen')

  if (resumen === 'true') {
    const inicio = `${fecha}T00:00:00`
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

    return NextResponse.json({ ok: true, efectivo, transferencia, terminal })
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
  const body = await req.json()
  const { data, error } = await supabase
    .from('cortes_caja')
    .insert([body])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, corte: data[0] })
}