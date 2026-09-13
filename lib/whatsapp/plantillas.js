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
// meta-plantillas-ticket-y-estado-cuenta.md. Falta darla de alta y mandarla
// a aprobación en WhatsApp Manager; mientras no esté aprobada, solo funciona
// dentro de la ventana de 24h (ver enviarEnvioForaneoPorWhatsapp).
export const PLANTILLA_ENVIO_FORANEO = {
  nombre: 'envio_foraneo_denog',
  idioma: 'es_MX',
  tieneHeaderImagen: false,
  // Dada de alta en Meta el 13 sep 2026, pendiente de aprobación.
  // Encabezado: "Tu envío con Denog" -- texto fijo, sin variable, así que no
  // necesita entrar como componente al mandarla (solo el cuerpo lo necesita).
  // Cuerpo: Hola {{1}}, tu pedido ya fue enviado 📦 Paquetería: {{2}}
  // Número de guía: {{3}} Cualquier duda, contáctanos por este medio.
  parametros: ({ nombre, paqueteria, numeroGuia }) => [
    String(nombre || 'Cliente'),
    String(paqueteria || ''),
    String(numeroGuia || ''),
  ],
}
