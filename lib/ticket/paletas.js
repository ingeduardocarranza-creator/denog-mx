// Paletas del ticket, armadas con los colores de marca de Denog.
//
// Los nueve colores de la marca son pasteles, y un pastel no aguanta texto
// blanco encima: la franja del total y la del folio quedarían ilegibles, que es
// justo donde va el dinero. Los dos colores oscuros de la paleta —el azul
// marino y el vino— son los que cargan esas franjas; los demás son fondos y
// acentos.
//
// La única licencia: `tinta`, el color del texto de cuerpo. La paleta no tiene
// un neutro oscuro, así que se usa el propio azul marino de la marca oscurecido.
// Un gris o un negro se verían prestados al lado de estos colores.
//
// OJO: hex a propósito. En canvas var(--token) NO existe.

const MARCA = {
  rosaPastel: '#fcc3c3',
  azulCielo:  '#bdecff',
  menta:      '#87d8bd',
  crema:      '#f9eae5',
  rosaFuerte: '#ef8faf',
  azulMarino: '#466d9b',
  azulMedio:  '#8aacdd',
  amarillo:   '#f4d36c',
  vino:       '#ad4d72',
}

// Derivados: el marino oscurecido para texto, y tintes muy claros de los
// pasteles para los fondos de renglón (un pastel a full detrás de una tabla
// entera cansa la vista y compite con los importes).
const TINTA   = '#263c55'
const TEXTO   = '#3f5a76'
const SUAVE   = '#6b829c'
const TENUE   = '#9db0c4'

export const PALETAS = {
  // ── CIELO: el azul del logo. La más cercana a la marca tal como está.
  cielo: {
    nombre: 'Cielo',
    fondo: '#f4fbff', sup: '#ffffff', sup2: '#f7fcff',
    linea: '#dcebf5', lineaSuave: '#eaf6fd',
    tinta: TINTA, texto: TEXTO, suave: SUAVE, tenue: TENUE,

    hdrFondo: MARCA.crema, hdrTitulo: TINTA, hdrSub: MARCA.azulMarino,
    hdrFilete: MARCA.azulMarino,

    folioFondo: MARCA.azulMarino, folioEtiqueta: MARCA.azulCielo,
    folioTexto: '#ffffff', folioTenue: '#b7cde3', folioFilete: MARCA.azulCielo,

    cliFondo: MARCA.azulMedio, cliTexto: '#ffffff',

    secFondo: '#eaf6fd', secBarra: MARCA.azulMarino, secTexto: TINTA,

    totalFondo: MARCA.azulMarino, totalFilete: '#33547a',
    totalTexto: '#ffffff', totalSub: MARCA.azulCielo,

    abonoFondo: '#e9f7f1', abonoTexto: '#2c7a5d',

    saldoFondo: '#fdeff1', saldoBarra: MARCA.rosaFuerte,
    saldoRotulo: SUAVE, saldoTenue: TENUE, saldoMonto: MARCA.vino,

    pieFondo: MARCA.crema, pieTitulo: TINTA, pieLinea: '#e3d3cc',
    pieTexto: TEXTO, pieWeb: MARCA.azulMarino,
    redes: { facebook: null, instagram: null, tiktok: TINTA },
  },

  // ── DULCE: el rosa al frente. Más de tienda, menos de sistema.
  dulce: {
    nombre: 'Dulce',
    fondo: '#fffafb', sup: '#ffffff', sup2: '#fff6f8',
    linea: '#f3dde3', lineaSuave: '#fdeef2',
    tinta: '#4a2437', texto: '#6d4152', suave: '#96707f', tenue: '#c2a3ad',

    hdrFondo: MARCA.crema, hdrTitulo: '#4a2437', hdrSub: MARCA.vino,
    hdrFilete: MARCA.vino,

    folioFondo: MARCA.vino, folioEtiqueta: MARCA.rosaPastel,
    folioTexto: '#ffffff', folioTenue: '#d9a8b9', folioFilete: MARCA.rosaFuerte,

    cliFondo: MARCA.rosaFuerte, cliTexto: '#ffffff',

    secFondo: '#fdeef2', secBarra: MARCA.rosaFuerte, secTexto: '#4a2437',

    totalFondo: MARCA.vino, totalFilete: '#8c3c5c',
    totalTexto: '#ffffff', totalSub: MARCA.rosaPastel,

    abonoFondo: '#e9f7f1', abonoTexto: '#2c7a5d',

    saldoFondo: '#fdf6e4', saldoBarra: MARCA.amarillo,
    saldoRotulo: '#96707f', saldoTenue: '#c2a3ad', saldoMonto: MARCA.vino,

    pieFondo: MARCA.crema, pieTitulo: '#4a2437', pieLinea: '#e3d3cc',
    pieTexto: '#6d4152', pieWeb: MARCA.vino,
    redes: { facebook: null, instagram: null, tiktok: '#4a2437' },
  },

  // ── MENTA: la más clara y aireada. El marino sostiene el dinero, la menta
  //    da el aire, y el saldo pendiente se avisa en amarillo.
  menta: {
    nombre: 'Menta',
    fondo: '#f7fdfb', sup: '#ffffff', sup2: '#f4fbf8',
    linea: '#dceee7', lineaSuave: '#eefaf5',
    tinta: TINTA, texto: TEXTO, suave: SUAVE, tenue: TENUE,

    hdrFondo: '#ffffff', hdrTitulo: TINTA, hdrSub: '#2c7a5d',
    hdrFilete: MARCA.menta,

    folioFondo: TINTA, folioEtiqueta: MARCA.menta,
    folioTexto: '#ffffff', folioTenue: '#8fa6bd', folioFilete: MARCA.menta,

    // Sobre la menta el texto va oscuro: en blanco no se lee.
    cliFondo: MARCA.menta, cliTexto: '#1d4a3a',

    secFondo: '#eefaf5', secBarra: MARCA.menta, secTexto: TINTA,

    totalFondo: MARCA.azulMarino, totalFilete: '#33547a',
    totalTexto: '#ffffff', totalSub: MARCA.menta,

    abonoFondo: '#e9f7f1', abonoTexto: '#2c7a5d',

    saldoFondo: '#fdf6e4', saldoBarra: MARCA.amarillo,
    saldoRotulo: SUAVE, saldoTenue: TENUE, saldoMonto: '#a8761a',

    pieFondo: '#ffffff', pieTitulo: TINTA, pieLinea: '#dceee7',
    pieTexto: TEXTO, pieWeb: '#2c7a5d',
    redes: { facebook: null, instagram: null, tiktok: TINTA },
  },
}

export const PALETA_POR_DEFECTO = 'cielo'
