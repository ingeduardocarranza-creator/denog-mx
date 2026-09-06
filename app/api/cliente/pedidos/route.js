import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirDuenoOStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  if (!requerirDuenoOStaff(req, cliente_id)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('pedidos')
    .select('*, entregas(fecha_entrega, estado)')
    .eq('cliente_id', cliente_id)
    // Un pedido con pendiente_aprobacion=true es un borrador que armó la IA desde
    // WhatsApp (y 'descartado' es un borrador rechazado): no es mercancía real.
    // Mismo criterio que lib/estadosCuenta/datosServidor.js.
    .eq('pendiente_aprobacion', false)
    .not('estado', 'in', '("Cancelado","no_llego","pendiente","descartado")')

  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // Mismo criterio que /api/reportes/pedidos: la foto de un pedido que llegó
  // por WhatsApp es una ruta dentro del bucket privado 'whatsapp-media', no
  // una URL usable directo en <img>. Se manda convertida en un campo aparte
  // (imagen_url_firmada) — imagen_url sigue siendo la ruta permanente.
  const filas = data || []
  const firmadas = await urlsFirmadas(supabase, filas.map(p => p.imagen_url), 3600)
  const pedidos = filas.map(p => ({
    ...p,
    imagen_url_firmada: !p.imagen_url ? null
      : p.imagen_url.startsWith('http') ? p.imagen_url
      : (firmadas[p.imagen_url] || null),
  }))

  // Traer domicilios entregados del cliente
  const { data: domicilios } = await supabase
    .from('domicilios')
    .select('entrega_ids, costo_envio, estado')
    .eq('cliente_id', cliente_id)
    .eq('estado', 'entregado')

  return NextResponse.json({ ok: true, pedidos, domicilios: domicilios || [] })
}
