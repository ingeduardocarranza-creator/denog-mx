import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { urlFirmada } from '@/lib/whatsapp/media'
import { CATEGORIAS_GASTO, calcularMontoMxn } from '@/lib/whatsapp/gastos'

const SELECT = `
  id, monto, moneda, tipo_cambio, impuesto_pct, monto_mxn, categoria, descripcion,
  fecha_gasto, entrega_id, imagen_url,
  estado, origen, telefono_whatsapp, creado_en,
  entregas(fecha_entrega, nota),
  registrado:clientes!gastos_registrado_por_fkey(nombre),
  aprobado:clientes!gastos_aprobado_por_fkey(nombre),
  aprobado_en,
  rechazado:clientes!gastos_rechazado_por_fkey(nombre),
  rechazado_en, rechazado_motivo
`

// vista=pendientes (default): lo que llegó por WhatsApp y falta revisar.
// vista=historial: ya aprobados o rechazados, más reciente primero.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { searchParams } = new URL(req.url)
  const vista = searchParams.get('vista') || 'pendientes'

  let query = supabase.from('gastos').select(SELECT)
  if (vista === 'historial') {
    query = query.in('estado', ['aprobado', 'rechazado']).order('creado_en', { ascending: false }).limit(200)
  } else {
    query = query.eq('estado', 'pendiente').order('creado_en', { ascending: true })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  // imagen_url guarda la ruta dentro del bucket privado 'whatsapp-media'.
  const filas = data || []
  const conImagen = await Promise.all(filas.map(async (g) => (
    !g.imagen_url || g.imagen_url.startsWith('http')
      ? g
      : { ...g, imagen_url: await urlFirmada(supabase, g.imagen_url, 3600) }
  )))

  return NextResponse.json({ ok: true, gastos: conImagen })
}

// Alta manual, para cuando el gasto no llegó por WhatsApp (o llegó mal y hay
// que capturarlo a mano). Nace pendiente igual que los de WhatsApp — la
// validación es humana siempre, y separar "quien registra" de "quien
// aprueba" es la misma segregación de funciones que ya tienen retiros y
// cortes de caja.
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)

  const { monto, moneda, tipo_cambio, impuesto_pct, categoria, descripcion, fecha_gasto, entrega_id } = await req.json()

  if (!monto || !categoria) return NextResponse.json({ ok: false, mensaje: 'Faltan datos obligatorios (monto, categoría)' })
  if (!CATEGORIAS_GASTO.includes(categoria)) return NextResponse.json({ ok: false, mensaje: 'Categoría no válida' })
  const monedaFinal = moneda === 'USD' ? 'USD' : 'MXN'
  if (monedaFinal === 'USD' && !(Number(tipo_cambio) > 0)) {
    return NextResponse.json({ ok: false, mensaje: 'Falta el tipo de cambio para convertir a pesos' })
  }
  const montoMxn = calcularMontoMxn({ monto, moneda: monedaFinal, tipo_cambio, impuesto_pct })

  const { data, error } = await supabase
    .from('gastos')
    .insert([{
      monto,
      moneda: monedaFinal,
      tipo_cambio: monedaFinal === 'USD' ? tipo_cambio : null,
      impuesto_pct: monedaFinal === 'USD' ? (impuesto_pct || 0) : null,
      monto_mxn: montoMxn,
      categoria,
      descripcion: descripcion || null,
      fecha_gasto: fecha_gasto || new Date().toISOString().slice(0, 10),
      entrega_id: entrega_id || null,
      origen: 'manual',
      registrado_por: sesion.id,
    }])
    .select()
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })
  return NextResponse.json({ ok: true, gasto: data[0] })
}
