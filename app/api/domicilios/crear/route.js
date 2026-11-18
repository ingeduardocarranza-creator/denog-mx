import { calcularDistanciaTienda } from '@/lib/domicilios/distancia'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff, requerirDuenoOStaff } from '@/lib/auth/session'
import { registrarComisionDomicilio } from '@/lib/jarvis/comisiones'
import { geocodificar, dentroDeHermosillo } from '@/lib/domicilios/geocodificar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function POST(req) {
  // Pedidos externos (POS tienda) solo staff. Pedidos de clientes: el propio cliente o staff.
  const body2 = await req.clone().json().catch(() => ({}))
  const esExterno = !!body2.es_externo
  if (esExterno) {
    if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  } else {
    if (!requerirDuenoOStaff(req, String(body2.cliente_id))) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const {
      // Regular domicilio fields
      cliente_id, entrega_ids, direccion, colonia,
      referencias, celular_contacto, celular_contacto_adicional,
      fecha_preferida, horario, notas, distancia_km, costo_envio,
      subtotal, total,
      // External customer fields
      es_externo, nombre_externo, telefono_externo,
      items_tienda, forma_pago_ext, pago_anticipado_ext, metodo_pago_ext,
      // El colaborador marcó que este domicilio es de un cliente suyo (comisión).
      venta_propia, comision_para,
      // Ruta: datos de acceso, hora exacta y dirección guardada usada.
      hora_exacta, recibe_nombre, entre_calles, instrucciones_acceso, direccion_id,
      // Coordenadas si ya vienen resueltas (pin pegado); si no, se geocodifica aquí.
      lat: latBody, lng: lngBody,
    } = body

    // Ubicación: pin enviado o geocodificación en el servidor. Si falla, el
    // domicilio se crea igual (lat/lng quedan null y la ruta lo marca "sin ubicar").
    let lat = null, lng = null
    if (typeof latBody === 'number' && typeof lngBody === 'number' && dentroDeHermosillo(latBody, lngBody)) {
      lat = latBody; lng = lngBody
    } else {
      const geo = await geocodificar({ direccion, colonia, entre_calles })
      if (geo) { lat = geo.lat; lng = geo.lng }
    }

    // For external orders, deduct stock immediately
    if (es_externo && items_tienda?.length) {
      for (const item of items_tienda) {
        if (!item.productoId || item.stockDisponible == null) continue
        const nuevoStock = Math.max(0, item.stockDisponible - item.cantidad)
        await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', item.productoId)
      }
    }

    // Distancia desde la tienda: si no viene calculada, se calcula aquí para que
    // la tarjeta del domicilio ya muestre los km y el costo sugerido.
    let distanciaFinal = distancia_km
    if (distanciaFinal == null && direccion && colonia) {
      const dist = await calcularDistanciaTienda({ direccion, colonia, lat, lng })
      if (dist) distanciaFinal = dist.km
    }

    const { data, error } = await supabase
      .from('domicilios')
      .insert([{
        cliente_id: es_externo ? null : cliente_id,
        entrega_ids: es_externo ? [] : entrega_ids,
        direccion, colonia, referencias,
        celular_contacto: es_externo ? telefono_externo : celular_contacto,
        celular_contacto_adicional,
        fecha_preferida, horario, notas, distancia_km: distanciaFinal, costo_envio,
        subtotal, total,
        hora_exacta: hora_exacta || null,
        recibe_nombre: recibe_nombre || null,
        entre_calles: entre_calles || null,
        instrucciones_acceso: instrucciones_acceso || null,
        direccion_id: direccion_id || null,
        lat, lng, geocodificado_en: lat != null ? new Date().toISOString() : null,
        // External fields
        es_externo: !!es_externo,
        nombre_externo: es_externo ? nombre_externo : null,
        telefono_externo: es_externo ? telefono_externo : null,
        items_tienda: es_externo ? items_tienda : null,
        forma_pago_ext: es_externo ? forma_pago_ext : null,
        pago_anticipado_ext: es_externo ? (pago_anticipado_ext || 0) : null,
        metodo_pago_ext: es_externo ? metodo_pago_ext : null,
        // External orders skip the cost-confirmation step
        estado: es_externo ? 'confirmado' : 'pendiente',
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    if (es_externo && venta_propia === true) {
      const quien = requerirStaff(req)
      if (quien?.rol === 'vendedor' || quien?.rol === 'admin') {
        try {
          let beneficiarioId = quien.rol === 'vendedor' ? quien.id : null
          if (comision_para && comision_para !== quien.id) {
            const { data: u } = await supabase.from('clientes').select('id, rol').eq('id', comision_para).maybeSingle()
            if (u?.rol === 'vendedor') beneficiarioId = u.id
          }
          if (beneficiarioId) await registrarComisionDomicilio(supabase, {
            colaboradorId: beneficiarioId, domicilioId: data.id, items: items_tienda, subtotal,
          })
        } catch (e) { console.error('[comision] no se pudo registrar:', e?.message) }
      }
    }
    return NextResponse.json({ ok: true, domicilio: data })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
