import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlFirmada } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Returns all data needed when a client is selected at the POS:
// pending orders, mercadito orders with payments, and available anticipos.
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id')
  if (!cliente_id) return NextResponse.json({ ok: false, mensaje: 'cliente_id requerido' })

  const [pedidosRes, mercaditoRes, anticiposRes] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*')
      .eq('cliente_id', cliente_id)
      .not('estado', 'in', '("Pagado","Entregado","Cancelado","no_llego","pendiente")'),

    supabase
      .from('pedidos_mercadito')
      .select('id, folio, items, creado_en')
      .eq('cliente_id', cliente_id)
      .in('estado', ['aprobado', 'agregado']),

    supabase
      .from('pagos')
      .select('id, monto, creado_en, entrega_id')
      .eq('cliente_id', cliente_id)
      .eq('tipo', 'Anticipo')
      .order('creado_en', { ascending: true }),
  ])

  // Mismo criterio que /api/reportes/pedidos: la foto de un pedido que llegó
  // por WhatsApp es una ruta dentro del bucket privado 'whatsapp-media', no
  // una URL usable directo en <img>. Se manda convertida en un campo aparte
  // (imagen_url_firmada) — imagen_url sigue siendo la ruta permanente.
  const pedidos = await Promise.all((pedidosRes.data || []).map(async p => {
    if (!p.imagen_url || p.imagen_url.startsWith('http')) return { ...p, imagen_url_firmada: p.imagen_url }
    return { ...p, imagen_url_firmada: await urlFirmada(supabase, p.imagen_url, 3600) }
  }))
  const mercadito = mercaditoRes.data || []
  const anticipos = anticiposRes.data || []

  // Fetch payments already made on the mercadito orders to calculate balance
  let pagosMercadito = []
  const idsMercadito = mercadito.map(m => m.id)
  if (idsMercadito.length > 0) {
    const { data } = await supabase
      .from('pagos')
      .select('pedido_mercadito_id, monto')
      .in('pedido_mercadito_id', idsMercadito)
    pagosMercadito = data || []
  }

  const mercaditoConSaldo = mercadito.map(pm => {
    const total = (pm.items || []).reduce((s, it) => s + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0)
    const pagado = pagosMercadito.filter(pg => pg.pedido_mercadito_id === pm.id).reduce((s, pg) => s + Number(pg.monto || 0), 0)
    return { ...pm, total, pagado, saldo: Math.max(0, total - pagado) }
  })

  return NextResponse.json({ ok: true, pedidos, mercadito: mercaditoConSaldo, anticipos })
}
