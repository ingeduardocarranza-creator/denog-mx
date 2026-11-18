import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// POST { ids: [...] }  -> guarda el orden manual (1..n)
// POST { ids: [...], auto: true } -> quita el orden manual (vuelve al automático)
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { ids, auto } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: false, mensaje: 'Sin domicilios' })
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase.from('domicilios').update({ orden_ruta: auto ? null : i + 1 }).eq('id', ids[i])
      if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
