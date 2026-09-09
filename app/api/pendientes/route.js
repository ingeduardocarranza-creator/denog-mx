import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { a10Digitos } from '@/lib/whatsapp/telefono'
import { urlsFirmadas } from '@/lib/whatsapp/media'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

const SELECT = `
  id, tipo, estado, cliente_id, telefono_whatsapp, nombre_whatsapp,
  resumen, detalle, monto, monto_no_coincide, imagen_url,
  atendido_por, atendido_en, resuelto_por, resuelto_en, creado_en,
  descartado_por, descartado_en, descartado_motivo,
  clientes!pendientes_cliente_id_fkey(nombre),
  atendido:clientes!pendientes_atendido_por_fkey(nombre),
  resuelto:clientes!pendientes_resuelto_por_fkey(nombre),
  descartado:clientes!pendientes_descartado_por_fkey(nombre)
`

// vista=activos (default): nuevo + visto, más antiguo primero.
// vista=resueltos: historial, más reciente primero, últimos 200.
// vista=descartados: lo que la IA no debió generar. No es basura: es el
//   material para afinar el clasificador (ver docs/PENDIENTES.md §7).
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { searchParams } = new URL(req.url)
  const vista = searchParams.get('vista') || 'activos'

  let query = supabase.from('pendientes').select(SELECT)

  if (vista === 'resueltos') {
    query = query.eq('estado', 'resuelto').order('resuelto_en', { ascending: false }).limit(200)
  } else if (vista === 'descartados') {
    query = query.eq('estado', 'descartado').order('descartado_en', { ascending: false }).limit(200)
  } else {
    query = query.in('estado', ['nuevo', 'visto']).order('creado_en', { ascending: true })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // imagen_url guarda la ruta dentro del bucket privado 'whatsapp-media'
  // (no una URL directa) — se firma aquí, con vigencia de una hora, para
  // que el navegador la pueda mostrar.
  const filas = data || []
  const firmadas = await urlsFirmadas(supabase, filas.map(p => p.imagen_url), 3600)
  const pendientesConImagen = filas.map(p => (
    !p.imagen_url || p.imagen_url.startsWith('http')
      ? p
      : { ...p, imagen_url: firmadas[p.imagen_url] || null }
  ))

  return NextResponse.json({ ok: true, pendientes: pendientesConImagen })
}

// Crea un pendiente. Lo usa el clasificador (B3/webhook) con la service
// role, y de respaldo el botón "+ agregar a mano" en /admin/pendientes para
// mientras el webhook no está conectado.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const {
    tipo, telefono_whatsapp, nombre_whatsapp, resumen, detalle,
    monto, monto_no_coincide, imagen_url, mensaje_wa_id,
  } = await req.json()

  if (!tipo || !telefono_whatsapp || !resumen) {
    return NextResponse.json({ ok: false, mensaje: 'Faltan datos obligatorios (tipo, teléfono, resumen)' })
  }
  // 'sin_responder' se eliminó el 1 sep 2026: la función no servía y su
  // barrido corría en cada consulta del badge. 'comprobante' sigue vivo —
  // lo crea el clasificador — pero se atiende en Anticipos, no aquí.
  if (!['comprobante', 'pedido_especifico'].includes(tipo)) {
    return NextResponse.json({ ok: false, mensaje: 'Tipo no válido' })
  }

  // Vincula con un cliente ya registrado, si el teléfono coincide.
  let cliente_id = null
  const diez = a10Digitos(telefono_whatsapp)
  if (diez) {
    const { data: cliente } = await supabase.from('clientes').select('id').eq('telefono', diez).maybeSingle()
    cliente_id = cliente?.id || null
  }

  const { data, error } = await supabase
    .from('pendientes')
    .insert({
      tipo,
      telefono_whatsapp,
      nombre_whatsapp: nombre_whatsapp || null,
      resumen,
      detalle: detalle || null,
      monto: monto ?? null,
      monto_no_coincide: !!monto_no_coincide,
      imagen_url: imagen_url || null,
      mensaje_wa_id: mensaje_wa_id || null,
      cliente_id,
    })
    .select(SELECT)
    .single()

  if (error) {
    // Índice único de mensaje_wa_id: Meta reenvió el mismo webhook dos veces.
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicado: true })
    return NextResponse.json({ ok: false, mensaje: error.message })
  }
  return NextResponse.json({ ok: true, pendiente: data })
}

// accion: 'ver' (Yo lo veo) | 'resolver' (Listo) | 'reabrir' (por si se
// marcó Listo por error) | 'descartar' (Esto no era) | 'restaurar' (deshacer
// un descarte).
//
// 'descartar' NO borra la fila: cambia el estado a 'descartado'. Sale de la
// lista y del badge, pero se conserva — es lo que después permite afinar el
// clasificador con errores reales. Ver docs/PENDIENTES.md §7.
export async function PATCH(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { id, accion, motivo, pago_id } = await req.json()
  if (!id || !accion) return NextResponse.json({ ok: false, mensaje: 'Faltan datos' })

  const cerrado = () => ({ estado: 'resuelto', resuelto_por: sesion.id, resuelto_en: new Date().toISOString() })

  let cambios
  if (accion === 'ver') {
    cambios = { estado: 'visto', atendido_por: sesion.id, atendido_en: new Date().toISOString() }
  } else if (accion === 'resolver') {
    // ── El candado que faltaba ──────────────────────────────────────────
    // Un comprobante es dinero. Marcarlo "listo" sin registrar su pago fue
    // exactamente lo que dejo 39 comprobantes resueltos y $27,785 fuera del
    // sistema. Cerrarlo tiene que pasar por una de tres puertas, y las tres
    // dejan rastro: aplicarlo (crea el pago), ligarlo a un pago que ya
    // existe, o descartarlo con motivo.
    const { data: pend } = await supabase
      .from('pendientes').select('tipo, monto').eq('id', id).single()

    if (pend?.tipo === 'comprobante' && pend.monto != null) {
      const { count } = await supabase
        .from('pagos').select('id', { count: 'exact', head: true }).eq('pendiente_id', id)
      if (!count) {
        return NextResponse.json({
          ok: false,
          mensaje: 'Este comprobante no se puede marcar como listo sin registrar su pago. '
                 + 'Aplicalo desde Anticipos, o marcalo "Ya estaba cobrado" si ese dinero ya esta capturado. '
                 + 'Si no era un comprobante, usa "Esto no era".',
        })
      }
    }
    cambios = cerrado()
  } else if (accion === 'ligar') {
    // "Ya estaba cobrado": el dinero ya esta en `pagos`, entro por otra via
    // (mostrador, domicilio, venta de tienda). No se crea nada nuevo; se le
    // pone el comprobante al pago que ya existia. Sin esto, la unica salida
    // honesta para ese caso era dejarlo en la bandeja para siempre.
    if (!pago_id) return NextResponse.json({ ok: false, mensaje: 'Falta indicar el pago' })

    const [{ data: pago }, { data: pend }] = await Promise.all([
      supabase.from('pagos').select('id, cliente_id, pendiente_id').eq('id', pago_id).single(),
      supabase.from('pendientes').select('cliente_id').eq('id', id).single(),
    ])
    if (!pago) return NextResponse.json({ ok: false, mensaje: 'No se encontro ese pago' })
    if (pago.pendiente_id) return NextResponse.json({ ok: false, mensaje: 'Ese pago ya tiene un comprobante ligado' })
    if (pend?.cliente_id && pago.cliente_id && pend.cliente_id !== pago.cliente_id) {
      return NextResponse.json({ ok: false, mensaje: 'Ese pago es de otro cliente' })
    }

    const { error: eLigar } = await supabase.from('pagos').update({ pendiente_id: id }).eq('id', pago_id)
    if (eLigar) return NextResponse.json({ ok: false, mensaje: eLigar.message })
    cambios = cerrado()
  } else if (accion === 'reabrir') {
    cambios = { estado: 'nuevo', resuelto_por: null, resuelto_en: null }
  } else if (accion === 'descartar') {
    cambios = {
      estado: 'descartado',
      descartado_por: sesion.id,
      descartado_en: new Date().toISOString(),
      descartado_motivo: motivo || null,
    }
  } else if (accion === 'restaurar') {
    // Deshacer: vuelve a la lista tal como estaba, sin rastro del descarte.
    cambios = { estado: 'nuevo', descartado_por: null, descartado_en: null, descartado_motivo: null }
  } else {
    return NextResponse.json({ ok: false, mensaje: 'Acción no reconocida' })
  }

  const { error } = await supabase.from('pendientes').update(cambios).eq('id', id)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true })
}
