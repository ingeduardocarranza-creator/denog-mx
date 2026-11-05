import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'
import { clienteSupabaseServicio } from '@/lib/mercadolibre/api'
import { cargarPaquetes, vistaPaquete, mensajeEtiqueta, inicioDeHoy } from '@/lib/mercadolibre/empaque'

// Pantallas del colaborador (admin o vendedor).
//   ?vista=menu       → conteos para los tres botones
//   ?vista=siguiente  → el siguiente paquete a empacar (&omitir=a,b salta paquetes)
//   ?vista=esperando  → paquetes con productos listos pero sin etiqueta
//   ?vista=hechos     → lo empacado hoy
export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const url = new URL(req.url)
  const vista = url.searchParams.get('vista') || 'menu'
  const supabase = clienteSupabaseServicio()
  try {
    const paquetes = (await cargarPaquetes(supabase)).filter(p => p.listo)
    const paraEmpacar = paquetes.filter(p => p.etiqueta_lista)
    const esperando = paquetes.filter(p => !p.etiqueta_lista)

    if (vista === 'menu' || vista === 'esperando') {
      const { count } = await supabase.from('ml_ventas').select('id', { count: 'exact', head: true })
        .eq('empaque_estado', 'empacada').gte('empacada_en', inicioDeHoy().toISOString())
      if (vista === 'menu') {
        return NextResponse.json({ ok: true, para_empacar: paraEmpacar.length, esperando: esperando.length, hechos_hoy: count || 0 })
      }
      return NextResponse.json({
        ok: true,
        esperando: esperando.map(p => ({
          paquete: p.paquete,
          productos: p.items.map(i => ({ titulo: i.titulo, miniatura: i.miniatura, cantidad: i.cantidad })),
          mensaje: mensajeEtiqueta(p),
        })),
      })
    }

    if (vista === 'siguiente') {
      const omitir = new Set((url.searchParams.get('omitir') || '').split(',').filter(Boolean))
      const p = paraEmpacar.find(x => !omitir.has(x.paquete)) || null
      return NextResponse.json({ ok: true, paquete: p ? vistaPaquete(p) : null, restantes: paraEmpacar.length })
    }

    if (vista === 'hechos') {
      const { data } = await supabase.from('ml_ventas')
        .select('paquete, empacada_en, empacada_por, items:ml_venta_items(titulo, cantidad)')
        .eq('empaque_estado', 'empacada').gte('empacada_en', inicioDeHoy().toISOString())
        .order('empacada_en', { ascending: false })
      const vistos = new Set()
      const salida = []
      for (const v of data || []) {
        if (vistos.has(v.paquete)) continue
        vistos.add(v.paquete)
        salida.push({ paquete: v.paquete, empacada_en: v.empacada_en, empacada_por: v.empacada_por, productos: v.items })
      }
      return NextResponse.json({ ok: true, hechos: salida })
    }

    return NextResponse.json({ ok: false, mensaje: 'Vista desconocida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, mensaje: e.message })
  }
}
