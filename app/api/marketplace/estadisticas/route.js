import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Estadísticas de Facebook Marketplace. Los datos los escribe el agente
// programado (ver claude/manual-publicar-facebook-marketplace.md, sección 11):
// una fila en publicaciones_marketplace por cada publicación y una en
// marketplace_ejecuciones por cada ejecución (publicó, se saltó, avisó FB).
// Sólo admin.

// Día calendario en Hermosillo (UTC-7 todo el año, sin horario de verano).
const diaHermosillo = (iso) => {
  const d = new Date(new Date(iso).getTime() - 7 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export async function GET(req) {
  if (!requerirAdmin(req)) {
    return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  }

  const [pubs, ejec, catalogo] = await Promise.all([
    supabase.from('publicaciones_marketplace')
      .select('id, producto_id, titulo, precio, categoria_catalogo, categoria_fb, publicada_en, origen, estado, vendida_en, clics, mensajes, clics_actualizado_en')
      .order('publicada_en', { ascending: false })
      .limit(2000),
    supabase.from('marketplace_ejecuciones')
      .select('id, ejecutada_en, resultado, detalle')
      .order('ejecutada_en', { ascending: false })
      .limit(500),
    supabase.from('productos_tienda')
      .select('id')
      .eq('activo', true)
      .gt('stock', 0)
      .not('imagen_url', 'is', null)
      .like('imagen_url', '%supabase.co%')
      .or('pendiente_aprobacion.is.null,pendiente_aprobacion.eq.false')
      .limit(5000),
  ])

  if (pubs.error) return NextResponse.json({ ok: false, mensaje: pubs.error.message })
  if (ejec.error) return NextResponse.json({ ok: false, mensaje: ejec.error.message })

  const P = pubs.data || []
  const E = ejec.data || []
  const hoy = diaHermosillo(new Date().toISOString())
  const haceDias = (n) => diaHermosillo(new Date(Date.now() - n * 86400000).toISOString())

  const dia = (p) => diaHermosillo(p.publicada_en)
  const enRango = (p, n) => dia(p) >= haceDias(n - 1)

  // ── Totales ──────────────────────────────────────────────────────────
  const activas  = P.filter(p => p.estado === 'activa').length
  const agotadas = P.filter(p => p.estado === 'agotada').length
  const clics    = P.reduce((s, p) => s + (p.clics || 0), 0)
  const mensajes = P.reduce((s, p) => s + (p.mensajes || 0), 0)
  const totales = {
    publicadas: P.length,
    hoy: P.filter(p => dia(p) === hoy).length,
    ultimos7: P.filter(p => enRango(p, 7)).length,
    activas,
    agotadas,
    clics,
    mensajes,
    clicsPorPublicacion: P.length ? clics / P.length : 0,
    pctVendidas: P.length ? (agotadas / P.length) * 100 : 0,
  }

  // ── Publicadas por día (últimos 14) ──────────────────────────────────
  const porDia = []
  for (let i = 13; i >= 0; i--) {
    const f = haceDias(i)
    porDia.push({ dia: f, n: P.filter(p => dia(p) === f).length })
  }

  // ── Por categoría del catálogo ───────────────────────────────────────
  const mapaCat = {}
  for (const p of P) {
    const c = p.categoria_catalogo || 'Sin categoría'
    const x = (mapaCat[c] ||= { categoria: c, publicadas: 0, clics: 0, mensajes: 0, agotadas: 0 })
    x.publicadas++
    x.clics += p.clics || 0
    x.mensajes += p.mensajes || 0
    if (p.estado === 'agotada') x.agotadas++
  }
  const porCategoria = Object.values(mapaCat)
    .map(x => ({ ...x, clicsPorPublicacion: x.publicadas ? x.clics / x.publicadas : 0 }))
    .sort((a, b) => b.clics - a.clics || b.publicadas - a.publicadas)

  // ── Por hora de publicación (¿en qué horario atraen más?) ────────────
  const mapaHora = {}
  for (const p of P) {
    const h = new Date(new Date(p.publicada_en).getTime() - 7 * 3600 * 1000).getUTCHours()
    const bloque = h < 11 ? 'Mañana (antes de 11)' : h < 16 ? 'Tarde (11 a 16)' : 'Noche (16 en adelante)'
    const x = (mapaHora[bloque] ||= { bloque, publicadas: 0, clics: 0 })
    x.publicadas++
    x.clics += p.clics || 0
  }
  const porHorario = Object.values(mapaHora)
    .map(x => ({ ...x, clicsPorPublicacion: x.publicadas ? x.clics / x.publicadas : 0 }))

  // ── Mejores y sin movimiento ─────────────────────────────────────────
  const activasLista = P.filter(p => p.estado === 'activa')
  const top = [...P].sort((a, b) => (b.clics || 0) - (a.clics || 0)).slice(0, 10)
    .filter(p => (p.clics || 0) > 0)
  const sinMovimiento = activasLista
    .filter(p => dia(p) <= haceDias(7) && (p.clics || 0) === 0 && (p.mensajes || 0) === 0)
    .slice(0, 15)

  // ── Salud de la cuenta ───────────────────────────────────────────────
  const e30 = E.filter(e => diaHermosillo(e.ejecutada_en) >= haceDias(29))
  const cuenta = (r) => e30.filter(e => e.resultado === r).length
  const salud = {
    ejecuciones30: e30.length,
    publicadas30: cuenta('publicada'),
    saltadas30: cuenta('saltada'),
    errores30: cuenta('error'),
    avisos30: cuenta('aviso_facebook'),
    ultimoAviso: E.find(e => e.resultado === 'aviso_facebook') || null,
    ultimaEjecucion: E[0] || null,
  }

  // ── Catálogo pendiente de publicar ───────────────────────────────────
  const yaPublicados = new Set(P.map(p => p.producto_id).filter(Boolean))
  const publicables = (catalogo.data || []).filter(c => !yaPublicados.has(c.id)).length
  const porDiaPromedio = totales.ultimos7 / 7
  const diasRestantes = porDiaPromedio > 0 ? Math.ceil(publicables / porDiaPromedio) : null

  return NextResponse.json({
    ok: true,
    totales, porDia, porCategoria, porHorario, top, sinMovimiento, salud,
    catalogo: { pendientes: publicables, diasRestantes },
    recientes: P.slice(0, 15),
  })
}
