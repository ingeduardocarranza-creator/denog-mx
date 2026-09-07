import { NextResponse } from 'next/server'

const ROLES_STAFF = ['admin', 'vendedor']

// Edge Runtime doesn't support jsonwebtoken. We decode the JWT payload without
// verifying the signature here — the middleware only handles redirects for UX.
// Every API route still verifies the full signature with requerirStaff/requerirAdmin.
function leerSesionEdge(req) {
  const token = req.cookies.get('sesion')?.value
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(base64))
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded
  } catch {
    return null
  }
}

// Regresar a la portada sin decir nada se ve como si el botón no sirviera.
// Con ?sesion=expirada la portada limpia el dato viejo y avisa por qué rebotó.
function aLaPortada(req) {
  return NextResponse.redirect(new URL('/?sesion=expirada', req.url))
}

export function middleware(req) {
  const { pathname } = req.nextUrl
  const sesion = leerSesionEdge(req)

  if (pathname.startsWith('/admin') || pathname.startsWith('/pos')) {
    if (!sesion || !ROLES_STAFF.includes(sesion.rol)) {
      return aLaPortada(req)
    }
  }

  if (pathname.startsWith('/cliente')) {
    if (!sesion) {
      return aLaPortada(req)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/pos/:path*', '/cliente/:path*'],
}
