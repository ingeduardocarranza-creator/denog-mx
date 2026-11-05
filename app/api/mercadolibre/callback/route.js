import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { requerirAdmin } from '@/lib/auth/session'
import {
  clienteSupabaseServicio, intercambiarCodigo, guardarTokens, mlGet, urlRedireccion,
} from '@/lib/mercadolibre/api'

// MercadoLibre regresa aquí con ?code=... después de que el admin autoriza.
export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.redirect(new URL('/?sesion=expirada', req.url))

  const { searchParams } = new URL(req.url)
  const aPantalla = (q) => NextResponse.redirect(new URL(`/admin/mercadolibre?${q}`, req.url))

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (searchParams.get('error') || !code) return aPantalla('error=autorizacion')

  try {
    const dec = jwt.verify(state || '', process.env.JWT_SECRET)
    if (dec.p !== 'ml' || String(dec.id) !== String(sesion.id)) return aPantalla('error=estado')
  } catch {
    return aPantalla('error=estado')
  }

  try {
    const supabase = clienteSupabaseServicio()
    const tokens = await intercambiarCodigo(code, urlRedireccion(req))
    let nickname = null
    try {
      const yo = await mlGet(tokens.access_token, '/users/me')
      nickname = yo.nickname || null
    } catch {}
    await guardarTokens(supabase, tokens, {
      ml_nickname: nickname,
      conectado_en: new Date().toISOString(),
      conectado_por: sesion.id,
    })
    return aPantalla('conectado=1')
  } catch (e) {
    return aPantalla(`error=token&detalle=${encodeURIComponent(String(e.message || '').slice(0, 200))}`)
  }
}
