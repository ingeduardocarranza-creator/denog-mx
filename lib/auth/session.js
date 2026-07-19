import jwt from 'jsonwebtoken'

const SECRETO = process.env.JWT_SECRET
const COOKIE = 'sesion'
const DURACION_SEGUNDOS = 60 * 60 * 24 * 30 // 30 días
const ROLES_STAFF = ['admin', 'vendedor']

export function firmarSesion({ id, rol, nombre }) {
  return jwt.sign({ id, rol, nombre }, SECRETO, { expiresIn: DURACION_SEGUNDOS })
}

export function ponerCookieSesion(response, datos) {
  response.cookies.set(COOKIE, firmarSesion(datos), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SEGUNDOS,
  })
  return response
}

export function quitarCookieSesion(response) {
  response.cookies.set(COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export function obtenerSesion(req) {
  const token = req.cookies.get(COOKIE)?.value
  if (!token) return null
  try {
    return jwt.verify(token, SECRETO)
  } catch {
    return null
  }
}

// Admin o vendedor: cualquier miembro del equipo operando el POS/admin.
export function requerirStaff(req) {
  const sesion = obtenerSesion(req)
  if (!sesion || !ROLES_STAFF.includes(sesion.rol)) return null
  return sesion
}

// Solo admin: gestión de cuentas, colaboradores y datos de crédito de clientes.
export function requerirAdmin(req) {
  const sesion = obtenerSesion(req)
  if (!sesion || sesion.rol !== 'admin') return null
  return sesion
}

// El propio cliente viendo sus datos, o cualquier miembro del staff.
export function requerirDuenoOStaff(req, clienteId) {
  const sesion = obtenerSesion(req)
  if (!sesion) return null
  if (ROLES_STAFF.includes(sesion.rol)) return sesion
  if (clienteId && String(sesion.id) === String(clienteId)) return sesion
  return null
}
