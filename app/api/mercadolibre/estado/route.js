import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { clienteSupabaseServicio, mlConfigurado } from '@/lib/mercadolibre/api'

// Estado de la conexión y conteos de publicaciones (nunca devuelve tokens).
export async function GET(req) {
  if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = clienteSupabaseServicio()

  const { data: con, error } = await supabase
    .from('ml_conexion')
    .select('ml_user_id, ml_nickname, conectado_en, expira_en, refresh_token')
    .eq('id', 1)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const { data: filas, error: errPub } = await supabase
    .from('ml_publicaciones')
    .select('liga_estado, estado_ml, tiempo_preparacion, sincronizado_en')
  if (errPub) return NextResponse.json({ ok: false, mensaje: errPub.message })

  const conteos = { total: 0, ligada: 0, bajo_pedido: 0, ambigua: 0 }
  let ultima = null
  for (const f of filas || []) {
    conteos.total += 1
    conteos[f.liga_estado] = (conteos[f.liga_estado] || 0) + 1
    if (!ultima || f.sincronizado_en > ultima) ultima = f.sincronizado_en
  }

  return NextResponse.json({
    ok: true,
    credenciales: mlConfigurado(),
    conectado: Boolean(con?.refresh_token),
    cuenta: con ? { id: con.ml_user_id, nickname: con.ml_nickname, conectado_en: con.conectado_en } : null,
    conteos,
    ultima_sincronizacion: ultima,
  })
}
