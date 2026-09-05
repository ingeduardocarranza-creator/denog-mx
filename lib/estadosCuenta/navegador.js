'use client'
// Adaptador del dibujo para el navegador.
import { dibujarEstadoCuenta, FUENTE_NAVEGADOR } from './dibujar'

let logoPromesa = null
function cargarLogo() {
  if (logoPromesa) return logoPromesa
  logoPromesa = new Promise(resolve => {
    const img = new Image()
    img.onload  = () => resolve({ img, ancho: img.naturalWidth, alto: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = '/logo-estado-cuenta.png'
  })
  return logoPromesa
}

// La misma Poppins que carga next/font en app/layout.js. El nombre real de la
// familia lo genera Next con un hash, asi que se lee del token --font-poppins:
// en canvas no se puede escribir var(--font-poppins), hay que resolverlo antes.
let familia = null
function fuenteDelSitio() {
  if (familia) return familia
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-poppins').trim()
    familia = v ? `${v},${FUENTE_NAVEGADOR}` : FUENTE_NAVEGADOR
  } catch {
    familia = FUENTE_NAVEGADOR
  }
  return familia
}

export async function dibujarEnNavegador(datos) {
  // Sin esperar a que la fuente este lista, el canvas dibuja con la de respaldo
  // y la imagen del panel no coincide con la que se manda por WhatsApp.
  try { await document.fonts.ready } catch { /* navegador viejo: se dibuja igual */ }
  return dibujarEstadoCuenta(datos, {
    crearCanvas: (w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    },
    cargarLogo,
    fuente: fuenteDelSitio(),
    Path2D: typeof Path2D !== 'undefined' ? Path2D : null,
  })
}
