import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { ponerCookieSesion, firmarSesion } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// In-memory rate limiter: 5 failed attempts per IP per 15 minutes.
const intentosFallidos = new Map()
const MAX_INTENTOS = 5
const VENTANA_MS = 15 * 60 * 1000

function obtenerIp(req) {
  // x-real-ip is set by Vercel's edge and cannot be spoofed by the client.
  // Fall back to the last entry of x-forwarded-for (also Vercel-appended, not client-controlled).
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'desconocida'
  )
}

function estaBloqueda(ip) {
  const registro = intentosFallidos.get(ip)
  if (!registro) return false
  if (Date.now() > registro.expira) { intentosFallidos.delete(ip); return false }
  return registro.intentos >= MAX_INTENTOS
}

function registrarFallo(ip) {
  const registro = intentosFallidos.get(ip)
  if (!registro || Date.now() > registro.expira) {
    intentosFallidos.set(ip, { intentos: 1, expira: Date.now() + VENTANA_MS })
  } else {
    registro.intentos += 1
  }
}

function limpiarFallo(ip) {
  intentosFallidos.delete(ip)
}

export async function POST(req) {
  const ip = obtenerIp(req)

  if (estaBloqueda(ip)) {
    return NextResponse.json(
      { ok: false, mensaje: 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.' },
      { status: 429 }
    )
  }

  try {
    const { usuario, password } = await req.json()

    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('usuario', usuario)
      .single()

    if (error || !data || !data.activo) {
      registrarFallo(ip)
      return NextResponse.json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' })
    }

    const passwordValido = await bcrypt.compare(password, data.password_hash)

    if (!passwordValido) {
      registrarFallo(ip)
      return NextResponse.json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' })
    }

    limpiarFallo(ip)
    const token = firmarSesion({ id: data.id, rol: data.rol, nombre: data.nombre })
    const respuesta = NextResponse.json({ ok: true, rol: data.rol, nombre: data.nombre, id: data.id, token })
    return ponerCookieSesion(respuesta, { id: data.id, rol: data.rol, nombre: data.nombre })
  } catch (err) {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
