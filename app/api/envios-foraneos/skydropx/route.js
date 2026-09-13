import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { obtenerGuiaSkydropx } from '@/lib/skydropx/cliente'

// Autollenar paquetería y número de guía a partir de un ID de envío de
// Skydropx que ya se generó allá -- no crea ni cambia nada en Skydropx.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { skydropx_shipment_id } = await req.json()
  if (!skydropx_shipment_id) return NextResponse.json({ ok: false, mensaje: 'Falta el ID de envío de Skydropx.' })

  try {
    const { numero_guia, paqueteria } = await obtenerGuiaSkydropx(skydropx_shipment_id)
    return NextResponse.json({ ok: true, numero_guia, paqueteria })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: err.message || 'No se pudo consultar Skydropx.' })
  }
}
