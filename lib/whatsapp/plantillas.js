// Las dos plantillas que Meta ya aprobó (categoría Utilidad, español MX).
// El nombre, el idioma y el orden de las variables tienen que calzar EXACTO
// con lo que se dio de alta en WhatsApp Manager — si algo no cuadra, Meta
// contesta con un error y el mensaje no sale.
//
// Las dos se dieron de alta con encabezado de IMAGEN (así se propuso en el
// plan que se mandó a revisar y así lo pide el propio texto del cuerpo:
// "en la imagen adjunta puedes revisar el detalle..."). Si al primer envío
// real Meta rechaza por "el número de componentes no coincide", es que
// alguna quedó sin encabezado de imagen — se revisa en WhatsApp Manager
// abriendo la plantilla y viendo si dice "Encabezado: Imagen", y se ajusta
// aquí (quitar el bloque `header` de la llamada en lib/whatsapp/enviar.js).

import { fmt } from '@/lib/estadosCuenta/dibujar'

// Meta pidió el ejemplo de fecha como 08/09/2026 (DD/MM/AAAA) al aprobar
// ticket_compra_denog. Se usa el mismo formato en las dos plantillas por
// consistencia.
export function fmtFechaPlantilla(f) {
  if (!f) return ''
  const d = new Date(String(f).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export const PLANTILLA_TICKET = {
  nombre: 'ticket_compra_denog',
  idioma: 'es_MX',
  tieneHeaderImagen: true,
  // Gracias por tu compra con DENOG 📦 Folio: {{1}} Fecha: {{2}} Total: {{3}}
  // Cualquier duda, contáctanos por este medio.
  parametros: (datos) => [
    String(datos.folio || ''),
    fmtFechaPlantilla(datos.fecha),
    fmt(datos.total),
  ],
}

export const PLANTILLA_ESTADO_CUENTA = {
  nombre: 'estado_de_cuenta_denog',
  idioma: 'es_MX',
  tieneHeaderImagen: true,
  // Hola {{1}}, te compartimos tu estado de cuenta actualizado con DENOG 📦
  // Saldo total a pagar: {{2}} Fecha de entrega: {{3}} Tienes hasta el {{4}}
  // para recoger y liquidar este saldo. En la imagen adjunta puedes revisar
  // el detalle de tus artículos y abonos aplicados.
  parametros: ({ nombre, saldo, fechaEntrega, fechaLimite }) => [
    String(nombre || 'Cliente'),
    fmt(saldo),
    fmtFechaPlantilla(fechaEntrega),
    fechaLimite ? fmtFechaPlantilla(fechaLimite) : 'por confirmar',
  ],
}

// Plantilla del aviso de envío foráneo (paquetería/guía). Sin encabezado de
// imagen -- es solo texto, como se pensó para "Domicilio agendado" en
// meta-plantillas-ticket-y-estado-cuenta.md.
// Dada de alta en Meta el 13 sep 2026 y APROBADA (confirmado por Lalo el
// 13 sep 2026) -- ya se puede mandar fuera de la ventana de 24h.
// Encabezado: "Tu envío con Denog" -- texto fijo, sin variable, así que no
// necesita entrar como componente al mandarla (solo el cuerpo lo necesita).
export const PLANTILLA_ENVIO_FORANEO = {
  nombre: 'envio_foraneo_denog',
  idioma: 'es_MX',
  tieneHeaderImagen: false,
  // Cuerpo: Hola {{1}}, tu pedido ya fue enviado 📦 Paquetería: {{2}}
  // Número de guía: {{3}} Cualquier duda, contáctanos por este medio.
  parametros: ({ nombre, paqueteria, numeroGuia }) => [
    String(nombre || 'Cliente'),
    String(paqueteria || ''),
    String(numeroGuia || ''),
  ],
}

// Formato "15 SEPTIEMBRE 2026" -- el mismo que ya usa el panel de
// domicilios (formatearFecha en app/admin/domicilios/page.js) para que el
// día se vea igual en pantalla y en el WhatsApp que le llega al cliente.
const MESES_LARGO = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
export function formatearFechaLarga(fecha) {
  if (!fecha) return ''
  const d = new Date(String(fecha).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}`
}

// Plantilla de confirmación de domicilio agendado. Se dio de alta y se
// aprobó por primera vez en Meta con 3 variables (nombre, día, dirección);
// después Lalo pidió agregar el desglose de saldo/envío/total, así que el
// cuerpo de aquí abajo YA es la versión de 6 variables -- falta editarla en
// WhatsApp Manager con este texto y esperar la segunda aprobación (ver
// claude/meta-plantillas-ticket-y-estado-cuenta.md). Sin encabezado de
// imagen: es solo texto ("Domicilio agendado" como encabezado fijo, sin
// variable).
export const PLANTILLA_DOMICILIO_AGENDADO = {
  nombre: 'domicilio_agendado_denog',
  idioma: 'es_MX',
  tieneHeaderImagen: false,
  // Hola {{1}}, tu domicilio con Denog USA Compras quedó agendado 📦
  // Día programado: {{2}}
  // Dirección: {{3}}
  // Saldo de mercancía: {{4}}
  // Envío: {{5}}
  // Total a pagar: {{6}}
  // Cualquier duda, contáctanos por este medio.
  parametros: ({ nombre, diaProgramado, direccion, saldoMercancia, envio, total }) => [
    String(nombre || 'Cliente'),
    String(diaProgramado || ''),
    String(direccion || ''),
    fmt(saldoMercancia),
    fmt(envio),
    fmt(total),
  ],
}

// ── Recordatorios de cobranza (sección /admin/cobranza) ──────────────────
// Dadas de alta en Meta el 11 oct 2026 (categoría Utilidad, es_MX, con
// encabezado de IMAGEN = estado de cuenta solo de entregas pasadas, pie
// "Denog USA Compras", sin botones, validez 1 día).
//
// OJO: en estas dos el "$" ya viene escrito en el texto de la plantilla
// ("saldo pendiente de ${{2}}"), así que el monto se manda SIN signo --
// con fmt() saldría "$$2,850". Y la fecha va con palabras ("16 de
// octubre"), que es el ejemplo con el que se mandaron a revisar.
const MESES_TEXTO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
export function fmtFechaTexto(f) {
  if (!f) return ''
  const d = new Date(String(f).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} de ${MESES_TEXTO[d.getMonth()]}`
}
export const fmtMontoSinSigno = (n) => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })

// Aviso 1: "por vencer". Tiene al menos una entrega todavía en plazo.
export const PLANTILLA_RECORDATORIO_TIENDA = {
  nombre: 'recordatorio_pedido_tienda',
  idioma: 'es_MX',
  tieneHeaderImagen: true,
  // Hola {{1}} 👋 Te recordamos que tu pedido ya está en tienda esperándote.
  // Tienes un saldo pendiente de ${{2}} y puedes pasar por él antes del {{3}}.
  parametros: ({ nombre, saldo, fecha }) => [
    String(nombre || 'Cliente'),
    fmtMontoSinSigno(saldo),
    fmtFechaTexto(fecha),
  ],
  textoLibre: ({ nombre, saldo, fecha }) => [
    `Hola ${nombre || 'Cliente'} 👋`,
    '',
    `Te recordamos que tu pedido ya está en tienda esperándote. Tienes un saldo pendiente de $${fmtMontoSinSigno(saldo)} y puedes pasar por él antes del ${fmtFechaTexto(fecha)}.`,
    '',
    'Horario de atención: lunes a viernes 10am–7pm, sábado 10am–5pm.',
    '',
    'Te compartimos tu estado de cuenta. ¡Te esperamos!',
  ].join('\n'),
}

// Aviso 2: "vencido". Todas sus entregas pendientes ya vencieron.
// Ojo con el orden: aquí va primero la fecha y luego el saldo.
export const PLANTILLA_RECORDATORIO_VENCIDO = {
  nombre: 'recordatorio_pedido_vencido',
  idioma: 'es_MX',
  tieneHeaderImagen: true,
  // Hola {{1}} 👋 Tu fecha límite para recoger tu pedido fue el {{2}}, pero
  // no te preocupes: tu pedido sigue en tienda y aún puedes pasar por él. Tu
  // saldo pendiente es de ${{3}}.
  parametros: ({ nombre, saldo, fecha }) => [
    String(nombre || 'Cliente'),
    fmtFechaTexto(fecha),
    fmtMontoSinSigno(saldo),
  ],
  textoLibre: ({ nombre, saldo, fecha }) => [
    `Hola ${nombre || 'Cliente'} 👋`,
    '',
    `Tu fecha límite para recoger tu pedido fue el ${fmtFechaTexto(fecha)}, pero no te preocupes: tu pedido sigue en tienda y aún puedes pasar por él. Tu saldo pendiente es de $${fmtMontoSinSigno(saldo)}.`,
    '',
    'Horario de atención: lunes a viernes 10am–7pm, sábado 10am–5pm.',
    '',
    'Te compartimos tu estado de cuenta.',
  ].join('\n'),
}
