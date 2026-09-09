// Punto único para mandar el ticket o el estado de cuenta por WhatsApp.
//
// Decide sola si manda la imagen libre (ventana de 24h abierta) o la
// plantilla aprobada (ventana cerrada), sube la imagen, manda el mensaje y
// deja registro en whatsapp_envios — para que si algo no llega, se pueda ver
// desde el panel por qué, en vez de que el cliente se quede sin su ticket y
// nadie se entere.

import { cargarTicket } from '@/lib/ticket/datos'
import { cargarTicketDeEntrega } from '@/lib/ticket/datosEntrega'
import { dibujarTicket } from '@/lib/ticket/dibujar'
import { pngDeDibujo, pngEstadoCuenta } from '@/lib/estadosCuenta/servidor'
import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { resumenParaEnvio, fmt } from '@/lib/estadosCuenta/dibujar'
import { a10Digitos, paraWaMe } from '@/lib/whatsapp/telefono'
import { subirMediaWhatsapp, enviarImagenLibre, enviarPlantillaConImagen, ventanaAbierta } from '@/lib/whatsapp/enviar'
import { PLANTILLA_TICKET, PLANTILLA_ESTADO_CUENTA, fmtFechaPlantilla } from '@/lib/whatsapp/plantillas'

// Mismo texto que ya trae la plantilla aprobada (ticket_compra_denog), para
// que el cliente vea el mensaje completo tanto si se manda como plantilla
// (ventana cerrada) como si se manda libre (ventana de 24h abierta). Antes,
// por la ventana abierta se mandaba nada más "Ticket M-8 — Denog USA
// Compras" como caption de la imagen — se veía "incompleto" al lado del
// mensaje con plantilla, que sí trae el folio, la fecha, el total y el
// agradecimiento.
function textoTicketLibre(datos) {
  return [
    'Gracias por tu compra con DENOG 📦',
    `Folio: ${datos.folio}`,
    `Fecha: ${fmtFechaPlantilla(datos.fecha)}`,
    `Total: ${fmt(datos.total)}`,
    '',
    'Cualquier duda, contáctanos por este medio.',
  ].join('\n')
}

async function registrar(supabase, fila) {
  try {
    await supabase.from('whatsapp_envios').insert(fila)
  } catch (err) {
    // La bitácora no debe tumbar un envío que sí funcionó.
    console.error('[whatsapp] no se pudo registrar en whatsapp_envios:', err?.message)
  }
}

export async function enviarTicketPorWhatsapp(supabase, { transaccionId, enviadoPor = null }) {
  const datos = await cargarTicket(supabase, transaccionId)
  const telefono10 = a10Digitos(datos.cliente.telefono)
  if (!telefono10) {
    return { ok: false, mensaje: 'Ese cliente no tiene teléfono guardado.' }
  }
  const waId = paraWaMe(telefono10)

  let via = null
  let plantillaUsada = null
  try {
    const png = await pngDeDibujo(dibujarTicket, datos, {})
    const mediaId = await subirMediaWhatsapp(png, 'image/png', `ticket-${datos.folio}.png`)

    const abierta = await ventanaAbierta(supabase, telefono10)
    if (abierta) {
      via = 'libre'
      await enviarImagenLibre(waId, mediaId, textoTicketLibre(datos))
    } else {
      via = 'plantilla'
      plantillaUsada = PLANTILLA_TICKET.nombre
      await enviarPlantillaConImagen(waId, PLANTILLA_TICKET, mediaId, PLANTILLA_TICKET.parametros(datos))
    }

    await registrar(supabase, {
      tipo: 'ticket', transaccion_id: transaccionId, cliente_id: datos.cliente?.id || null,
      telefono: telefono10, via, plantilla: plantillaUsada, exito: true, enviado_por: enviadoPor,
    })
    return { ok: true, via, folio: datos.folio }
  } catch (err) {
    console.error('[whatsapp] error mandando ticket:', err.message)
    await registrar(supabase, {
      tipo: 'ticket', transaccion_id: transaccionId, cliente_id: datos.cliente?.id || null,
      telefono: telefono10, via: via || 'libre', plantilla: plantillaUsada, exito: false,
      error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}

// Para cuando alguien recoge un pedido que ya estaba pagado (sin cobro
// nuevo de por medio) — mismo formato de ticket, armado con
// cargarTicketDeEntrega en vez de a partir de una transacción real.
export async function enviarTicketDeEntregaPorWhatsapp(supabase, { clienteId, enviadoPor = null }) {
  const datos = await cargarTicketDeEntrega(supabase, clienteId)
  const telefono10 = a10Digitos(datos.cliente.telefono)
  if (!telefono10) {
    return { ok: false, mensaje: 'Ese cliente no tiene teléfono guardado.' }
  }
  const waId = paraWaMe(telefono10)

  let via = null
  let plantillaUsada = null
  try {
    const png = await pngDeDibujo(dibujarTicket, datos, {})
    const mediaId = await subirMediaWhatsapp(png, 'image/png', `entrega-${datos.cliente.nombre || 'cliente'}.png`)

    const abierta = await ventanaAbierta(supabase, telefono10)
    if (abierta) {
      via = 'libre'
      await enviarImagenLibre(waId, mediaId, textoTicketLibre(datos))
    } else {
      via = 'plantilla'
      plantillaUsada = PLANTILLA_TICKET.nombre
      await enviarPlantillaConImagen(waId, PLANTILLA_TICKET, mediaId, PLANTILLA_TICKET.parametros(datos))
    }

    await registrar(supabase, {
      tipo: 'ticket', transaccion_id: null, cliente_id: clienteId,
      telefono: telefono10, via, plantilla: plantillaUsada, exito: true, enviado_por: enviadoPor,
    })
    return { ok: true, via }
  } catch (err) {
    console.error('[whatsapp] error mandando ticket de entrega:', err.message)
    await registrar(supabase, {
      tipo: 'ticket', transaccion_id: null, cliente_id: clienteId,
      telefono: telefono10, via: via || 'libre', plantilla: plantillaUsada, exito: false,
      error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}

export async function enviarEstadoCuentaPorWhatsapp(supabase, { entregaId, clienteId, enviadoPor = null }) {
  const lista = await cargarEstadosDeCuenta(supabase, entregaId)
  const datos = lista.find(d => String(d.cliente.id) === String(clienteId))
  if (!datos) return { ok: false, mensaje: 'Ese cliente no tiene estado de cuenta en esta entrega.' }

  const telefono10 = a10Digitos(datos.cliente.telefono)
  if (!telefono10) {
    return { ok: false, mensaje: 'Ese cliente no tiene teléfono guardado.' }
  }
  const waId = paraWaMe(telefono10)
  const resumen = resumenParaEnvio(datos.grupos)

  let via = null
  let plantillaUsada = null
  try {
    const png = await pngEstadoCuenta(datos, {})
    const mediaId = await subirMediaWhatsapp(png, 'image/png', `estado-de-cuenta-${datos.cliente.nombre || 'cliente'}.png`)

    const abierta = await ventanaAbierta(supabase, telefono10)
    if (abierta) {
      via = 'libre'
      await enviarImagenLibre(waId, mediaId, `Tu estado de cuenta con Denog — saldo ${fmt(resumen.saldo)}`)
    } else {
      via = 'plantilla'
      plantillaUsada = PLANTILLA_ESTADO_CUENTA.nombre
      const parametros = PLANTILLA_ESTADO_CUENTA.parametros({ nombre: datos.cliente.nombre, ...resumen })
      await enviarPlantillaConImagen(waId, PLANTILLA_ESTADO_CUENTA, mediaId, parametros)
    }

    await registrar(supabase, {
      tipo: 'estado_cuenta', entrega_id: entregaId, cliente_id: clienteId,
      telefono: telefono10, via, plantilla: plantillaUsada, exito: true, enviado_por: enviadoPor,
    })
    return { ok: true, via, saldo: resumen.saldo }
  } catch (err) {
    console.error('[whatsapp] error mandando estado de cuenta:', err.message)
    await registrar(supabase, {
      tipo: 'estado_cuenta', entrega_id: entregaId, cliente_id: clienteId,
      telefono: telefono10, via: via || 'libre', plantilla: plantillaUsada, exito: false,
      error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}
