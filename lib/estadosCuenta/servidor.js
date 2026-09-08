// Adaptador del dibujo para el servidor (@napi-rs/canvas).
//
// Vercel no trae fuentes del sistema, asi que las fuentes viajan en el repo y se
// registran a mano. Sin esto el texto sale en blanco o con cuadritos.

import { createCanvas, loadImage, GlobalFonts, Path2D } from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { dibujarEstadoCuenta } from './dibujar'

const DIR_FUENTES = path.join(process.cwd(), 'lib', 'estadosCuenta', 'fuentes')
const RUTA_LOGO   = path.join(process.cwd(), 'public', 'logo-estado-cuenta.png')

// El orden importa mucho:
//  - Sin las fuentes de simbolos, ✓ y − salen como cuadrito vacio.
//  - Pero Symbols 2 tambien trae versiones EN BLANCO Y NEGRO de 📦 y 💳, asi que
//    si va antes que la de emoji unos emojis salen a color y otros en gris.
// Por eso: texto -> emoji a color -> simbolos -> matematicas.
const COLA = '"Noto Sans","Noto Color Emoji","Noto Sans Symbols 2","Noto Sans Math"'

// Las mismas tipografias del sitio (app/layout.js las carga con next/font).
// Aqui viajan en TTF porque Vercel no trae fuentes del sistema y skia no lee
// woff2. Poppins es el cuerpo (como denog.mx) y Baloo 2 los titulos.
export const FUENTE_SERVIDOR = `"Poppins",${COLA}`

let fuentesListas = false
function registrarFuentes() {
  if (fuentesListas) return
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'NotoSans-Regular.ttf'), 'Noto Sans')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'NotoSans-Bold.ttf'), 'Noto Sans')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'NotoSansSymbols2-Regular.ttf'), 'Noto Sans Symbols 2')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'NotoSansMath-Regular.ttf'), 'Noto Sans Math')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'Noto-COLRv1.ttf'), 'Noto Color Emoji')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'Poppins_400Regular.ttf'), 'Poppins')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'Poppins_600SemiBold.ttf'), 'Poppins')
  GlobalFonts.registerFromPath(path.join(DIR_FUENTES, 'Poppins_700Bold.ttf'), 'Poppins')
  fuentesListas = true
}

let logoCache = null
async function cargarLogo() {
  if (logoCache !== null) return logoCache
  try {
    const img = await loadImage(await readFile(RUTA_LOGO))
    logoCache = { img, ancho: img.width, alto: img.height }
  } catch (e) {
    console.error('[estados-cuenta] no se pudo cargar el logo:', e.message)
    logoCache = false
  }
  return logoCache || null
}

// Cualquier dibujo de los nuestros, renderizado en el servidor. El ticket usa
// este mismo camino: mismas fuentes, mismo logo, misma calidad.
export async function pngDeDibujo(dibujo, datos, opciones = {}) {
  registrarFuentes()
  const canvas = await dibujo(datos, {
    crearCanvas: (w, h) => createCanvas(w, h),
    cargarLogo,
    fuente: opciones.fuente || FUENTE_SERVIDOR,
    Path2D,
    marco: opciones.marco,
    paleta: opciones.paleta,
  })
  return canvas.encode('png')
}

// Devuelve el PNG del estado de cuenta de un cliente, como Buffer.
export async function pngEstadoCuenta(datos, opciones = {}) {
  return pngDeDibujo(dibujarEstadoCuenta, datos, opciones)
}
