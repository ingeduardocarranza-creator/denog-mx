import { NextResponse } from 'next/server'
import { requerirStaff, requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import {
  UMBRAL_DESCUENTO_PCT, UMBRAL_DESCUENTO_MONTO,
} from '@/lib/pos/tiendaUtils'
import {
  DIAS_PARA_LIBERAR, TIPO_ANTICIPO_TIENDA, totalApartado, anticipadoApartado,
} from '@/lib/pos/apartadosUtils'

const METODOS = ['Efectivo', 'Transferencia', 'Terminal']
const CAMPOS = 'id, cliente_id, producto_id, nombre_producto, categoria, cantidad, precio_catalogo, precio_unitario, costo_unitario, autorizado_por, estado, creado_en, entregado_en, liberado_en'

// GET /api/apartados?cliente_id=…        → apartados del cliente (por defecto solo los que siguen apartados)
// GET /api/apartados?cliente_id=…&todos=1 → con entregados y liberados
// GET /api/apartados?resumen=1            → todos los apartados vivos, con nombre de cliente y aviso de 30 días
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get('cliente_id')
  const todos = searchParams.get('todos') === '1'

  let q = supabase.from('apartados_tienda').select(CAMPOS + ', clientes!apartados_tienda_cliente_id_fkey(nombre), productos_tienda!apartados_tienda_producto_id_fkey(imagen_url)').order('creado_en', { ascending: true })
  if (clienteId) q = q.eq('cliente_id', clienteId)
  if (!todos) q = q.eq('estado', 'apartado')
  const { data: apartados, error } = await q
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const ids = (apartados || []).map(a => a.id)
  let pagos = []
  if (ids.length) {
    const { data } = await supabase.from('pagos').select('id, apartado_id, monto, metodo, creado_en').eq('tipo', TIPO_ANTICIPO_TIENDA).in('apartado_id', ids).order('creado_en')
    pagos = data || []
  }
  const lista = (apartados || []).map(a => ({
    ...a,
    cliente_nombre: a.clientes?.nombre || '',
    imagen_url: a.productos_tienda?.imagen_url || null,
    total: totalApartado(a),
    anticipado: anticipadoApartado(a, pagos),
    anticipos: pagos.filter(p => p.apartado_id === a.id),
  }))
  return NextResponse.json({ ok: true, apartados: lista, dias_para_liberar: DIAS_PARA_LIBERAR })
}

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json()
  const { accion } = body

  // ── Apartar un producto del catálogo para un cliente ─────────────────────
  if (accion === 'apartar') {
    const { cliente_id, producto_id, autorizado_por } = body
    const cantidad = Math.floor(Number(body.cantidad) || 0)
    if (!cliente_id || !producto_id || cantidad <= 0) {
      return NextResponse.json({ ok: false, mensaje: 'Faltan cliente, producto o cantidad' })
    }
    const { data: prod } = await supabase.from('productos_tienda').select('id, precio_venta').eq('id', producto_id).maybeSingle()
    if (!prod) return NextResponse.json({ ok: false, mensaje: 'El producto no existe' })
    const catalogo = Number(prod.precio_venta) || 0
    const precio = body.precio === '' || body.precio == null ? catalogo : Number(body.precio)
    if (!(precio >= 0)) return NextResponse.json({ ok: false, mensaje: 'El precio no es válido' })

    // Mismas reglas que el POS: un remate grande necesita quién lo autoriza.
    const descuentoTotal = Math.max(0, (catalogo - precio) * cantidad)
    const base = catalogo * cantidad
    const pct = base > 0 ? descuentoTotal / base : 0
    const esGrande = descuentoTotal > UMBRAL_DESCUENTO_MONTO || pct > UMBRAL_DESCUENTO_PCT
    if (esGrande && !String(autorizado_por || '').trim()) {
      return NextResponse.json({
        ok: false, requiereAutorizacionDescuento: true,
        mensaje: 'Este remate es grande (más de 20% o más de $200). Escribe quién lo autoriza.',
      }, { status: 409 })
    }

    const { data: id, error } = await supabase.rpc('apartar_producto', {
      p_cliente: cliente_id, p_producto: producto_id, p_cantidad: cantidad,
      p_precio: precio, p_autorizado: esGrande ? autorizado_por : null, p_por: sesion.id,
    })
    if (error) return NextResponse.json({ ok: false, mensaje: error.message.replace(/^.*?:\s*/, '') })
    return NextResponse.json({ ok: true, id })
  }

  // ── Anticipo de tienda: dinero que el cliente deja por un artículo ───────
  if (accion === 'anticipo') {
    const { apartado_id, metodo } = body
    const monto = Number(body.monto)
    if (!apartado_id || !(monto > 0)) return NextResponse.json({ ok: false, mensaje: 'Faltan el artículo o el monto' })
    if (!METODOS.includes(metodo)) return NextResponse.json({ ok: false, mensaje: 'Elige cómo pagó' })

    const { data: a } = await supabase.from('apartados_tienda').select(CAMPOS).eq('id', apartado_id).maybeSingle()
    if (!a) return NextResponse.json({ ok: false, mensaje: 'El artículo no existe' })
    if (a.estado !== 'apartado') return NextResponse.json({ ok: false, mensaje: `Este artículo ya está ${a.estado}` })

    const { data: previos } = await supabase.from('pagos').select('apartado_id, monto').eq('tipo', TIPO_ANTICIPO_TIENDA).eq('apartado_id', apartado_id)
    const ya = anticipadoApartado(a, previos || [])
    const total = totalApartado(a)
    if (ya + monto > total + 0.01) {
      return NextResponse.json({ ok: false, mensaje: `El anticipo pasa del total del artículo. Todavía faltan $${(total - ya).toLocaleString('es-MX')}.` })
    }
    const { data, error } = await supabase.from('pagos').insert({
      cliente_id: a.cliente_id, entrega_id: null, apartado_id: a.id,
      monto, metodo, tipo: TIPO_ANTICIPO_TIENDA, vendedor_id: sesion.id,
    }).select('id').single()
    if (error) return NextResponse.json({ ok: false, mensaje: error.message })
    return NextResponse.json({ ok: true, id: data.id })
  }

  // ── Quitar: staff, solo si no hay dinero de por medio ────────────────────
  if (accion === 'quitar') {
    const { apartado_id } = body
    const { count } = await supabase.from('pagos').select('id', { count: 'exact', head: true }).eq('apartado_id', apartado_id)
    if ((count || 0) > 0) {
      return NextResponse.json({ ok: false, mensaje: 'Este artículo ya tiene anticipo. Solo el admin puede liberarlo.' })
    }
    const { error } = await supabase.rpc('liberar_apartado', { p_id: apartado_id, p_por: sesion.id })
    if (error) return NextResponse.json({ ok: false, mensaje: error.message.replace(/^.*?:\s*/, '') })
    return NextResponse.json({ ok: true })
  }

  // ── Liberar: solo admin. El stock regresa; el anticipo se queda como utilidad ──
  if (accion === 'liberar') {
    if (!requerirAdmin(req)) return NextResponse.json({ ok: false, mensaje: 'Solo el admin libera apartados' }, { status: 403 })
    const { apartado_id } = body
    const { data: pagos } = await supabase.from('pagos').select('monto').eq('apartado_id', apartado_id)
    const retenido = (pagos || []).reduce((s, p) => s + (Number(p.monto) || 0), 0)
    const { error } = await supabase.rpc('liberar_apartado', { p_id: apartado_id, p_por: sesion.id })
    if (error) return NextResponse.json({ ok: false, mensaje: error.message.replace(/^.*?:\s*/, '') })
    return NextResponse.json({ ok: true, retenido })
  }

  return NextResponse.json({ ok: false, mensaje: 'Acción desconocida' }, { status: 400 })
}
