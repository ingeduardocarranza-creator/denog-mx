import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { urlsFirmadas } from '@/lib/whatsapp/media'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Lista de carga del día: qué productos lleva cada domicilio y cuáles ya se
// cargaron al carro. Cada producto tiene una clave estable:
//   p:<id del pedido>            producto de un estado de cuenta
//   m:<id del pedido mercadito>:<n>   producto del Mercadito
//   t:<n>                        producto vendido en la tienda (POS)

// GET ?fecha=YYYY-MM-DD
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const fecha = new URL(req.url).searchParams.get('fecha')
  if (!fecha) return NextResponse.json({ ok: false, mensaje: 'Falta la fecha' })

  const { data: doms, error } = await supabase
    .from('domicilios')
    .select('id, cliente_id, entrega_ids, es_externo, items_tienda, carga_ok')
    .eq('fecha_preferida', fecha)
    .in('estado', ['pendiente', 'confirmado', 'en_camino'])
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const resultado = []
  for (const d of doms || []) {
    const items = []

    if (!d.es_externo && d.cliente_id && (d.entrega_ids || []).length > 0) {
      // Mismo criterio que /api/domicilios/listar: sin borradores ni descartados.
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('id, descripcion, cantidad, apartado_fragil, estado, imagen_url')
        .eq('cliente_id', d.cliente_id)
        .in('entrega_id', d.entrega_ids)
        .eq('pendiente_aprobacion', false)
        .not('estado', 'in', '("Cancelado","no_llego","pendiente","descartado")')
      const filas = pedidos || []
      const firmadas = await urlsFirmadas(supabase, filas.map(p => p.imagen_url), 3600)
      for (const p of filas) {
        items.push({
          clave: `p:${p.id}`,
          nombre: p.descripcion,
          cantidad: p.cantidad || 1,
          fragil: !!p.apartado_fragil,
          empacado: String(p.estado || '').toLowerCase() === 'empacado',
          foto: !p.imagen_url ? null : p.imagen_url.startsWith('http') ? p.imagen_url : (firmadas[p.imagen_url] || null),
        })
      }
    }

    const { data: mercadito } = await supabase
      .from('pedidos_mercadito')
      .select('id, items, estado')
      .eq('domicilio_id', d.id)
      .neq('estado', 'cancelado')
    for (const m of mercadito || []) {
      ;(Array.isArray(m.items) ? m.items : []).forEach((it, n) => {
        items.push({ clave: `m:${m.id}:${n}`, nombre: it.nombre, cantidad: it.cantidad || 1, fragil: !!it.apartado_fragil, empacado: true, foto: null })
      })
    }

    if (Array.isArray(d.items_tienda)) {
      d.items_tienda.forEach((it, n) => {
        items.push({ clave: `t:${n}`, nombre: it.nombre, cantidad: it.cantidad || 1, fragil: false, empacado: true, foto: null })
      })
    }

    resultado.push({ id: d.id, items, marcadas: Array.isArray(d.carga_ok) ? d.carga_ok : [] })
  }

  return NextResponse.json({ ok: true, domicilios: resultado })
}

// POST { domicilio_id, clave, marcado }  -> marca o desmarca un producto como cargado
export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { domicilio_id, clave, marcado } = await req.json()
    if (!domicilio_id || !clave) return NextResponse.json({ ok: false, mensaje: 'Faltan datos' })
    const { data, error } = await supabase.from('domicilios').select('carga_ok').eq('id', domicilio_id).single()
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    const actual = new Set(Array.isArray(data?.carga_ok) ? data.carga_ok : [])
    if (marcado) actual.add(clave); else actual.delete(clave)
    const { error: e2 } = await supabase.from('domicilios').update({ carga_ok: [...actual] }).eq('id', domicilio_id)
    if (e2) return NextResponse.json({ ok: false, mensaje: e2.message })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, mensaje: 'Error del servidor' })
  }
}
