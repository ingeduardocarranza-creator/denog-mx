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

  let query = supabase
    .from('retiros_caja')
    .select('*, clientes(nombre)')
    .order('creado_en', { ascending: false })

  if (fecha) {
    const inicio = `${fecha}T00:00:00`
    const fin = `${fecha}T23:59:59`
    query = query.gte('creado_en', inicio).lte('creado_en', fin)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiros: data })
}

export async function POST(req) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('retiros_caja')
    .insert([body])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, retiro: data[0] })
}