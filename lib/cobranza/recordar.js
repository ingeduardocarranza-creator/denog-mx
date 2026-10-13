// Manda el recordatorio de cobranza a UN cliente por WhatsApp.
//
// Igual que el estado de cuenta (lib/whatsapp/enviarDocumentos.js): si el
// cliente nos escribió en las últimas 24 h va como mensaje libre con la
// imagen; si no, como plantilla aprobada. Queda registrado en
// whatsapp_envios con tipo 'recordatorio' -- de ahí sale "último
// recordatorio" y el candado de uno por día.

import { cargarCobranza, dentroDeHorario, HORARIO_TEXTO } from './calcular'
import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { pngEstadoCuenta } from '@/lib/estadosCuenta/servidor'
import { paraWaMe } from '@/lib/whatsapp/telefono'
import { subirMediaWhatsapp, enviarImagenLibre, enviarPlantillaConImagen, ventanaAbierta } from '@/lib/whatsapp/enviar'
import { PLANTILLA_RECORDATORIO_TIENDA, PLANTILLA_RECORDATORIO_VENCIDO } from '@/lib/whatsapp/plantillas'

async function registrar(supabase, fila) {
  try {
    await supabase.from('whatsapp_envios').insert(fila)
  } catch (err) {
    console.error('[cobranza] no se pudo registrar en whatsapp_envios:', err?.message)
  }
}

// Imagen del estado de cuenta SOLO con entregas pasadas (en tienda).
// Se ancla en la entrega más reciente del cliente -- aunque sea la futura --
// porque así armarPorEntrega deja de las entregas anteriores únicamente lo
// pendiente de recoger. Después se quita la futura.
async function datosImagen(supabase, clienteId) {
  const [{ data: suyos, error }, { data: entregas, error: eEnt }] = await Promise.all([
    supabase.from('pedidos').select('entrega_id')
      .eq('cliente_id', clienteId).eq('pendiente_aprobacion', false)
      .not('entrega_id', 'is', null),
    supabase.from('entregas').select('id, fecha_entrega'),
  ])
  if (error || eEnt) throw new Error((error || eEnt).message)
  const susIds = new Set((suyos || []).map(p => String(p.entrega_id)))
  const ancla = (entregas || [])
    .filter(e => susIds.has(String(e.id)))
    .sort((a, b) => String(b.fecha_entrega).localeCompare(String(a.fecha_entrega)))[0]?.id
  if (!ancla) throw new Error('No se encontró ninguna entrega de este cliente')

  const lista = await cargarEstadosDeCuenta(supabase, ancla)
  const datos = lista.find(d => String(d.cliente.id) === String(clienteId))
  if (!datos) throw new Error('No se pudo armar el estado de cuenta')
  const grupos = datos.grupos.filter(g => g.entrega && g.entrega.estado === 'en_tienda')
  return { ...datos, grupos }
}

export async function enviarRecordatorio(supabase, { clienteId, enviadoPor = null }) {
  if (!dentroDeHorario()) {
    return { ok: false, mensaje: `Fuera de horario. Los recordatorios solo salen ${HORARIO_TEXTO}.` }
  }

  const { clientes } = await cargarCobranza(supabase, { clienteId })
  const c = clientes[0]
  if (!c) return { ok: false, mensaje: 'Este cliente ya no tiene saldo pendiente en entregas pasadas.' }
  if (c.recordatorios.enviadoHoy) return { ok: false, mensaje: `A ${c.nombre} ya se le mandó un recordatorio hoy.` }
  if (c.pausa) return { ok: false, mensaje: `${c.nombre} está en pausa hasta el ${c.pausa.hasta}.` }
  if (!c.telefono) return { ok: false, mensaje: `${c.nombre} no tiene teléfono guardado.` }
  if (!c.fechaAviso) return { ok: false, mensaje: 'Su entrega no tiene fecha límite. Ponla en Entregas.' }

  const plantilla = c.aviso === 'vencido' ? PLANTILLA_RECORDATORIO_VENCIDO : PLANTILLA_RECORDATORIO_TIENDA
  const vars = { nombre: c.nombre.split(' ')[0], saldo: c.saldo, fecha: c.fechaAviso }
  const waId = paraWaMe(c.telefono)

  let via = null
  try {
    const datos = await datosImagen(supabase, clienteId)
    const png = await pngEstadoCuenta(datos, {})
    const mediaId = await subirMediaWhatsapp(png, 'image/png', `estado-de-cuenta-${c.nombre}.png`)

    let messageId
    if (await ventanaAbierta(supabase, c.telefono)) {
      via = 'libre'
      messageId = await enviarImagenLibre(waId, mediaId, plantilla.textoLibre(vars))
    } else {
      via = 'plantilla'
      messageId = await enviarPlantillaConImagen(waId, plantilla, mediaId, plantilla.parametros(vars))
    }

    await registrar(supabase, {
      tipo: 'recordatorio', cliente_id: clienteId, telefono: c.telefono, via,
      // Se guarda el nombre aunque haya ido libre: así se sabe qué aviso fue.
      plantilla: plantilla.nombre, exito: true, meta_message_id: messageId, enviado_por: enviadoPor,
    })
    return { ok: true, via, aviso: c.aviso, saldo: c.saldo }
  } catch (err) {
    console.error('[cobranza] error mandando recordatorio:', err.message)
    await registrar(supabase, {
      tipo: 'recordatorio', cliente_id: clienteId, telefono: c.telefono, via: via || 'plantilla',
      plantilla: plantilla.nombre, exito: false, error: err.message, enviado_por: enviadoPor,
    })
    return { ok: false, mensaje: err.message }
  }
}
