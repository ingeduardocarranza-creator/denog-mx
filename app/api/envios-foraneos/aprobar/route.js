import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { atribuirAnticiposAEnvioForaneo } from '@/lib/enviosForaneos/atribuirAnticipos'
import { enviarEnvioForaneoPorWhatsapp } from '@/lib/whatsapp/enviarEnvioForaneo'

// Hora de Hermosillo en el formato que guarda la base (timestamp sin zona).
// Mismo helper que ya usan /api/punto-venta/cobrar y /api/pedidos/actualizar-estado.
function horaLocal() {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Hermosillo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
  return p.replace(' ', 'T')
}

// Aprobar un envío foráneo:
//   1. Toma de los anticipos generales del cliente lo necesario para cubrir
//      el costo del envío (sin borrar nada -- ver atribuirAnticipos.js).
//      Lo que no alcance a cubrir se queda como saldo pendiente real, visible
//      en Anticipos igual que cualquier otro saldo.
//   2. Marca el envío como aprobado.
//   3. Manda el aviso de WhatsApp con paquetería + guía. Si el aviso falla
//      (plantilla sin aprobar y ventana cerrada, por ejemplo), la aprobación
//      Y la atribución del dinero YA quedaron hechas -- el aviso se puede
//      reintentar aparte con /api/envios-foraneos/notificar.
export async function POST(req) {
  // Aprobar mueve dinero (atribuye anticipos) y avisa al cliente -- solo un
  // administrador puede hacerlo, no cualquier staff.
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'Solo un administrador puede aprobar un envío foráneo.' }, { status: 403 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta el id del envío' })

  const { data: envio, error: errEnvio } = await supabase
    .from('envios_foraneos')
    .select('*')
    .eq('id', id)
    .single()
  if (errEnvio || !envio) return NextResponse.json({ ok: false, mensaje: 'No se encontró el envío' })
  if (envio.estado !== 'borrador') {
    return NextResponse.json({ ok: false, mensaje: 'Este envío ya fue aprobado antes.' })
  }
  if (!envio.paqueteria || !envio.numero_guia) {
    return NextResponse.json({ ok: false, mensaje: 'Falta paquetería o número de guía antes de aprobar.' })
  }

  const { cubierto, pendiente } = await atribuirAnticiposAEnvioForaneo(supabase, {
    clienteId: envio.cliente_id,
    entregaId: (envio.entrega_ids || [])[0] || null,
    envioForaneoId: envio.id,
    costo: envio.costo_envio,
    vendedorId: sesion.id,
  })

  const { error: errAprobar } = await supabase
    .from('envios_foraneos')
    .update({ estado: 'aprobado', aprobado_por: sesion.id, aprobado_en: horaLocal() })
    .eq('id', id)
  if (errAprobar) return NextResponse.json({ ok: false, mensaje: errAprobar.message })

  const envioAviso = await enviarEnvioForaneoPorWhatsapp(supabase, { envioForaneoId: id, enviadoPor: sesion.id })
  if (envioAviso.ok) {
    await supabase.from('envios_foraneos').update({ estado: 'notificado', notificado_en: horaLocal() }).eq('id', id)
  }

  return NextResponse.json({
    ok: true,
    cubierto,
    pendiente,
    aviso: envioAviso.ok
      ? { ok: true, via: envioAviso.via }
      : { ok: false, mensaje: envioAviso.mensaje },
  })
}
