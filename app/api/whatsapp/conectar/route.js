import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

// Recibe el "code" que entrega el diálogo de Embedded Signup (B7) y lo
// cambia por un token de confirmación con Meta. No se guarda nada nuevo en
// el proyecto: el Phone Number ID y el token permanente ya viven en las
// variables de entorno desde antes (ver docs/PLAN.md §10). Este paso solo
// sirve para (a) cumplir con lo que pide Meta tras el diálogo y (b)
// confirmarle a quien conecta que el WABA/número que salió del flujo
// coincide con el que ya está configurado.
export async function POST(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { code, waba_id, phone_number_id } = await req.json()
  if (!code) return NextResponse.json({ ok: false, mensaje: 'Falta el code' })

  try {
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_WHATSAPP_APP_ID,
      client_secret: process.env.WHATSAPP_APP_SECRET,
      code,
      // El code vino del diálogo del SDK (popup), no de una redirección de
      // página completa — Meta exige repetir aquí el mismo redirect_uri
      // (vacío) que se usó implícitamente, si no rechaza el intercambio.
      redirect_uri: '',
    })
    const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`)
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ ok: false, mensaje: data?.error?.message || 'Meta rechazó el code' })
    }

    const coincidePhone = !phone_number_id || phone_number_id === process.env.WHATSAPP_PHONE_NUMBER_ID
    const coincideWaba = !waba_id || waba_id === process.env.WHATSAPP_BUSINESS_ACCOUNT_ID

    return NextResponse.json({
      ok: true,
      coincidePhone,
      coincideWaba,
      waba_id: waba_id || null,
      phone_number_id: phone_number_id || null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: 'Error al confirmar con Meta: ' + e.message })
  }
}
