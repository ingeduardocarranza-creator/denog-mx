import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes, vistaPaquete, codigosAceptados, canon } from '@/lib/mercadolibre/empaque'

// El colaborador confirma "este código es de este producto" (solo si ese
// producto no tenía ningún código conocido). Cuenta como un escaneo correcto.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const codigo = canon(b.codigo)
  const itemRow = Number(b.item_row_id)
  if (!b.paquete || !codigo || !Number.isInteger(itemRow)) return NextResponse.json({ ok: false, mensaje: 'Datos incompletos' }, { status: 400 })

  const supabase = clienteSupabaseServicio()
  try {
    const paquetes = await cargarPaquetes(supabase)
    const p = paquetes.find(x => x.paquete === String(b.paquete))
    if (!p || !p.items.some(i => i.id === itemRow)) return NextResponse.json({ ok: false, mensaje: 'Ese producto no está en este paquete' })

    const { data: filas } = await supabase.from('ml_venta_items')
      .select('id, item_id, variacion_id, titulo, sku, producto_id, cantidad, cantidad_escaneada').in('id', p.items.map(i => i.id))
    const codigos = await codigosAceptados(supabase, filas || [])
    const it = (filas || []).find(i => i.id === itemRow)
    if (!it || codigos.get(it.id)?.size) return NextResponse.json({ ok: false, mensaje: 'Ese producto ya tiene código conocido; escanea el correcto.' })
    if (it.cantidad_escaneada >= it.cantidad) return NextResponse.json({ ok: false, mensaje: 'Ya escaneaste todas las piezas de ese producto.' })

    // El código no puede ser de otro producto ya conocido.
    for (const [id, set] of codigos) if (id !== it.id && set.has(codigo)) {
      return NextResponse.json({ ok: false, mensaje: 'Ese código ya es de otro producto.' })
    }

    const por = sesion.nombre || String(sesion.id)
    await supabase.from('ml_codigos_producto').upsert({
      item_id: it.item_id, variacion_id: it.variacion_id, codigo, confirmado_por: por,
    }, { onConflict: 'item_id,variacion_id,codigo', ignoreDuplicates: true })
    await supabase.from('ml_eventos').insert({ paquete: p.paquete, tipo: 'codigo_aprendido', detalle: { item_row: it.id, codigo }, hecho_por: por })
    await supabase.from('ml_venta_items').update({ cantidad_escaneada: it.cantidad_escaneada + 1 }).eq('id', it.id)

    const nuevo = (await cargarPaquetes(supabase)).find(x => x.paquete === p.paquete)
    return NextResponse.json({
      ok: true, resultado: 'correcto', titulo: it.titulo,
      escaneadas: it.cantidad_escaneada + 1, cantidad: it.cantidad,
      paquete: nuevo ? vistaPaquete(nuevo) : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
