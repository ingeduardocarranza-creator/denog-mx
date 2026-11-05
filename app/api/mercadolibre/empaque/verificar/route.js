import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes } from '@/lib/mercadolibre/empaque'

// Paso final: escanear la etiqueta ya pegada. Si es de este paquete se termina
// de empacar y SE DESCUENTA el stock del catálogo (solo de lo que estaba en
// stock). Se acepta si el número leído contiene el número de envío, el Pack ID
// o el número de la orden. Todo escaneo queda guardado para poder ajustar la
// lectura con etiquetas reales.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  let b
  try { b = await req.json() } catch { return NextResponse.json({ ok: false, mensaje: 'Datos inválidos' }, { status: 400 }) }
  const leido = String(b.codigo || '').slice(0, 400)
  const digitos = leido.replace(/\D/g, '')
  if (!b.paquete || !digitos) return NextResponse.json({ ok: false, mensaje: 'No se leyó ningún código' }, { status: 400 })

  const supabase = clienteSupabaseServicio()
  const por = sesion.nombre || String(sesion.id)
  try {
    const p = (await cargarPaquetes(supabase)).find(x => x.paquete === String(b.paquete))
    if (!p) return NextResponse.json({ ok: false, mensaje: 'Ese paquete ya no está pendiente' })
    if (!p.items.every(i => i.cantidad_escaneada >= i.cantidad)) {
      return NextResponse.json({ ok: false, mensaje: 'Primero escanea todos los productos.' })
    }

    const validos = [p.shipment_id, p.pack_id, ...p.orden_ids].filter(Boolean).map(String)
    const coincide = validos.some(v => digitos.includes(v))
    await supabase.from('ml_eventos').insert({
      paquete: p.paquete, tipo: 'etiqueta_escaneada', detalle: { leido, coincide }, hecho_por: por,
    })
    if (!coincide) {
      return NextResponse.json({ ok: true, resultado: 'incorrecta', mensaje: 'Esa etiqueta es de otra venta. Revisa que pegaste la correcta.' })
    }

    const { data, error } = await supabase.rpc('ml_empacar_paquete', { p_paquete: p.paquete, p_por: por })
    if (error) return NextResponse.json({ ok: true, resultado: 'error', mensaje: error.message })
    return NextResponse.json({ ok: true, resultado: 'listo', descuentos: data?.descuentos || [] })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
