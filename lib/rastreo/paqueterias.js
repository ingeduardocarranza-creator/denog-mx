// Páginas de rastreo de las paqueterías que normalmente usa Denog.
//
// FedEx y DHL aceptan el número de guía en el link, así que abren directo el
// rastreo del paquete. De Estafeta, PaqueteExpress y Tufesa no se pudo
// confirmar un link con la guía ya puesta; se abre su página oficial de
// rastreo y el cliente pega la guía con el botón "Copiar guía".
// Si en algún momento una paquetería cambia su página, se corrige aquí.

const PAQUETERIAS = {
  fedex: {
    nombre: 'FedEx',
    url: (guia) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(guia)}`,
    conGuia: true,
  },
  dhl: {
    nombre: 'DHL',
    url: (guia) => `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${encodeURIComponent(guia)}`,
    conGuia: true,
  },
  estafeta: {
    nombre: 'Estafeta',
    url: () => 'https://www.estafeta.com/Herramientas/Rastreo',
    conGuia: false,
  },
  paquetexpress: {
    nombre: 'PaqueteExpress',
    url: () => 'https://www.paquetexpress.com.mx/',
    conGuia: false,
  },
  tufesa: {
    nombre: 'Tufesa',
    url: () => 'https://www.tufesa.com.mx/',
    conGuia: false,
  },
}

const normalizar = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '')

// Devuelve { nombre, url, conGuia } o null si la paquetería no está en la lista
// (por ejemplo "Otra"): en ese caso la página solo muestra la guía para copiar.
export function rastreoDePaqueteria(paqueteria, guia) {
  const clave = normalizar(paqueteria)
  const p = PAQUETERIAS[clave]
  if (!p) return null
  return { nombre: p.nombre, url: p.url(guia), conGuia: p.conGuia }
}
