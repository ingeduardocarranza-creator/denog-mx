// Dibujo del estado de cuenta.
//
// Un solo dibujo para los dos mundos: el navegador (pantalla /admin/estados-cuenta)
// y el servidor (envio por WhatsApp). Quien llama le pasa el "entorno": como crear
// un canvas, como cargar el logo y que familia tipografica usar. Asi la imagen que
// ves en el panel y la que recibe el cliente no pueden diferir nunca.
//
// OJO: los colores van en hex a proposito. En canvas, var(--token) NO existe: el
// navegador ignora la asignacion y se queda con el color anterior. Un reemplazo
// masivo de tokens (commit 8236f1d) dejo el total en negro sobre negro.
// No metas var(--...) aqui.

export const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

export const fmtFecha = (f) => {
  if (!f) return ''
  const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const d = new Date(f + 'T12:00:00')
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

const esLiquidacion = (p) => !!p.tipo?.toLowerCase().includes('liquidaci')

// Saldo de un grupo (una entrega). Lo usan el canvas y la pantalla: una sola
// formula, para que el numero grande de la pantalla y el de la imagen coincidan.
export function netoDeGrupo(g) {
  const totalEntregados = g.totalEntregadosOriginal ?? g.pedidos.filter(p => p.estado === 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
  const totalPendientes = g.pedidos.filter(p => p.estado !== 'Entregado').reduce((s, p) => s + (p.precio_venta || 0), 0)
  const pagadoGrupo = g.pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const sobrante = Math.max(0, pagadoGrupo - totalEntregados)
  return { totalEntregados, totalPendientes, neto: Math.max(0, totalPendientes - sobrante) }
}

export function saldoDeGrupos(grupos) {
  return (grupos || []).reduce((s, g) => s + netoDeGrupo(g).neto, 0)
}

export const FUENTE_NAVEGADOR = '-apple-system,system-ui,sans-serif'

// Paleta. Los mismos colores del sitio: la portada (app/page.js) y el tema
// claro del panel (--marca, --tinta, --fondo en globals.css). Van en hex
// resueltos a proposito: en canvas var(--token) no existe.
const C = {
  tinta:      '#2a2118',  // --tinta
  pie:        '#3a2f24',
  texto:      '#4a3f34',
  suave:      '#7a7166',  // --gris-t
  tenue:      '#a09589',
  linea:      '#e8e0d5',
  lineaSuave: '#f2ece2',
  fondo:      '#fdfaf5',  // crema de la portada
  fondo2:     '#f5ecdf',  // --shell-fondo
  blanco:     '#ffffff',  // --sup
  sup2:       '#fffaf3',  // --sup-2
  marca:      '#c1553a',  // --marca (terracota)
  marcaOsc:   '#a3432b',  // --marca-t
  marcaClaro: '#e59a7d',  // terracota aclarado, para leerse sobre tinta
  beigeLinea: '#e0d5c7',  // filete sobre el beige del encabezado y el pie
  marcaTexto: '#f2cdbf',  // texto secundario sobre terracota
  verde:      '#0f8a63',  // --verde
  verdeOsc:   '#0b6d4e',
  verdeFondo: '#e8f4ef',
  verdeTexto: '#cfe9df',
}

// El "marco" del documento: encabezado, pie y franja del total. Son la misma
// decision de color, asi que viven juntos — si el marco se aclara, los iconos
// de redes y el filete del total tienen que moverse con el (sobre terracota el
// cian de TikTok se ve; sobre blanco desaparece).
export const MARCOS = {
  // Encabezado en el terracota profundo y franja del cliente en el terracota
  // de marca: si los dos van del mismo tono se ven como una sola mancha.
  terracota: {
    fondo: ['#a3432b'], filete: '#8c3722',
    titulo: '#ffffff', sub: '#f7cdbf', texto: '#f7cdbf', linea: '#c07a66',
    facebook: '#ffffff', instagram: '#ffffff', tiktok: '#ffffff', web: '#ffffff',
    totalFondo: '#2a2118', totalFilete: '#c1553a',
  },
  // El elegido: crema tibio (--sup-2) arriba y abajo, con el color de marca
  // concentrado en la franja del cliente y en el TOTAL.
  claro: {
    fondo: ['#fffaf3'], filete: '#c1553a',
    titulo: '#2a2118', sub: '#c1553a', texto: '#4a3f34', linea: '#e8e0d5',
    facebook: '#1877F2', instagram: null, tiktok: '#2a2118', web: '#c1553a',
    totalFondo: '#c1553a', totalFilete: '#a3432b',
  },
  degradado: {
    fondo: ['#c1553a', '#8c3722'], filete: '#7a2f1c',
    titulo: '#ffffff', sub: '#fbe3d9', texto: '#fbe3d9', linea: '#c9705c',
    facebook: '#ffffff', instagram: '#ffffff', tiktok: '#ffffff', web: '#ffffff',
    totalFondo: '#2a2118', totalFilete: '#c1553a',
  },
}

// El degradado de Instagram de la portada, en el espacio local del icono
// (24x24), de abajo-izquierda a arriba-derecha.
function degradadoIG(ctx) {
  const g = ctx.createLinearGradient(0, 24, 24, 0)
  g.addColorStop(0,    '#feda75')
  g.addColorStop(0.25, '#fa7e1e')
  g.addColorStop(0.55, '#d62976')
  g.addColorStop(0.80, '#962fbf')
  g.addColorStop(1,    '#4f5bd5')
  return g
}

// Redes de la marca. Los trazos son los mismos SVG de la portada, en un
// viewBox de 24x24: se escalan al dibujarlos.
const REDES = [
  {
    id: 'facebook', color: '#1877F2', texto: 'Denog mx',
    trazo: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
  {
    id: 'instagram', color: '#d62976', texto: 'denog.mx',
    trazo: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  },
  {
    id: 'tiktok', color: '#2a2118', texto: '@denog.mx',
    trazo: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
]

export async function dibujarEstadoCuenta({ cliente, grupos }, entorno) {
  const { crearCanvas, cargarLogo, fuente = FUENTE_NAVEGADOR, Path2D: P2D, marco = 'claro' } = entorno
  const FF = fuente
  const M = MARCOS[marco] || MARCOS.terracota

  const S   = 2
  const W   = 600 * S
  const PAD = 48 * S

  const hdrH    = 148 * S
  const cliH    = 80  * S
  const gap     = 14  * S
  const entLblH = 38  * S
  const tbHdrH  = 30  * S
  const rowH    = 30  * S
  const dateRowH= 15  * S
  const resTop  = 10  * S   // aire arriba del resumen
  const lineaH  = 27  * S   // renglon del resumen (mercancia, pagos)
  const detH    = 21  * S   // renglon de detalle de un pago
  const saldoH  = 44  * S   // renglon de saldo de la entrega
  const totalH  = 112 * S
  const footH   = 194 * S

  const totalArticulos = grupos.reduce(
    (s, g) => s + g.pedidos.reduce((ss, p) => ss + (p.cantidad || 1), 0), 0
  )

  // ---- Alto dinamico -----------------------------------------------
  let height = hdrH + cliH + gap
  for (const g of grupos) {
    height += entLblH + tbHdrH
    height += g.pedidos.reduce((s, p) => s + rowH + (p.fecha_compra ? dateRowH : 0), 0)
    const ocultar = g.totalEntregadosOriginal !== undefined
    const ant = ocultar ? [] : g.pagos.filter(p => !esLiquidacion(p))
    const liq = ocultar ? [] : g.pagos.filter(p =>  esLiquidacion(p))
    height += resTop + lineaH                        // mercancia
    if (ant.length) height += lineaH + ant.length * detH
    if (liq.length) height += lineaH + liq.length * detH
    if (ocultar) {
      const merc = g.pedidos.reduce((s2, p) => s2 + (p.precio_venta || 0), 0)
      if (merc - netoDeGrupo(g).neto > 0) height += lineaH
    }
    height += saldoH + gap
  }
  height += totalH + footH

  const canvas = crearCanvas(W, height)
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.fondo
  ctx.fillRect(0, 0, W, height)

  // Ayudas de dibujo
  const hairline = (yy, color = C.linea) => { ctx.fillStyle = color; ctx.fillRect(PAD, yy, W - PAD * 2, 1 * S) }
  const izq = (txt, x, yy, size, color, bold = false) => {
    ctx.fillStyle = color; ctx.font = `${bold ? 'bold ' : ''}${size * S}px ${FF}`
    ctx.textAlign = 'left'; ctx.fillText(txt, x, yy)
  }
  const der = (txt, x, yy, size, color, bold = false) => {
    ctx.fillStyle = color; ctx.font = `${bold ? 'bold ' : ''}${size * S}px ${FF}`
    ctx.textAlign = 'right'; ctx.fillText(txt, x, yy); ctx.textAlign = 'left'
  }
  const recortar = (txt, size, maxW) => {
    ctx.font = `${size * S}px ${FF}`
    let t = txt || ''
    if (ctx.measureText(t).width <= maxW) return t
    while (t.length > 4 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  // Un color plano o un degradado vertical, segun el marco elegido.
  const pintarMarco = (arriba, alto) => {
    if (M.fondo.length === 1) return M.fondo[0]
    const g = ctx.createLinearGradient(0, arriba, W, arriba + alto)
    M.fondo.forEach((c, i) => g.addColorStop(i / (M.fondo.length - 1), c))
    return g
  }

  let y = 0

  // ================= ENCABEZADO =====================================
  ctx.fillStyle = pintarMarco(0, hdrH)
  ctx.fillRect(0, y, W, hdrH)

  const logo = await cargarLogo()
  const lh = 96 * S
  const lw = logo && logo.alto > 0 ? lh * logo.ancho / logo.alto : lh
  if (logo) ctx.drawImage(logo.img, PAD, y + (hdrH - lh) / 2, lw, lh)

  const textX = PAD + lw + 22 * S
  ctx.fillStyle = M.titulo
  ctx.font = `bold ${25 * S}px ${FF}`
  ctx.textAlign = 'left'
  ctx.fillText('Denog USA Compras', textX, y + hdrH / 2 - 14 * S)
  izq('ESTADO DE CUENTA', textX, y + hdrH / 2 + 16 * S, 12, M.sub, true)

  ctx.fillStyle = M.filete
  ctx.fillRect(0, y + hdrH - 5 * S, W, 5 * S)
  y += hdrH

  // ================= CLIENTE ========================================
  ctx.fillStyle = C.marca
  ctx.fillRect(0, y, W, cliH)

  // Los grupos vienen ordenados de la entrega mas vieja a la mas reciente: la
  // fecha que le importa al cliente es la ultima, la que esta por recibir.
  const fechaCli = [...grupos].reverse().find(g => g.entrega)?.entrega?.fecha_entrega
  const anchoNombre = W - PAD * 2 - (fechaCli ? 150 * S : 0)
  izq(recortar((cliente.nombre || '').toUpperCase(), 17, anchoNombre), PAD, y + cliH / 2 - 12 * S, 17, C.blanco, true)
  const piezas = `${totalArticulos} artículo${totalArticulos !== 1 ? 's' : ''} · ${grupos.length} entrega${grupos.length !== 1 ? 's' : ''}`
  izq(piezas, PAD, y + cliH / 2 + 13 * S, 11, C.marcaTexto)
  if (fechaCli) {
    der('ENTREGA', W - PAD, y + cliH / 2 - 11 * S, 9, C.marcaTexto, true)
    der(fmtFecha(fechaCli), W - PAD, y + cliH / 2 + 10 * S, 13, C.blanco, true)
  }
  y += cliH + gap

  // ================= ENTREGAS =======================================
  const netos = []

  for (const g of grupos) {
    const { neto } = netoDeGrupo(g)
    // La "mercancia" que se muestra es la suma de los renglones que se ven en la
    // tabla: si mostraramos solo lo pendiente, una entrega ya liquidada saldria
    // con "Mercancia $0" debajo de sus propios productos.
    const mercanciaGrupo = g.pedidos.reduce((s, p) => s + (p.precio_venta || 0), 0)
    netos.push(neto)

    // -- Titulo de la entrega
    ctx.fillStyle = C.lineaSuave
    ctx.fillRect(0, y, W, entLblH)
    ctx.fillStyle = C.marca
    ctx.fillRect(0, y, 5 * S, entLblH)
    izq(
      g.entrega ? 'ENTREGA · ' + fmtFecha(g.entrega.fecha_entrega) : 'PEDIDOS PENDIENTES',
      PAD, y + entLblH / 2, 12, C.tinta, true
    )
    const artsG = g.pedidos.reduce((s, p) => s + (p.cantidad || 1), 0)
    der(`${artsG} artículo${artsG !== 1 ? 's' : ''}`, W - PAD, y + entLblH / 2, 10, C.suave)
    y += entLblH

    // -- Encabezado de tabla (ligero, sin barra negra)
    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, tbHdrH)
    izq('PRODUCTO', PAD, y + tbHdrH / 2, 9, C.tenue, true)
    ctx.textAlign = 'center'
    ctx.fillStyle = C.tenue; ctx.font = `bold ${9 * S}px ${FF}`
    ctx.fillText('CANT', W - 160 * S, y + tbHdrH / 2)
    ctx.textAlign = 'left'
    der('IMPORTE', W - PAD, y + tbHdrH / 2, 9, C.tenue, true)
    y += tbHdrH
    hairline(y - 1 * S)

    // -- Renglones
    g.pedidos.forEach((p, i) => {
      const altoFila = rowH + (p.fecha_compra ? dateRowH : 0)
      ctx.fillStyle = i % 2 === 1 ? C.sup2 : C.blanco
      ctx.fillRect(0, y, W, altoFila)

      const yTexto = p.fecha_compra ? y + altoFila * 0.36 : y + altoFila / 2
      const maxW = W - PAD * 2 - 200 * S
      izq(recortar(p.descripcion || '', 13, maxW), PAD, yTexto, 13, C.texto)

      ctx.textAlign = 'center'
      ctx.fillStyle = C.suave; ctx.font = `${12 * S}px ${FF}`
      ctx.fillText(String(p.cantidad || 1), W - 160 * S, yTexto)
      ctx.textAlign = 'left'

      der(fmt(p.precio_venta), W - PAD, yTexto, 13, C.tinta, true)

      if (p.fecha_compra) izq('Comprado ' + fmtFecha(p.fecha_compra), PAD, y + altoFila * 0.75, 10, C.tenue)

      y += altoFila
      hairline(y - 1 * S, C.lineaSuave)
    })

    // -- Resumen de la entrega
    const ocultarPagos = g.totalEntregadosOriginal !== undefined
    const pagsAnt = ocultarPagos ? [] : g.pagos.filter(p => !esLiquidacion(p))
    const pagsLiq = ocultarPagos ? [] : g.pagos.filter(p =>  esLiquidacion(p))

    let altoResumen = resTop + lineaH
    if (ocultarPagos && mercanciaGrupo - neto > 0) altoResumen += lineaH
    if (pagsAnt.length) altoResumen += lineaH + pagsAnt.length * detH
    if (pagsLiq.length) altoResumen += lineaH + pagsLiq.length * detH
    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, altoResumen)
    y += resTop

    izq('Mercancía', PAD, y + lineaH / 2, 12, C.suave)
    der(fmt(mercanciaGrupo), W - PAD, y + lineaH / 2, 13, C.texto, true)
    y += lineaH

    const detalle = (pagos, yy) => {
      pagos.forEach((pg, idx) => {
        const f = pg.creado_en ? fmtFecha(pg.creado_en.split('T')[0]) : ''
        izq(`${pg.metodo || 'Pago'}${f ? ' · ' + f : ''}`, PAD + 14 * S, yy + idx * detH + detH / 2, 10, C.tenue)
        der(fmt(pg.monto), W - PAD, yy + idx * detH + detH / 2, 10, C.tenue)
      })
    }

    if (pagsAnt.length) {
      const totalAnt = pagsAnt.reduce((s, p) => s + (p.monto || 0), 0)
      izq('Anticipos aplicados', PAD, y + lineaH / 2, 12, C.verde)
      der('−' + fmt(totalAnt), W - PAD, y + lineaH / 2, 13, C.verde, true)
      y += lineaH
      detalle(pagsAnt, y)
      y += pagsAnt.length * detH
    }

    if (ocultarPagos && mercanciaGrupo - neto > 0) {
      izq('Pagos aplicados', PAD, y + lineaH / 2, 12, C.verde)
      der('−' + fmt(mercanciaGrupo - neto), W - PAD, y + lineaH / 2, 13, C.verde, true)
      y += lineaH
    }

    if (pagsLiq.length) {
      const totalLiq = pagsLiq.reduce((s, p) => s + (p.monto || 0), 0)
      izq('Liquidación', PAD, y + lineaH / 2, 12, C.verde)
      der('−' + fmt(totalLiq), W - PAD, y + lineaH / 2, 13, C.verde, true)
      y += lineaH
      detalle(pagsLiq, y)
      y += pagsLiq.length * detH
    }

    // -- Saldo de la entrega
    ctx.fillStyle = neto > 0 ? C.fondo2 : C.verdeFondo
    ctx.fillRect(0, y, W, saldoH)
    ctx.fillStyle = neto > 0 ? C.marca : C.verde
    ctx.fillRect(0, y, 5 * S, saldoH)
    hairline(y, C.linea)
    if (neto > 0) {
      izq('Saldo de esta entrega', PAD, y + saldoH / 2, 12, C.texto, true)
      der(fmt(neto), W - PAD, y + saldoH / 2, 17, C.tinta, true)
    } else {
      izq('Entrega pagada', PAD, y + saldoH / 2, 12, C.verde, true)
      der('✓', W - PAD, y + saldoH / 2, 16, C.verde, true)
    }
    y += saldoH + gap
  }

  // ================= TOTAL ==========================================
  const totalFinal = netos.reduce((s, n) => s + n, 0)

  ctx.fillStyle = totalFinal > 0 ? M.totalFilete : C.verdeOsc
  ctx.fillRect(0, y, W, 5 * S)
  y += 5 * S

  const altoCaja = totalH - 5 * S
  ctx.fillStyle = totalFinal > 0 ? M.totalFondo : C.verde
  ctx.fillRect(0, y, W, altoCaja)

  if (totalFinal > 0) {
    izq('TOTAL A PAGAR', PAD, y + altoCaja / 2, 14, C.blanco, true)
    ctx.fillStyle = C.blanco
    ctx.font = `bold ${42 * S}px ${FF}`
    ctx.textAlign = 'right'
    ctx.fillText(fmt(totalFinal), W - PAD, y + altoCaja / 2 + 2 * S)
    ctx.textAlign = 'left'
  } else {
    izq('SIN SALDO PENDIENTE', PAD, y + altoCaja / 2 - 11 * S, 15, C.blanco, true)
    izq('Tu cuenta está al corriente. ¡Gracias!', PAD, y + altoCaja / 2 + 13 * S, 12, C.verdeTexto)
    der('✓', W - PAD, y + altoCaja / 2, 36, C.blanco, true)
  }
  y += altoCaja

  // ================= PIE ============================================
  ctx.fillStyle = pintarMarco(y, footH)
  ctx.fillRect(0, y, W, footH)

  ctx.textAlign = 'center'
  ctx.fillStyle = M.titulo
  ctx.font = `600 ${17 * S}px ${FF}`
  ctx.fillText('¡Gracias por tu Happy Shopping! 📦', W / 2, y + 38 * S)

  ctx.fillStyle = M.linea
  ctx.fillRect(W / 2 - 75 * S, y + 68 * S, 150 * S, 1 * S)

  // Fila de redes, centrada. Los iconos son los mismos trazos SVG de la
  // portada (app/page.js), dibujados con Path2D para que no sean imagenes.
  if (P2D) {
    const ico = 22 * S
    const sep = 30 * S
    const hueco = 9 * S
    const yRedes = y + 108 * S

    ctx.font = `${15 * S}px ${FF}`
    const anchos = REDES.map(r => ico + hueco + ctx.measureText(r.texto).width)
    const total = anchos.reduce((a, b) => a + b, 0) + sep * (REDES.length - 1)
    let x = (W - total) / 2

    REDES.forEach((r, i) => {
      ctx.save()
      ctx.translate(x, yRedes - ico / 2)
      ctx.scale(ico / 24, ico / 24)
      // El degradado se crea DESPUES del translate/scale: si se crea antes,
      // sus coordenadas quedan en el espacio de la pagina y el icono, que se
      // dibuja a media hoja, sale pintado con el ultimo color del degradado.
      ctx.fillStyle = M[r.id] || (r.id === 'instagram' ? degradadoIG(ctx) : r.color)
      ctx.fill(new P2D(r.trazo))
      ctx.restore()

      ctx.fillStyle = M.texto
      ctx.font = `${15 * S}px ${FF}`
      ctx.textAlign = 'left'
      ctx.fillText(r.texto, x + ico + hueco, yRedes)
      x += anchos[i] + sep
    })
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = M.web
  ctx.font = `bold ${20 * S}px ${FF}`
  ctx.fillText('denog.mx', W / 2, y + 160 * S)
  ctx.textAlign = 'left'

  return canvas
}
