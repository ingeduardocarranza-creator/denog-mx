import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// La bitácora la escribe un trigger de la base, no la aplicación. Aquí sólo se
// lee. Sólo admin: es el registro de quién tocó el dinero.
//
// La tabla no tiene columna de "quién": la base sólo ve al rol de servicio. El
// responsable se infiere del propio renglón (vendedor_id, colaborador_id,
// resuelto_por…), que queda guardado en el antes/después. Por eso se resuelven
// aquí los nombres: sin esto la pantalla mostraría uuids.
const CAMPOS_PERSONA = [
  'cliente_id', 'vendedor_id', 'colaborador_id', 'admin_id',
  'resuelto_por', 'atendido_por', 'cancelado_por', 'descartado_por',
]

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req) {
  if (!requerirAdmin(req)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const desde     = searchParams.get('desde')
  const hasta     = searchParams.get('hasta')
  const tablas    = (searchParams.get('tablas') || '').split(',').filter(Boolean)
  const operacion = searchParams.get('operacion')
  const buscar    = (searchParams.get('buscar') || '').trim()
  const pagina    = Math.max(0, Number(searchParams.get('pagina') || 0))
  const POR_PAGINA = 60

  let q = supabase
    .from('bitacora')
    .select('id, tabla, operacion, registro_id, antes, despues, cambios, ocurrio_en')
    .order('ocurrio_en', { ascending: false })
    .order('id', { ascending: false })
    // Se pide uno de más para saber si hay página siguiente sin contar todo.
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)

  if (desde) q = q.gte('ocurrio_en', `${desde}T00:00:00`)
  if (hasta) q = q.lte('ocurrio_en', `${hasta}T23:59:59`)
  if (tablas.length) q = q.in('tabla', tablas)
  if (operacion) q = q.eq('operacion', operacion)
  // Buscar por el id de un registro: sirve para seguir la historia completa de
  // un pago o un pedido, que es como se investiga cuando algo no cuadra.
  if (buscar && ES_UUID.test(buscar)) q = q.eq('registro_id', buscar)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  const filas = data || []
  const hayMas = filas.length > POR_PAGINA
  const movimientos = hayMas ? filas.slice(0, POR_PAGINA) : filas

  // Todos los uuids de personas que aparecen en esta página, en una sola
  // consulta. Sin esto habría una por renglón.
  const ids = new Set()
  for (const m of movimientos) {
    for (const fila of [m.antes, m.despues]) {
      if (!fila) continue
      for (const campo of CAMPOS_PERSONA) {
        const v = fila[campo]
        if (v && ES_UUID.test(String(v))) ids.add(String(v))
      }
    }
  }
  let nombres = {}
  if (ids.size) {
    const { data: gente } = await supabase
      .from('clientes').select('id, nombre').in('id', [...ids])
    nombres = Object.fromEntries((gente || []).map(c => [c.id, c.nombre]))
  }

  // Los borrados son la señal de alarma: se cuentan aparte para poder avisarlo
  // arriba sin que el usuario tenga que buscarlos entre los demás renglones.
  let borrados = 0
  {
    let qb = supabase.from('bitacora').select('id', { count: 'exact', head: true }).eq('operacion', 'DELETE')
    if (desde) qb = qb.gte('ocurrio_en', `${desde}T00:00:00`)
    if (hasta) qb = qb.lte('ocurrio_en', `${hasta}T23:59:59`)
    if (tablas.length) qb = qb.in('tabla', tablas)
    const { count } = await qb
    borrados = count || 0
  }

  return NextResponse.json({ ok: true, movimientos, nombres, hayMas, pagina, borrados })
}
