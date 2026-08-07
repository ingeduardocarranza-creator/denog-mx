import { dentroDeHorario } from './horario'

const MINUTOS_UMBRAL = 15

// Revisa conversaciones donde el cliente escribió y nadie ha contestado
// (ni una persona, ni el eco de un mensaje mandado desde el celular) desde
// hace más de 15 minutos, dentro del horario de atención, y abre un
// pendiente si todavía no hay uno abierto para ese número.
//
// No corre solo: se llama desde GET /api/pendientes/count, que el menú
// lateral ya consulta cada 20 segundos en cualquier pantalla del admin
// mientras alguien del equipo tiene el sistema abierto — no hace falta un
// cron aparte.
export async function barrerSinResponder(supabase) {
  if (!dentroDeHorario()) return

  const limite = new Date(Date.now() - MINUTOS_UMBRAL * 60000).toISOString()

  const { data: conversaciones, error } = await supabase
    .from('conversaciones_whatsapp')
    .select('telefono_whatsapp, nombre_whatsapp, cliente_id, ultimo_mensaje_cliente_en, ultimo_mensaje_cliente_wa_id, ultima_respuesta_staff_en')
    .lte('ultimo_mensaje_cliente_en', limite)

  if (error) { console.error('[sweepSinResponder] error leyendo conversaciones:', error.message); return }

  for (const c of conversaciones || []) {
    if (!c.ultimo_mensaje_cliente_en) continue
    if (c.ultima_respuesta_staff_en && c.ultima_respuesta_staff_en >= c.ultimo_mensaje_cliente_en) continue // ya contestaron

    const { count } = await supabase
      .from('pendientes')
      .select('id', { count: 'exact', head: true })
      .eq('telefono_whatsapp', c.telefono_whatsapp)
      .eq('tipo', 'sin_responder')
      .in('estado', ['nuevo', 'visto'])
    if (count > 0) continue // ya hay uno abierto, no duplicar

    const minutos = Math.floor((Date.now() - new Date(c.ultimo_mensaje_cliente_en).getTime()) / 60000)
    await supabase.from('pendientes').insert({
      tipo: 'sin_responder',
      telefono_whatsapp: c.telefono_whatsapp,
      nombre_whatsapp: c.nombre_whatsapp,
      cliente_id: c.cliente_id,
      resumen: `Sin respuesta desde hace ${minutos} min`,
      // Prefijo para no chocar con el mensaje_wa_id que pudo haber generado
      // un pendiente de tipo comprobante/pedido_especifico para este mismo
      // mensaje — son cosas distintas y ambas deben poder existir.
      mensaje_wa_id: c.ultimo_mensaje_cliente_wa_id ? `sinresp-${c.ultimo_mensaje_cliente_wa_id}` : null,
    })
  }
}
