import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { enviarEnvioForaneoPorWhatsapp } from '@/lib/whatsapp/enviarEnvioForaneo'

// Reintentar el aviso de WhatsApp de un envío ya aprobado (por ejemplo, si
// la primera vez falló porque la plantilla todavía no estaba aprobada por
// Meta y la ventana de 24h ya se había cerrado).
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ ok: false, mensaje: 'Falta el id del envío' })

  const { data: envio } = await supabase.from('envios_foraneos').select('estado').eq('id', id).single()
  if (!envio) return NextResponse.json({ ok: false, mensaje: 'No se encontró el envío' })
  if (envio.estado === 'borrador') {
    return NextResponse.json({ ok: false, mensaje: 'Este envío todavía no está aprobado.' })
  }

  const resultado = await enviarEnvioForaneoPorWhatsapp(supabase, { envioForaneoId: id, enviadoPor: sesion.id })
  if (resultado.ok) {
    const p = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Hermosillo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date()).replace(' ', 'T')
    await supabase.from('envios_foraneos').update({ estado: 'notificado', notificado_en: p }).eq('id', id)
  }

  return NextResponse.json(resultado)
}
