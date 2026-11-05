import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes, vistaPaquete, codigosAceptados, canon } from '@/lib/mercadolibre/empaque'

// Paso 1: escanear cada pieza de cada producto del paquete.
// Respuesta: correcto | ya_completo | desconocido | incorrecto
//  - desconocido: ese paquete tiene productos sin ningún código conocido; el
//    colaborador debe confirmar cuál es (se aprende para la próxima).
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const codigo = canon(b.codigo)
  // La cámara puede leer varios códigos a la vez: se prueban todos.
  const todos = [...new Set([codigo, ...(Array.isArray(b.codigos) ? b.codigos.slice(0, 8).map(canon) : [])].filter(Boolean))]
  if (!b.paquete || !codigo) return NextResponse.json({ ok: false, mensaje: 'No se leyó ningún código' }, { status: 400 })

  const supabase = clienteSupabaseServicio()
  try {
    const paquetes = await cargarPaquetes(supabase)
    const p = paquetes.find(x => x.paquete === String(b.paquete))
    if (!p) return NextResponse.json({ ok: false, mensaje: 'Ese paquete ya no está pendiente' })
    if (!p.listo || !p.etiqueta_lista) return NextResponse.json({ ok: false, mensaje: 'Este paquete todavía no se puede empacar' })

    const { data: filas } = await supabase.from('ml_venta_items')
      .select('id, item_id, variacion_id, titulo, sku, producto_id, cantidad, cantidad_escaneada')
      .in('id', p.items.map(i => i.id))
    const codigos = await codigosAceptados(supabase, filas || [])
    const coincide = (i) => todos.some(c => codigos.get(i.id)?.has(c))
    const pendientes = (filas || []).filter(i => i.cantidad_escaneada < i.cantidad)

    const it = pendientes.find(coincide)
    if (it) {
      const { data: act } = await supabase.from('ml_venta_items')
        .update({ cantidad_escaneada: it.cantidad_escaneada + 1 })
        .eq('id', it.id).eq('cantidad_escaneada', it.cantidad_escaneada).select('id')
      if (!act?.length) return NextResponse.json({ ok: false, mensaje: 'Se escaneó al mismo tiempo en otro lugar. Intenta de nuevo.' })
      const nuevo = await cargarPaquetes(supabase)
      const pq = nuevo.find(x => x.paquete === p.paquete)
      return NextResponse.json({
        ok: true, resultado: 'correcto', titulo: it.titulo,
        escaneadas: it.cantidad_escaneada + 1, cantidad: it.cantidad,
        paquete: pq ? vistaPaquete(pq) : null,
      })
    }
    const completo = (filas || []).find(i => i.cantidad_escaneada >= i.cantidad && coincide(i))
    if (completo) {
      return NextResponse.json({ ok: true, resultado: 'ya_completo', titulo: completo.titulo, mensaje: `Ya escaneaste todas las piezas de ${completo.titulo}.` })
    }
    const sinCodigo = pendientes.filter(i => !codigos.get(i.id)?.size)
    if (sinCodigo.length) {
      return NextResponse.json({
        ok: true, resultado: 'desconocido',
        candidatos: sinCodigo.map(i => ({ id: i.id, titulo: i.titulo })),
        mensaje: 'No conozco este código todavía. Si ya tienes el producto en la mano, elige cuál es.',
      })
    }
    return NextResponse.json({
      ok: true, resultado: 'incorrecto',
      mensaje: `Ese no es. Busca: ${pendientes[0]?.titulo || 'el siguiente producto'}.`,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
