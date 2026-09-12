// Aviso de "tu pedido ya fue enviado" (paquetería + número de guía). Mismo
// patrón que el resto de lib/whatsapp/enviarDocumentos.js: libre si la
// ventana de 24h está abierta, plantilla aprobada si no. A diferencia del
// ticket y el estado de cuenta, este aviso no lleva imagen.
//
// La plantilla `envio_foraneo_denog` (ver lib/whatsapp/plantillas.js) todavía
// no se ha dado de alta en Meta -- mientras no esté aprobada, este envío solo
// funciona con la ventana abierta. Si la ventana está cerrada y la plantilla
// no existe/no está aprobada, Meta responde con error y aquí queda registrado
// en whatsapp_envios para que se vea por qué no llegó.

import { a10Digitos, paraWaMe } from '@/lib/whatsapp/telefono'
import { enviarTextoLibre, enviarPlantillaConImagen, ventanaAbierta } from '@/lib/whatsapp/enviar'
import { PLANTILLA_ENVIO_FORANEO } from '@/lib/whatsapp/plantillas'

function textoLibre({ nombre, paqueteria, numeroGuia }) {
  return [
    `Hola ${nombre || ''}, tu pedido ya fue enviado 📦`,
    `Paquetería: ${paqueteria || ''}`,
    `Número de guía: ${numeroGuia || ''}`,
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

export async function enviarEnvioForaneoPorWhatsapp(supabase, { envioForaneoId, enviadoPor = null }) {
  const { data: envio, error: errEnvio } = await supabase
    .from('envios_foraneos')
    .select('id, cliente_id, paqueteria, numero_guia, estado')
    .eq('id', envioForaneoId)
    .single()
  if (errEnvio || !envio) return { ok: false, mensaje: 'No se encontró el envío foráneo.' }
  if (!envio.paqueteria || !envio.numero_guia) {
    return { ok: false, mensaje: 'Falta paquetería o número de guía antes de avisar al cliente.' }
  }

  const { data: cliente, error: errCliente } = await supabase
    .from('clientes')
    .select('id, nombre, telefono')
    .eq('id', envio.cliente_id)
    .single()
  if (errCliente || !cliente) return { ok: false, mensaje: 'No se encontró el cliente.' }

  const telefono10 = a10Digitos(cliente.telefono)
  if (!telefono10) return { ok: false, mensaje: 'Ese cliente no tiene teléfono guardado.' }
  const waId = paraWaMe(telefono10)

  const datos = { nombre: cliente.nombre, paqueteria: envio.paqueteria, numeroGuia: envio.numero_guia }

  let via = null
  let plantillaUsada = null
  try {
    const abierta = await ventanaAbierta(supabase, telefono10)
    if (abierta) {
      via = 'libre'
      await enviarTextoLibre(waId, textoLibre(datos))
    } else {
      via = 'plantilla'
      plantillaUsada = PLANTILLA_ENVIO_FORANEO.nombre
      await enviarPlantillaConImagen(waId, PLANTILLA_ENVIO_FORANEO, null, PLANTILLA_ENVIO_FORANEO.parametros(datos))
    }

    await registrar(supabase, {
      tipo: 'envio_foraneo', transaccion_id: null, cliente_id: envio.cliente_id,
      telefono: telefono10, via, plantilla: plantillaUsada, exito: true, enviado_por: enviadoPor,
    })
    return { ok: true, via }
  } catch (err) {
    console.error('[whatsapp] error mandando aviso de envío foráneo:', err.message)
    await registrar(supabase, {
      tipo: 'envio_foraneo', transaccion_id: null, cliente_id: envio.cliente_id,
      telefono: telefono10, via: via || 'libre', plantilla: plantillaUsada, exito: false,
      error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}
