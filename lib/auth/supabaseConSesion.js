import { createClient } from '@supabase/supabase-js'

// Igual que crear el cliente de servicio de siempre, pero manda quién es
// (id y nombre de la sesión) en cada request como headers propios. La
// bitácora (trigger registrar_en_bitacora, ver migración bitacora_actor_real)
// los lee de ahí — así ya no tiene que adivinar el responsable a partir de
// columnas como vendedor_id o colaborador_id, que no siempre están.
//
// Uso: en vez de crear el cliente a nivel de módulo (afuera de la función),
// créalo DENTRO del handler, después de tener `sesion` — si se crea afuera,
// nunca hay sesión que pasarle porque el módulo carga antes de que llegue
// cualquier request.
//
//   export async function POST(req) {
//     const sesion = requerirStaff(req)
//     if (!sesion) return NextResponse.json(..., { status: 401 })
//     const supabase = supabaseConSesion(sesion)
//     ...
//   }
export function supabaseConSesion(sesion) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          'x-actor-id': sesion?.id || '',
          'x-actor-nombre': sesion?.nombre || '',
        },
      },
    }
  )
}
