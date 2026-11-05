import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes, vistaPaquete } from '@/lib/mercadolibre/empaque'

// "Continuar sin escanear": el colaborador da por revisados los productos
// pendientes sin escanearlos. Queda registro de quién fue en ml_eventos.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  if (!b.paquete) return NextResponse.json({ ok: false, mensaje: 'Datos incompletos' }, { status: 400 })
  const por = sesion.nombre || String(sesion.id)

  const supabase = clienteSupabaseServicio()
  try {
    const p = (await cargarPaquetes(supabase)).find(x => x.paquete === String(b.paquete))
    if (!p || !p.listo || !p.etiqueta_lista) return NextResponse.json({ ok: false, mensaje: 'Este paquete todavía no se puede empacar' })
    const { data: filas } = await supabase.from('ml_venta_items')
      .select('id, titulo, cantidad, cantidad_escaneada').in('id', p.items.map(i => i.id))
    const omitidos = []
    for (const i of filas || []) {
      if (i.cantidad_escaneada < i.cantidad) {
        await supabase.from('ml_venta_items').update({ cantidad_escaneada: i.cantidad }).eq('id', i.id)
        omitidos.push({ item_row: i.id, titulo: i.titulo, sin_escanear: i.cantidad - i.cantidad_escaneada })
      }
    }
    await supabase.from('ml_eventos').insert({ paquete: p.paquete, tipo: 'escaneo_omitido', detalle: { omitidos }, hecho_por: por })
    const nuevo = (await cargarPaquetes(supabase)).find(x => x.paquete === p.paquete)
    return NextResponse.json({ ok: true, paquete: nuevo ? vistaPaquete(nuevo) : null })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
