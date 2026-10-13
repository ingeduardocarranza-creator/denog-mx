// Cobranza: quién tiene mercancía en tienda sin pagar, y qué aviso le toca.
//
// Reglas (decididas por Lalo, 13 oct 2026):
//  · Solo cuentan entregas 'en_tienda'. La 'futura' es la venta que todavía
//    se está haciendo: no es deuda y no entra ni al saldo ni a la imagen.
//  · Solo aparece quien tiene saldo. Quien ya pagó todo aunque no haya
//    recogido (se fue de la ciudad, etc.) no se cobra.
//  · Un solo mensaje por cliente, con el saldo de todas sus entregas pasadas.
//  · Aviso 1 "por vencer" (recordatorio_pedido_tienda): tiene al menos una
//    entrega todavía en plazo -- aunque además tenga otras vencidas. La fecha
//    del mensaje es la fecha límite más próxima de las que siguen en plazo.
//  · Aviso 2 "vencido" (recordatorio_pedido_vencido): TODAS sus entregas
//    pendientes ya vencieron. La fecha es la de la vencida más reciente.
//
// El saldo de cada entrega sale de netoDeGrupo, la misma fórmula del estado
// de cuenta -- para que el número de esta pantalla, el del mensaje y el de la
// imagen sean siempre el mismo.

import { netoDeGrupo } from '@/lib/estadosCuenta/dibujar'
import { sugerirFechaLimite } from '@/lib/entregas/fechaLimite'
import { a10Digitos } from '@/lib/whatsapp/telefono'

const ZONA = 'America/Hermosillo'

// PostgREST corta en 1000 filas por respuesta.
async function todas(consulta) {
  const PAGE = 1000
  let filas = []
  let desde = 0
  for (;;) {
    const { data, error } = await consulta.range(desde, desde + PAGE - 1)
    if (error) throw new Error(error.message)
    filas = filas.concat(data || [])
    if (!data || data.length < PAGE) return filas
    desde += PAGE
  }
}

// 'YYYY-MM-DD' de hoy en Hermosillo (Vercel corre en UTC: sin esto, después
// de las 5 pm "hoy" ya sería mañana).
export function hoyHermosillo(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha)
}

function diaYHora(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(fecha)
  const v = (t) => partes.find(p => p.type === t)?.value
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { dia: dias[v('weekday')], minutos: (Number(v('hour')) % 24) * 60 + Number(v('minute')) }
}

// Horario de atención en tienda: L–V 10:00–19:00, sábado 10:00–17:00.
// Fuera de eso no se manda ningún recordatorio: un cobro a las 11 pm se
// siente agresivo y el cliente ni siquiera puede venir.
export const HORARIO_TEXTO = 'lunes a viernes 10am–7pm, sábado 10am–5pm'
export function dentroDeHorario(fecha = new Date()) {
  const { dia, minutos } = diaYHora(fecha)
  if (dia === 0) return false
  const cierre = dia === 6 ? 17 * 60 : 19 * 60
  return minutos >= 10 * 60 && minutos < cierre
}

function diasEntre(desdeISO, hastaISO) {
  const a = new Date(desdeISO + 'T12:00:00')
  const b = new Date(hastaISO + 'T12:00:00')
  return Math.round((b - a) / 86400000)
}

// Arma la lista de cobranza. Con clienteId, solo ese cliente (para enviar).
export async function cargarCobranza(supabase, { clienteId = null } = {}) {
  const hoy = hoyHermosillo()

  const { data: entregas, error: eEnt } = await supabase.from('entregas').select('id, fecha_entrega, fecha_limite, estado')
  if (eEnt) throw new Error(eEnt.message)
  const enTienda = (entregas || []).filter(e => e.estado === 'en_tienda')
  const idsEnTienda = enTienda.map(e => e.id)
  if (idsEnTienda.length === 0) return { hoy, clientes: [] }

  // Mismos filtros que el estado de cuenta (lib/estadosCuenta/armar.js y
  // datosServidor.js): sin borradores de WhatsApp, sin lo que no llegó o se
  // canceló, sin lo pausado; y los pagos sin los envíos a domicilio.
  let qPedidos = supabase.from('pedidos')
    .select('cliente_id, entrega_id, estado, precio_venta')
    .eq('pendiente_aprobacion', false)
    .in('entrega_id', idsEnTienda)
    .not('estado', 'in', '("no_llego","Cancelado","pendiente")')
  let qPagos = supabase.from('pagos')
    .select('cliente_id, entrega_id, monto, tipo')
    .neq('tipo', 'Envío')
    .in('entrega_id', idsEnTienda)
  if (clienteId) { qPedidos = qPedidos.eq('cliente_id', clienteId); qPagos = qPagos.eq('cliente_id', clienteId) }

  const [pedidos, pagos] = await Promise.all([
    todas(qPedidos.order('creado_en')),
    todas(qPagos.order('creado_en')),
  ])

  // cliente -> entrega -> grupo
  const porCliente = {}
  for (const p of pedidos) {
    const cid = String(p.cliente_id)
    porCliente[cid] ||= {}
    porCliente[cid][p.entrega_id] ||= { pedidos: [], pagos: [] }
    porCliente[cid][p.entrega_id].pedidos.push(p)
  }
  for (const p of pagos) {
    const g = porCliente[String(p.cliente_id)]?.[p.entrega_id]
    if (g) g.pagos.push(p)   // igual que armarPorEntrega: un pago sin pedidos en esa entrega no se cuenta
  }

  const deudores = []
  for (const [cid, porEntrega] of Object.entries(porCliente)) {
    const grupos = []
    for (const [eid, g] of Object.entries(porEntrega)) {
      const { neto } = netoDeGrupo(g)
      if (neto <= 0.5) continue
      const ent = enTienda.find(e => String(e.id) === String(eid))
      const limite = ent.fecha_limite || sugerirFechaLimite(ent.fecha_entrega)
      const diasRestantes = limite ? diasEntre(hoy, limite) : null
      grupos.push({
        entregaId: ent.id,
        fechaEntrega: ent.fecha_entrega,
        fechaLimite: limite,
        limiteEstimado: !ent.fecha_limite,
        vencida: limite ? limite < hoy : false,
        diasRestantes,
        saldo: neto,
        pedidosEnTienda: g.pedidos.filter(p => p.estado !== 'Entregado').length,
      })
    }
    if (grupos.length === 0) continue
    grupos.sort((a, b) => String(a.fechaEntrega).localeCompare(String(b.fechaEntrega)))

    const enPlazo = grupos.filter(g => !g.vencida)
    const vencidas = grupos.filter(g => g.vencida)
    const aviso = enPlazo.length > 0 ? 'por_vencer' : 'vencido'
    const fechaAviso = aviso === 'por_vencer'
      ? enPlazo.map(g => g.fechaLimite).filter(Boolean).sort()[0] || null
      : vencidas.map(g => g.fechaLimite).sort().reverse()[0]

    deudores.push({
      clienteId: cid,
      grupos,
      saldo: grupos.reduce((s, g) => s + g.saldo, 0),
      pedidosEnTienda: grupos.reduce((s, g) => s + g.pedidosEnTienda, 0),
      entregasVencidas: vencidas.length,
      aviso,
      fechaAviso,
      diasAviso: fechaAviso ? diasEntre(hoy, fechaAviso) : null,
    })
  }
  if (deudores.length === 0) return { hoy, clientes: [] }

  const ids = deudores.map(d => d.clienteId)
  const [clientesRes, envios, seguimientoRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre, telefono').in('id', ids),
    todas(supabase.from('whatsapp_envios')
      .select('cliente_id, creado_en, plantilla, via, enviado_por')
      .eq('tipo', 'recordatorio').eq('exito', true).in('cliente_id', ids)
      .order('creado_en', { ascending: false })),
    supabase.from('cobranza_seguimiento').select('*').in('cliente_id', ids),
  ])
  if (clientesRes.error) throw new Error(clientesRes.error.message)
  if (seguimientoRes.error) throw new Error(seguimientoRes.error.message)

  const telefonos = (clientesRes.data || []).map(c => a10Digitos(c.telefono)).filter(Boolean)
  const { data: ventanas } = telefonos.length
    ? await supabase.from('whatsapp_ventana').select('telefono, ultimo_mensaje_en').in('telefono', telefonos)
    : { data: [] }

  // Nombres de quien mandó cada recordatorio (el staff vive en clientes, con rol).
  const idsStaff = [...new Set(envios.map(e => e.enviado_por).filter(Boolean))]
  const { data: staff } = idsStaff.length
    ? await supabase.from('clientes').select('id, nombre').in('id', idsStaff)
    : { data: [] }
  const nombreStaff = (id) => (staff || []).find(s => String(s.id) === String(id))?.nombre?.split(' ')[0] || null

  const clientes = deudores.map(d => {
    const cl = (clientesRes.data || []).find(c => String(c.id) === d.clienteId) || {}
    const tel10 = a10Digitos(cl.telefono)
    const susEnvios = envios.filter(e => String(e.cliente_id) === d.clienteId)
    const ultimo = susEnvios[0] || null
    const seg = (seguimientoRes.data || []).find(s => String(s.cliente_id) === d.clienteId) || null
    const ventana = (ventanas || []).find(v => v.telefono === tel10)
    const ultimoMensaje = ventana?.ultimo_mensaje_en || null

    const pausado = !!(seg?.pausado_hasta && seg.pausado_hasta >= hoy)
    const promesa = seg?.promesa_fecha
      ? { fecha: seg.promesa_fecha, nota: seg.promesa_nota || '', incumplida: seg.promesa_fecha < hoy }
      : null

    return {
      ...d,
      nombre: cl.nombre || 'Cliente',
      telefono: tel10 || '',
      recordatorios: {
        total: susEnvios.length,
        ultimoEn: ultimo?.creado_en || null,
        ultimoPor: ultimo ? nombreStaff(ultimo.enviado_por) : null,
        enviadoHoy: !!(ultimo && hoyHermosillo(new Date(ultimo.creado_en)) === hoy),
      },
      // "Respondió": nos escribió después del último recordatorio.
      respondioEn: ultimo && ultimoMensaje && new Date(ultimoMensaje) > new Date(ultimo.creado_en) ? ultimoMensaje : null,
      pausa: pausado ? { hasta: seg.pausado_hasta, nota: seg.pausa_nota || '' } : null,
      promesa,
    }
  })

  // Orden de urgencia: pausados al final; primero promesas incumplidas y
  // vencidos (más días vencidos arriba); luego por vencer, el más próximo arriba.
  const peso = (c) => c.pausa ? 3 : (c.promesa?.incumplida || c.aviso === 'vencido') ? 0 : 1
  clientes.sort((a, b) =>
    peso(a) - peso(b) ||
    (a.diasAviso ?? 999) - (b.diasAviso ?? 999) ||
    a.nombre.localeCompare(b.nombre, 'es'))

  return { hoy, clientes }
}
