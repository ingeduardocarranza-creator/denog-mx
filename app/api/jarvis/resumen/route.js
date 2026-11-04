import { NextResponse } from 'next/server'
import { requerirAdmin } from '@/lib/auth/session'
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion'

export const dynamic = 'force-dynamic'

// Resumen para el admin: cómo va el dinero, la tienda y el equipo, y qué requiere
// su atención. Las fechas de la base (pagos, ventas) están en hora de Hermosillo
// sin zona, así que todo se agrupa por el día local.
const fechaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date())
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const dowDe = (f) => new Date(`${f}T12:00:00Z`).getUTCDay()

export async function GET(req) {
  const sesion = requerirAdmin(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const hoy = fechaHoy()
    const ayer = sumarDias(hoy, -1)
    const desde14 = sumarDias(hoy, -13)
    const desde7 = sumarDias(hoy, -6)
    const desde30 = sumarDias(hoy, -29)
    const manana = sumarDias(hoy, 1)

    const [pagosR, ventasR, vend30R, gastosR] = await Promise.all([
      supabase.from('pagos').select('monto, tipo, metodo, creado_en, vendedor_id')
        .gte('creado_en', `${desde14}T00:00:00`).lt('creado_en', `${manana}T00:00:00`).neq('metodo', 'Ajuste histórico').limit(10000),
      supabase.from('ventas_tienda').select('producto_id, nombre_producto, cantidad, precio_unitario, costo_unitario, vendedor_id, creado_en')
        .gte('creado_en', `${desde30}T00:00:00`).lt('creado_en', `${manana}T00:00:00`).limit(20000),
      supabase.from('clientes').select('id, nombre').in('rol', ['vendedor', 'admin']),
      supabase.from('gastos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ])
    for (const r of [pagosR, ventasR]) if (r.error) throw new Error(r.error.message)
    const pagos = pagosR.data || [], ventas = ventasR.data || []
    const nombres = Object.fromEntries((vend30R.data || []).map(c => [c.id, c.nombre]))

    // ── Dinero que entró, por día (últimos 14) ──
    const porDia = {}
    for (let i = 0; i < 14; i++) porDia[sumarDias(desde14, i)] = 0
    for (const p of pagos) { const d = String(p.creado_en).slice(0, 10); if (d in porDia) porDia[d] += Number(p.monto) || 0 }
    const serie = Object.entries(porDia).map(([fecha, total]) => ({ fecha, dia: DIAS[dowDe(fecha)], total: r2(total) }))
    const suma = (desde, hasta, filtro = () => true) => r2(pagos.filter(p => { const d = String(p.creado_en).slice(0, 10); return d >= desde && d <= hasta && filtro(p) }).reduce((s, p) => s + (Number(p.monto) || 0), 0))
    const dinero = {
      hoy: suma(hoy, hoy), ayer: suma(ayer, ayer),
      semana: suma(desde7, hoy), semana_anterior: suma(sumarDias(desde7, -7), sumarDias(hoy, -7)),
      // mismo día de la semana pasada, para comparar peras con peras
      ayer_semana_pasada: suma(sumarDias(ayer, -7), sumarDias(ayer, -7)),
    }
    const semanaPagos = pagos.filter(p => String(p.creado_en).slice(0, 10) >= desde7)
    const porMetodo = {}, porTipo = {}
    for (const p of semanaPagos) {
      porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + (Number(p.monto) || 0)
      const t = p.tipo === 'Anticipo' ? 'Anticipos' : p.tipo === 'Envío' ? 'Envíos' : 'Cobros de entregas y ventas'
      porTipo[t] = (porTipo[t] || 0) + (Number(p.monto) || 0)
    }
    const lista = (o) => Object.entries(o).map(([nombre, total]) => ({ nombre, total: r2(total) })).sort((a, b) => b.total - a.total)

    // ── Venta de tienda ──
    const imp = (v) => (Number(v.precio_unitario) || 0) * (Number(v.cantidad) || 0)
    const enRango = (v, desde, hasta) => { const d = String(v.creado_en).slice(0, 10); return d >= desde && d <= hasta }
    const v7 = ventas.filter(v => enRango(v, desde7, hoy))
    const conCosto = v7.filter(v => v.costo_unitario != null)
    const tienda = {
      hoy: r2(ventas.filter(v => enRango(v, hoy, hoy)).reduce((s, v) => s + imp(v), 0)),
      ayer: r2(ventas.filter(v => enRango(v, ayer, ayer)).reduce((s, v) => s + imp(v), 0)),
      semana: r2(v7.reduce((s, v) => s + imp(v), 0)),
      semana_anterior: r2(ventas.filter(v => enRango(v, sumarDias(desde7, -7), sumarDias(hoy, -7))).reduce((s, v) => s + imp(v), 0)),
      piezas_semana: v7.reduce((s, v) => s + (Number(v.cantidad) || 0), 0),
      utilidad_semana: r2(conCosto.reduce((s, v) => s + (Number(v.precio_unitario) - Number(v.costo_unitario)) * Number(v.cantidad), 0)),
    }
    const prod = {}
    for (const v of v7) {
      const k = v.producto_id || v.nombre_producto
      const x = prod[k] ||= { nombre: v.nombre_producto, piezas: 0, total: 0 }
      x.piezas += Number(v.cantidad) || 0; x.total += imp(v)
    }
    const top = Object.values(prod).sort((a, b) => b.total - a.total).slice(0, 5).map(p => ({ ...p, total: r2(p.total) }))

    // ── Por colaborador (7 días, ventas de tienda) ──
    const col = {}
    for (const v of v7) {
      const x = col[v.vendedor_id || '—'] ||= { nombre: nombres[v.vendedor_id] || 'Sin asignar', total: 0, piezas: 0 }
      x.total += imp(v); x.piezas += Number(v.cantidad) || 0
    }
    const colaboradores = Object.values(col).map(c => ({ ...c, total: r2(c.total) })).sort((a, b) => b.total - a.total)

    // ── Resurtir: se vendieron en 30 días y ya están en cero ──
    const vendidos = {}
    for (const v of ventas) if (v.producto_id) {
      const x = vendidos[v.producto_id] ||= { nombre: v.nombre_producto, piezas: 0 }
      x.piezas += Number(v.cantidad) || 0
    }
    const ids = Object.keys(vendidos)
    const { data: prods } = ids.length ? await supabase.from('productos_tienda').select('id, stock, activo').in('id', ids) : { data: [] }
    const resurtir = (prods || []).filter(p => (Number(p.stock) || 0) <= 0)
      .map(p => ({ nombre: vendidos[p.id].nombre, piezas: vendidos[p.id].piezas }))
      .sort((a, b) => b.piezas - a.piezas).slice(0, 6)

    // ── Para tu atención ──
    const cuenta = async (q) => { const { count } = await q; return count || 0 }
    const [comis, difs, avisos, porAvisar] = await Promise.all([
      cuenta(supabase.from('comisiones_colaborador').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')),
      cuenta(supabase.from('conteos_inventario_detalle').select('id', { count: 'exact', head: true }).eq('estado_revision', 'pendiente')),
      cuenta(supabase.from('jarvis_avisos').select('id', { count: 'exact', head: true }).neq('tipo', 'relevo').is('resuelto_en', null)),
      cuenta(supabase.from('jarvis_confirmaciones').select('id', { count: 'exact', head: true }).eq('resultado', 'en_tienda').is('avisado_en', null)),
    ])
    const atencion = [
      { clave: 'comisiones', icono: '💰', t: 'Comisiones por aprobar', n: comis, vista: 'comisiones' },
      { clave: 'avisos', icono: '📣', t: 'Avisos del equipo', n: avisos, vista: 'avisos' },
      { clave: 'entienda', icono: '📲', t: 'Clientes por avisar (pedido en tienda)', n: porAvisar, vista: 'entienda' },
      { clave: 'inventario', icono: '🗃️', t: 'Diferencias de inventario por revisar', n: difs, href: '/admin/inventario' },
      { clave: 'gastos', icono: '🧾', t: 'Gastos por aprobar', n: gastosR.count || 0, href: '/admin/gastos' },
    ].filter(a => a.n > 0)

    return NextResponse.json({ ok: true, hoy, serie, dinero, por_metodo: lista(porMetodo), por_tipo: lista(porTipo), tienda, top, colaboradores, resurtir, atencion })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
