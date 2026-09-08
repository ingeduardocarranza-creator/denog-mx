/** @type {import('next').NextConfig} */
const nextConfig = {
  // @napi-rs/canvas trae un binario nativo (.node). Turbopack no lo puede meter
  // dentro del paquete: hay que dejarlo fuera para que la funcion lo cargue en
  // tiempo de ejecucion. Sin esto el build truena con "non-ecmascript placeable
  // asset". Va junto con el render de estados de cuenta en servidor.
  serverExternalPackages: ['@napi-rs/canvas'],

  // El render del estado de cuenta en el servidor lee las fuentes y el logo del
  // disco. Sin esto, Vercel no los sube con la funcion y la imagen sale sin
  // texto (o revienta al no encontrar el archivo).
  outputFileTracingIncludes: {
    '/api/estados-cuenta/**': [
      './lib/estadosCuenta/fuentes/**',
      './public/logo-estado-cuenta.png',
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // connect.facebook.net: SDK del diálogo de Embedded Signup en
              // /admin/conectar-whatsapp (B7) — coexistencia de WhatsApp.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://*.facebook.com",
              "frame-src https://www.facebook.com https://web.facebook.com https://staticxx.facebook.com",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
};

export default nextConfig;
