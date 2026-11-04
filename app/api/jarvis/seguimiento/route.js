import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'
import { cargarPedidosEnTienda, cerrarComoEntregado } from '@/lib/jarvis/enTienda'
import { urlsFirmadas } from '@/lib/whatsapp/media'

export const dynamic = 'force-dynamic'

const fechaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date())
const horaLocal = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Hermosillo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date())

// GET: clientes con pedido "empacado" en tienda que todavía nadie ha confirmado,
// los de entrega más vieja primero. Por cliente y por entrega. SIN dinero: el
// colaborador solo ve piezas y descripciones.
export async function GET(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const todos = await cargarPedidosEnTienda(supabase)
    // Las fotos de WhatsApp viven en un bucket privado: hay que firmarlas para verlas.
    const rutas = todos.slice(0, 5).flatMap(c => c.entregas.flatMap(e => e.items.map(i => i.imagen)))
    const firmadas = await urlsFirmadas(supabase, rutas, 3600)
    for (const c of todos.slice(0, 5)) for (const e of c.entregas) for (const i of e.items) {
      if (i.imagen && !String(i.imagen).startsWith('http')) i.imagen = firmadas[i.imagen] || null
    }
    const lista = todos.slice(0, 5).map(c => ({
      cliente_id: c.cliente_id, nombre: c.nombre, dias: c.dias,
      entregas: c.entregas.map(e => ({
        entrega_id: e.entrega_id, fecha: e.fecha, piezas: e.piezas,
        items: e.items,
      })),
    }))
    const { data: hechos } = await supabase.from('jarvis_confirmaciones').select('cliente_id')
      .eq('confirmado_por', sesion.id).gte('creada_en', `${fechaHoy()}T00:00:00`)
    return NextResponse.json({
      ok: true, clientes: lista, total_esperando: todos.length,
      hechos_hoy: new Set((hechos || []).map(h => h.cliente_id)).size,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}

// POST { cliente_id, decisiones: [{ entrega_id, resultado }], foto_url }
// resultado: 'en_tienda' (sigue aquí: exige foto) o 'no_esta' (ya no está: se
// entregó y no se marcó; se cierra como Entregado sin cobro ni aviso).
export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  const body = await req.json().catch(() => ({}))
  const decisiones = Array.isArray(body.decisiones) ? body.decisiones : []
  const validos = ['en_tienda', 'no_esta']
  if (!body.cliente_id || !decisiones.length || decisiones.some(d => !d.entrega_id || !validos.includes(d.resultado))) {
    return NextResponse.json({ ok: false, mensaje: 'Datos incompletos' }, { status: 400 })
  }
  const foto = String(body.foto_url || '').trim()
  if (decisiones.some(d => d.resultado === 'en_tienda') && !/^https:\/\//.test(foto)) {
    return NextResponse.json({ ok: false, mensaje: 'Falta la foto de lo que sigue en tienda' }, { status: 400 })
  }
  try {
    const todos = await cargarPedidosEnTienda(supabase, { incluirConfirmados: false })
    const cli = todos.find(c => c.cliente_id === body.cliente_id)
    if (!cli) return NextResponse.json({ ok: false, mensaje: 'Ese cliente ya no tiene pedidos por confirmar' }, { status: 409 })

    let cerrados = 0
    for (const d of decisiones) {
      const ent = cli.entregas.find(e => e.entrega_id === d.entrega_id)
      if (!ent) continue
      // "No está" = ya no está en la tienda, o sea que se entregó y solo faltó
      // marcarlo: se cierra ahí mismo, sin cobro ni aviso al cliente.
      if (d.resultado === 'entregado' || d.resultado === 'no_esta') {
        await cerrarComoEntregado(supabase, { ids: ent.ids, usuarioId: sesion.id, ahora: horaLocal() })
        cerrados += ent.ids.length
      }
      const { error } = await supabase.from('jarvis_confirmaciones').upsert({
        cliente_id: cli.cliente_id, entrega_id: ent.entrega_id, resultado: d.resultado === 'entregado' ? 'no_esta' : d.resultado,
        resuelto_en: d.resultado === 'en_tienda' ? null : horaLocal(),
        foto_url: d.resultado === 'en_tienda' ? foto : null,
        piezas: ent.piezas, monto: ent.monto, confirmado_por: sesion.id,
      }, { onConflict: 'cliente_id,entrega_id' })
      if (error) throw new Error(error.message)
    }
    // Cuenta para la actividad "Confirmar clientes" (una vez por cliente y día).
    const hoy = fechaHoy()
    const { data: ya } = await supabase.from('jarvis_seguimientos').select('id')
      .eq('cliente_id', cli.cliente_id).eq('usuario_id', sesion.id).eq('fecha', hoy).limit(1)
    if (!ya?.length) {
      await supabase.from('jarvis_seguimientos').insert({
        cliente_id: cli.cliente_id, usuario_id: sesion.id, fecha: hoy, resultado: 'otro', nota: 'Confirmación de pedido en tienda',
      })
    }
    return NextResponse.json({ ok: true, cerrados })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
