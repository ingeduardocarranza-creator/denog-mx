import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio, obtenerAcceso } from '@/lib/mercadolibre/api'

export const maxDuration = 30

// Descarga la etiqueta de envío en PDF para imprimirla. Solo si MercadoLibre ya
// la tiene lista (ready_to_print). Estas etiquetas traen datos del comprador:
// por eso solo salen aquí, con sesión, y no se guardan en el servidor.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const paquete = new URL(req.url).searchParams.get('paquete') || ''
  if (!/^\d+$/.test(paquete)) return NextResponse.json({ ok: false, mensaje: 'Este paquete no lleva etiqueta de MercadoLibre' }, { status: 400 })

  const supabase = clienteSupabaseServicio()
  try {
    const { data: v } = await supabase.from('ml_ventas').select('etiqueta_lista')
      .eq('paquete', paquete).eq('empaque_estado', 'pendiente').limit(1).maybeSingle()
    if (!v) return NextResponse.json({ ok: false, mensaje: 'Ese paquete ya no está pendiente' }, { status: 404 })
    if (!v.etiqueta_lista) return NextResponse.json({ ok: false, mensaje: 'La etiqueta todavía no está lista.' }, { status: 409 })

    const { token } = await obtenerAcceso(supabase)
    const res = await fetch(`https://api.mercadolibre.com/shipment_labels?shipment_ids=${paquete}&response_type=pdf`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, mensaje: `MercadoLibre no entregó la etiqueta (${res.status}). ${txt.slice(0, 150)}` }, { status: 502 })
    }
    const buf = await res.arrayBuffer()
    await supabase.from('ml_eventos').insert({ paquete, tipo: 'etiqueta_descargada', hecho_por: sesion.nombre || String(sesion.id) })
    return new Response(buf, {
      headers: {
        'content-type': res.headers.get('content-type') || 'application/pdf',
        'content-disposition': `inline; filename="etiqueta-${paquete}.pdf"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
