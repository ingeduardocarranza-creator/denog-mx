// Aviso automático de "tu domicilio quedó agendado", justo cuando se
// confirma el costo de envío en /admin/domicilios (botón Zona corta $50 /
// Zona larga $70). Antes ahí se armaba un mensaje largo y se copiaba al
// portapapeles para pegarlo a mano en WhatsApp; ahora se manda solo, con el
// mismo patrón que el resto de lib/whatsapp: libre si la ventana de 24h
// está abierta, plantilla aprobada si no. Sin imagen — solo texto.
//
// OJO: la plantilla `domicilio_agendado_denog` se dio de alta y se aprobó
// en Meta con 3 variables (nombre, día, dirección). Este archivo ya manda
// las 6 (+ saldo de mercancía, envío y total), que fue lo que Lalo pidió
// después de la primera aprobación — hay que EDITAR la plantilla en
// WhatsApp Manager con el texto nuevo y esperar a que Meta la vuelva a
// aprobar (ver claude/meta-plantillas-ticket-y-estado-cuenta.md en el
// proyecto). Mientras esa segunda aprobación no llegue, el envío por
// plantilla (ventana cerrada) va a fallar con un error de Meta sobre el
// número de variables — el envío libre (ventana abierta) si funciona
// porque no depende de la plantilla. Cada intento, salga bien o mal, queda
// registrado en whatsapp_envios.

import { a10Digitos, paraWaMe } from '@/lib/whatsapp/telefono'
import { enviarTextoLibre, enviarPlantillaConImagen, ventanaAbierta } from '@/lib/whatsapp/enviar'
import { PLANTILLA_DOMICILIO_AGENDADO, formatearFechaLarga } from '@/lib/whatsapp/plantillas'
import { fmt } from '@/lib/estadosCuenta/dibujar'

function textoLibre(datos) {
  return [
    `Hola ${datos.nombre || ''}, tu domicilio con Denog USA Compras quedó agendado 📦`,
    `Día programado: ${datos.diaProgramado}`,
    `Dirección: ${datos.direccion}`,
    `Saldo de mercancía: ${fmt(datos.saldoMercancia)}`,
    `Envío: ${fmt(datos.envio)}`,
    `Total a pagar: ${fmt(datos.total)}`,
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

export async function enviarDomicilioAgendadoPorWhatsapp(supabase, { domicilioId, enviadoPor = null }) {
  const { data: dom, error: errDom } = await supabase
    .from('domicilios')
    .select('id, cliente_id, es_externo, nombre_externo, telefono_externo, direccion, colonia, fecha_preferida, horario, entrega_ids, subtotal, costo_envio, total, pago_anticipado_ext')
    .eq('id', domicilioId)
    .single()
  if (errDom || !dom) return { ok: false, mensaje: 'No se encontró el domicilio.' }

  let nombre = null
  let telefono = null
  if (dom.es_externo) {
    nombre = dom.nombre_externo
    telefono = dom.telefono_externo
  } else {
    const { data: cliente, error: errCliente } = await supabase
      .from('clientes')
      .select('id, nombre, telefono')
      .eq('id', dom.cliente_id)
      .single()
    if (errCliente || !cliente) return { ok: false, mensaje: 'No se encontró el cliente.' }
    nombre = cliente.nombre
    telefono = cliente.telefono
  }

  const telefono10 = a10Digitos(telefono)
  if (!telefono10) return { ok: false, mensaje: 'Ese cliente no tiene teléfono guardado.' }
  const waId = paraWaMe(telefono10)

  // Anticipos ya aplicados a la mercancía de este domicilio — mismo criterio
  // que getTotalAnticipos en app/admin/domicilios/page.js.
  let anticipos = 0
  if (dom.es_externo) {
    anticipos = Number(dom.pago_anticipado_ext || 0)
  } else if (dom.entrega_ids?.length) {
    const { data: pagos } = await supabase
      .from('pagos')
      .select('monto')
      .eq('cliente_id', dom.cliente_id)
      .ilike('tipo', 'anticipo')
      .in('entrega_id', dom.entrega_ids)
    anticipos = (pagos || []).reduce((s, p) => s + Number(p.monto || 0), 0)
  }

  const saldoMercancia = Math.max(0, Number(dom.subtotal || 0) - anticipos)
  const envio = Number(dom.costo_envio || 0)
  const total = saldoMercancia + envio

  const direccion = [dom.direccion, dom.colonia].filter(Boolean).join(', ')
  // Solo el día -- Lalo pidió quitar el horario de este aviso.
  const diaProgramado = formatearFechaLarga(dom.fecha_preferida)

  const datos = { nombre, diaProgramado, direccion, saldoMercancia, envio, total }

  let via = null
  let plantillaUsada = null
  try {
    const abierta = await ventanaAbierta(supabase, telefono10)
    if (abierta) {
      via = 'libre'
      await enviarTextoLibre(waId, textoLibre(datos))
    } else {
      via = 'plantilla'
      plantillaUsada = PLANTILLA_DOMICILIO_AGENDADO.nombre
      await enviarPlantillaConImagen(waId, PLANTILLA_DOMICILIO_AGENDADO, null, PLANTILLA_DOMICILIO_AGENDADO.parametros(datos))
    }

    await registrar(supabase, {
      tipo: 'domicilio_agendado', transaccion_id: null, cliente_id: dom.cliente_id,
      telefono: telefono10, via, plantilla: plantillaUsada, exito: true, enviado_por: enviadoPor,
    })
    return { ok: true, via }
  } catch (err) {
    console.error('[whatsapp] error mandando aviso de domicilio agendado:', err.message)
    await registrar(supabase, {
      tipo: 'domicilio_agendado', transaccion_id: null, cliente_id: dom.cliente_id,
      telefono: telefono10, via: via || 'libre', plantilla: plantillaUsada, exito: false,
      error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}
