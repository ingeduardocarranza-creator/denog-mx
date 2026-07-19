import { NextResponse } from 'next/server'
import { quitarCookieSesion } from '@/lib/auth/session'

export async function POST() {
  const respuesta = NextResponse.json({ ok: true })
  return quitarCookieSesion(respuesta)
}
