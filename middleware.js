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
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null
    return decoded
  } catch {
    return null
  }
}

export function middleware(req) {
  const { pathname } = req.nextUrl
  const sesion = leerSesionEdge(req)

  if (pathname.startsWith('/admin') || pathname.startsWith('/pos')) {
    if (!sesion || !ROLES_STAFF.includes(sesion.rol)) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  if (pathname.startsWith('/cliente')) {
    if (!sesion) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/pos/:path*', '/cliente/:path*'],
}
