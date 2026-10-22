import { traerTodo } from '@/lib/traerTodo'
import { normalizarDescripcion } from './comun'

// "Lo que te piden": las fotos de producto que mandan los clientes por WhatsApp
// (lib/whatsapp/solicitudes.js), agrupadas por producto y por tipo.
export async function cargarSolicitudes(supabase) {
  const desde30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const desde7 = Date.now() - 7 * 86400000
  const filas = await traerTodo((a, b) => supabase.from('whatsapp_solicitudes')
    .select('titulo, precio, estado, recibido_en, telefono').gte('recibido_en', desde30).range(a, b))

  // Etiquetas (tipo) de cada título.
  const llaves = [...new Set(filas.map(f => normalizarDescripcion(f.titulo)).filter(Boolean))]
  const tipoDe = new Map()
  for (let i = 0; i < llaves.length; i += 300) {
    const { data } = await supabase.from('producto_etiquetas').select('descripcion_norm, tipo').in('descripcion_norm', llaves.slice(i, i + 300))
    for (const e of data || []) if (e.tipo) tipoDe.set(e.descripcion_norm, e.tipo)
  }

  const porTipo = new Map()
  const porProducto = new Map()
  for (const f of filas) {
    const k = normalizarDescripcion(f.titulo)
    if (!k) continue
    const tipo = tipoDe.get(k)
    if (tipo) {
      const t = porTipo.get(tipo.toLowerCase()) || { tipo, pedidas: 0, agotadas: 0, disponibles: 0 }
      t.pedidas++; if (f.estado === 'agotada') t.agotadas++; if (f.estado === 'disponible') t.disponibles++
      porTipo.set(tipo.toLowerCase(), t)
    }
    if (new Date(f.recibido_en).getTime() >= desde7) {
      const p = porProducto.get(k) || { titulo: f.titulo, tipo: tipo || null, precio: f.precio, veces: 0, agotadas: 0, disponibles: 0, clientes: new Set() }
      p.veces++; if (f.estado === 'agotada') p.agotadas++; if (f.estado === 'disponible') p.disponibles++
      p.clientes.add(f.telefono)
      porProducto.set(k, p)
    }
  }
  const productos = [...porProducto.values()].map(p => ({ ...p, clientes: p.clientes.size }))
  const recientes = filas.filter(f => new Date(f.recibido_en).getTime() >= desde7)
  return {
    porTipo,
    resumen: {
      total30: filas.length,
      total7: recientes.length,
      agotadas7: recientes.filter(f => f.estado === 'agotada').length,
      disponibles7: recientes.filter(f => f.estado === 'disponible').length,
      desde: filas.reduce((m, f) => (!m || f.recibido_en < m ? f.recibido_en : m), null),
      top: productos.sort((a, b) => b.veces - a.veces || b.clientes - a.clientes).slice(0, 15),
      agotados: productos.filter(p => p.agotadas > 0).sort((a, b) => b.agotadas - a.agotadas).slice(0, 10),
      tipos: [...porTipo.values()].sort((a, b) => b.pedidas - a.pedidas).slice(0, 10),
    },
  }
}
