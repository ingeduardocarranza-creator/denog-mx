import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { CATEGORIAS_GASTO } from '@/lib/whatsapp/gastos'

// Aprobar un gasto (por WhatsApp o manual) lo vuelve real: a partir de aquí
// cuenta en reportes. Antes de aprobar, Eduardo puede corregir lo que la IA
// leyó mal del ticket y decidir si el gasto va ligado a una entrega/viaje
// específico o si es un gasto general del negocio (entrega_id null).
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id, monto, categoria, descripcion, fecha_gasto, entrega_id } = await req.json()

  const { data: gasto, error: errBusca } = await supabase
    .from('gastos')
    .select('estado')
    .eq('id', id)
    .single()
  if (errBusca) return NextResponse.json({ ok: false, mensaje: errBusca.message })
  if (!gasto) return NextResponse.json({ ok: false, mensaje: 'Gasto no encontrado' })
  if (gasto.estado !== 'pendiente') return NextResponse.json({ ok: false, mensaje: 'Ese gasto ya fue revisado' })

  if (!monto) return NextResponse.json({ ok: false, mensaje: 'Falta el monto' })
  if (!CATEGORIAS_GASTO.includes(categoria)) return NextResponse.json({ ok: false, mensaje: 'Categoría no válida' })

  const { error } = await supabase
    .from('gastos')
    .update({
      monto,
      categoria,
      descripcion: descripcion || null,
      fecha_gasto: fecha_gasto || new Date().toISOString().slice(0, 10),
      entrega_id: entrega_id || null,
      estado: 'aprobado',
      aprobado_por: sesion.id,
      aprobado_en: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
