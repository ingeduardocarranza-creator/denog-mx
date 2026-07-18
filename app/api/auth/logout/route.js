import { NextResponse } from 'next/server'
import { quitarCookieSesion } from '@/lib/auth/session'

export async function POST() {
  return quitarCookieSesion(NextResponse.json({ ok: true }))
}
