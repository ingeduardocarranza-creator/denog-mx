import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

// Fase 7 — control de compras en EUA: qué se devolvió a la tienda y qué
// reembolsaron. Vive junto a Gastos porque ambas son "dinero fuera del
// flujo normal de venta" que Eduardo quiere poder ver de un vistazo.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      id, descripcion, lugar_compra, precio_usd, entrega_id,
      devuelto_en, devuelto_motivo, reembolso_usd, reembolso_en,
      cliente:clientes!pedidos_cliente_id_fkey(nombre),
      entregas(fecha_entrega),
      devuelto_por_nombre:clientes!pedidos_devuelto_por_fkey(nombre)
    `)
    .eq('devuelto', true)
    .order('devuelto_en', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, devoluciones: data || [] })
}
