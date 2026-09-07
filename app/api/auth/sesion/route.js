import { NextResponse } from 'next/server'
import { obtenerSesion } from '@/lib/auth/session'

// Nunca se cachea: la portada pregunta aquí para saber si la sesión sigue viva.
export const dynamic = 'force-dynamic'

// La única fuente de verdad de "¿sigo dentro?" es la cookie firmada.
// El dato de localStorage no caduca nunca, así que no sirve para decidirlo.
export async function GET(req) {
  const sesion = obtenerSesion(req)
  if (!sesion) return NextResponse.json({ ok: false })
  const { id, nombre, rol } = sesion
  return NextResponse.json({ ok: true, sesion: { id, nombre, rol } })
}
