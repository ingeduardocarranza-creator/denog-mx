import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { traerTodo } from '@/lib/traerTodo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  // La tabla completa: 4,000 renglones y subiendo. Sin paginar llegaban 1,000
  // y el score se calculaba con una cuarta parte de la historia del cliente.
  try {
    const pedidos = await traerTodo((a, b) => supabase
      .from('pedidos')
      .select('id, cliente_id, entrega_id, precio_venta, costo_mxn, estado, creado_en')
      .range(a, b))
    return NextResponse.json({ ok: true, pedidos })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}