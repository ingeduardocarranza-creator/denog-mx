import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { cargarEstadosDeCuenta } from '@/lib/estadosCuenta/datosServidor'
import { pngEstadoCuenta } from '@/lib/estadosCuenta/servidor'
import { saldoDeGrupos } from '@/lib/estadosCuenta/dibujar'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// GET /api/estados-cuenta/imagen?entrega_id=...&cliente_id=...
//   -> el PNG del estado de cuenta de ese cliente
// GET /api/estados-cuenta/imagen?entrega_id=...&listar=1
//   -> el roster de la entrega (cliente, telefono, saldo, articulos), sin imagenes
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entregaId = searchParams.get('entrega_id')
  const clienteId = searchParams.get('cliente_id')
  const listar    = searchParams.get('listar')

  if (!entregaId) return NextResponse.json({ ok: false, mensaje: 'Falta entrega_id' }, { status: 400 })

  let lista
  try {
    lista = await cargarEstadosDeCuenta(supabase, entregaId)
  } catch (e) {
    console.error('[estados-cuenta/imagen] error cargando datos:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }

  if (listar) {
    return NextResponse.json({
      ok: true,
      clientes: lista.map(d => ({
        cliente_id: d.cliente.id,
        nombre: d.cliente.nombre,
        telefono: d.cliente.telefono || null,
        saldo: saldoDeGrupos(d.grupos),
        articulos: d.grupos.reduce((s, g) => s + g.pedidos.reduce((ss, p) => ss + (p.cantidad || 1), 0), 0),
      })),
    })
  }

  if (!clienteId) return NextResponse.json({ ok: false, mensaje: 'Falta cliente_id' }, { status: 400 })

  const datos = lista.find(d => String(d.cliente.id) === String(clienteId))
  if (!datos) return NextResponse.json({ ok: false, mensaje: 'Ese cliente no tiene estado de cuenta en esta entrega' }, { status: 404 })

  try {
    // ?paleta=cielo — para comparar diseños sin tocar código.
    const png = await pngEstadoCuenta(datos, {
      paleta: searchParams.get('paleta') || undefined,
      marco: searchParams.get('paleta') === 'cielo' ? 'cielo' : undefined,
    })
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="estado-cuenta.png"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[estados-cuenta/imagen] error dibujando:', e.message)
    return NextResponse.json({ ok: false, mensaje: e.message }, { status: 500 })
  }
}
