import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { requerirAdmin } from '@/lib/auth/session'
import { mlConfigurado, urlAutorizacion } from '@/lib/mercadolibre/api'

// Manda al admin a MercadoLibre para que autorice la conexión. Al terminar,
// MercadoLibre lo regresa a /api/mercadolibre/callback.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.redirect(new URL('/?sesion=expirada', req.url))
  if (!mlConfigurado()) {
    return NextResponse.redirect(new URL('/admin/mercadolibre?error=faltan_credenciales', req.url))
  }
  // "state" firmado: evita que alguien más complete la conexión por su cuenta.
  const state = jwt.sign({ id: sesion.id, p: 'ml' }, process.env.JWT_SECRET, { expiresIn: 600 })
  return NextResponse.redirect(urlAutorizacion(req, state))
}
