// Dibujo del ticket de una transacción.
//
// Mismo motor, misma paleta y mismo pie que el estado de cuenta: los dos
// papeles salen de la misma casa y tienen que verse como tal. Lo que cambia es
// qué cuentan — el estado de cuenta es la historia de una entrega, el ticket es
// una sola visita.
//
// OJO, igual que en el estado de cuenta: los colores van en hex a propósito. En
// canvas var(--token) NO existe; el navegador ignora la asignación y se queda
// con el color anterior.

import {
  C, MARCOS, REDES, degradadoIG, fmt, FUENTE_NAVEGADOR,
} from '@/lib/estadosCuenta/dibujar'

const fmtFechaHora = (f) => {
  if (!f) return ''
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const d = new Date(String(f).replace(' ', 'T'))
  if (isNaN(d)) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`
}

export async function dibujarTicket(datos, entorno) {
  const {
    crearCanvas, cargarLogo, fuente = FUENTE_NAVEGADOR, Path2D: P2D, marco = 'claro',
  } = entorno
  const FF = fuente
  const M = MARCOS[marco] || MARCOS.claro

  const {
    folio, canal, fecha, cliente, atendio,
    recogio = [], tienda = [], metodos = [],
    envio = 0, total = 0, efectivoRecibido, cambio, saldoPendiente, nota,
  } = datos

  const S   = 2
  const W   = 600 * S
  const PAD = 48 * S

  const hdrH   = 148 * S
  const folioH = 92  * S
  const cliH   = 62  * S
  const gap    = 14  * S
  const secH   = 34  * S   // rótulo de sección
  const tbHdrH = 28  * S
  const rowH   = 30  * S
  const lineaH = 27  * S   // renglón de resumen
  const totalH = 104 * S
  const saldoH = 74  * S
  const notaH  = 46  * S
  const footH  = 194 * S

  // Lo que valía todo lo que se llevó, contra lo que pagó hoy. La diferencia
  // es lo que ya tenía abonado. Sin este renglón, el cliente suma los productos
  // del ticket, ve un total menor abajo y no entiende — y en el caso extremo
  // (el anticipo cubría todo) el ticket decía "PAGASTE $0" sin explicar nada.
  const valorMercancia = Math.round((
    recogio.reduce((s, r) => s + Number(r.precio || 0), 0) +
    tienda.reduce((s, t) => s + Number(t.importe || 0), 0) +
    Number(envio || 0)
  ) * 100) / 100
  const abonado = Math.round((valorMercancia - Number(total || 0)) * 100) / 100

  const hayRecogio = recogio.length > 0
  const hayTienda  = tienda.length > 0
  const hayEnvio   = envio > 0.005
  const hayAbonado = abonado > 0.5
  const sinPagoHoy = Number(total || 0) <= 0.5
  const hayCambio  = efectivoRecibido != null && efectivoRecibido > 0
  const haySaldo   = saldoPendiente != null && saldoPendiente > 0.5

  // ---- Alto dinámico -------------------------------------------------
  let height = hdrH + folioH + cliH + gap
  if (hayRecogio) height += secH + tbHdrH + recogio.length * rowH + gap
  if (hayTienda)  height += secH + tbHdrH + tienda.length  * rowH + gap
  if (hayEnvio)   height += lineaH
  if (hayAbonado) height += lineaH
  height += totalH
  height += metodos.length * lineaH
  if (hayCambio)  height += lineaH * 2
  if (haySaldo)   height += saldoH
  if (nota)       height += notaH
  height += footH

  const canvas = crearCanvas(W, height)
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.fondo
  ctx.fillRect(0, 0, W, height)

  // Ayudas de dibujo (mismas del estado de cuenta)
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
  const pintarMarco = (arriba, alto) => {
    if (M.fondo.length === 1) return M.fondo[0]
    const g = ctx.createLinearGradient(0, arriba, W, arriba + alto)
    M.fondo.forEach((c, i) => g.addColorStop(i / (M.fondo.length - 1), c))
    return g
  }

  // Una sección con su tabla: rótulo, encabezado y renglones.
  const seccion = (titulo, filas, y0) => {
    let y = y0
    ctx.fillStyle = C.lineaSuave
    ctx.fillRect(0, y, W, secH)
    ctx.fillStyle = C.marca
    ctx.fillRect(0, y, 5 * S, secH)
    izq(titulo, PAD, y + secH / 2, 12, C.tinta, true)
    const piezas = filas.reduce((s, f) => s + (f.cantidad || 1), 0)
    der(`${piezas} artículo${piezas !== 1 ? 's' : ''}`, W - PAD, y + secH / 2, 10, C.suave)
    y += secH

    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, tbHdrH)
    izq('PRODUCTO', PAD, y + tbHdrH / 2, 9, C.tenue, true)
    der('IMPORTE', W - PAD, y + tbHdrH / 2, 9, C.tenue, true)
    y += tbHdrH

    filas.forEach((f, i) => {
      ctx.fillStyle = i % 2 === 0 ? C.sup2 : C.blanco
      ctx.fillRect(0, y, W, rowH)
      const etiqueta = (f.cantidad > 1 ? `${f.cantidad}× ` : '') + (f.descripcion || f.nombre || '')
      izq(recortar(etiqueta, 12, W - PAD * 2 - 110 * S), PAD, y + rowH / 2, 12, C.texto)
      der(fmt(f.precio ?? f.importe), W - PAD, y + rowH / 2, 12, C.tinta, true)
      y += rowH
    })
    return y
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
  izq('TICKET DE COMPRA', textX, y + hdrH / 2 + 16 * S, 12, M.sub, true)

  ctx.fillStyle = M.filete
  ctx.fillRect(0, y + hdrH - 5 * S, W, 5 * S)
  y += hdrH

  // ================= FOLIO ==========================================
  // Es lo primero que se busca cuando algo se aclara, así que va grande y
  // arriba, no escondido en letra chica al pie.
  ctx.fillStyle = C.tinta
  ctx.fillRect(0, y, W, folioH)
  ctx.fillStyle = C.marca
  ctx.fillRect(0, y, W, 4 * S)

  izq('FOLIO', PAD, y + folioH / 2 - 17 * S, 9.5, C.marcaClaro, true)
  izq(folio || '—', PAD, y + folioH / 2 + 12 * S, 31, C.blanco, true)

  der(canal === 'domicilio' ? 'ENTREGA A DOMICILIO' : 'MOSTRADOR', W - PAD, y + folioH / 2 - 17 * S, 9.5, C.marcaClaro, true)
  der(fmtFechaHora(fecha), W - PAD, y + folioH / 2 + 6 * S, 13, C.blanco, true)
  if (atendio) der(`Te atendió ${atendio}`, W - PAD, y + folioH / 2 + 27 * S, 10.5, C.tenue)
  y += folioH

  // ================= CLIENTE ========================================
  ctx.fillStyle = C.marca
  ctx.fillRect(0, y, W, cliH)
  izq(recortar((cliente?.nombre || '').toUpperCase(), 16, W - PAD * 2), PAD, y + cliH / 2, 16, C.blanco, true)
  y += cliH + gap

  // ================= LO QUE SE LLEVÓ ================================
  if (hayRecogio) y = seccion('RECOGISTE DE TU PEDIDO', recogio, y) + gap
  if (hayTienda)  y = seccion('TE LLEVASTE DE LA TIENDA', tienda, y) + gap

  // El envío es un servicio, no mercancía: va como renglón propio para que se
  // vea por qué el total es mayor que la suma de los productos.
  if (hayEnvio) {
    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, lineaH)
    izq('Envío a domicilio', PAD, y + lineaH / 2, 12, C.suave)
    der(fmt(envio), W - PAD, y + lineaH / 2, 12, C.texto, true)
    y += lineaH
  }

  if (hayAbonado) {
    ctx.fillStyle = C.verdeFondo
    ctx.fillRect(0, y, W, lineaH)
    izq('Ya tenías abonado', PAD, y + lineaH / 2, 12, C.verdeOsc, true)
    der(`− ${fmt(abonado)}`, W - PAD, y + lineaH / 2, 12, C.verdeOsc, true)
    y += lineaH
  }

  // ================= TOTAL ==========================================
  ctx.fillStyle = M.totalFondo
  ctx.fillRect(0, y, W, totalH)
  ctx.fillStyle = M.totalFilete
  ctx.fillRect(0, y, W, 4 * S)

  izq(sinPagoHoy ? 'NO PAGASTE NADA HOY' : 'PAGASTE', PAD, y + totalH / 2 - 15 * S, 11, C.marcaTexto, true)
  izq(sinPagoHoy ? 'Ya lo tenías cubierto con tus abonos' : '¡Gracias por tu compra!',
      PAD, y + totalH / 2 + 14 * S, 12, C.marcaTexto)
  ctx.fillStyle = C.blanco
  ctx.font = `bold ${36 * S}px ${FF}`
  ctx.textAlign = 'right'
  ctx.fillText(fmt(total), W - PAD, y + totalH / 2)
  ctx.textAlign = 'left'
  y += totalH

  // ================= CÓMO PAGÓ ======================================
  metodos.forEach((m, i) => {
    ctx.fillStyle = i % 2 === 0 ? C.sup2 : C.blanco
    ctx.fillRect(0, y, W, lineaH)
    izq(m.metodo, PAD, y + lineaH / 2, 12, C.suave)
    der(fmt(m.monto), W - PAD, y + lineaH / 2, 12, C.texto, true)
    y += lineaH
  })

  if (hayCambio) {
    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, lineaH * 2)
    ctx.fillStyle = C.linea
    ctx.fillRect(PAD, y, W - PAD * 2, 1 * S)
    izq('Recibimos', PAD, y + lineaH / 2, 12, C.suave)
    der(fmt(efectivoRecibido), W - PAD, y + lineaH / 2, 12, C.texto, true)
    izq('Tu cambio', PAD, y + lineaH + lineaH / 2, 12, C.suave, true)
    der(fmt(cambio || 0), W - PAD, y + lineaH + lineaH / 2, 13, C.marca, true)
    y += lineaH * 2
  }

  // ================= SALDO QUE QUEDA ================================
  // Si queda debiendo, el ticket lo dice. Un ticket que solo enseña lo bueno
  // es el que provoca el reclamo de la quincena siguiente.
  if (haySaldo) {
    ctx.fillStyle = C.fondo2
    ctx.fillRect(0, y, W, saldoH)
    ctx.fillStyle = C.marca
    ctx.fillRect(0, y, 5 * S, saldoH)
    izq('TE QUEDA PENDIENTE', PAD, y + saldoH / 2 - 12 * S, 10, C.suave, true)
    izq('De tu pedido de esta entrega', PAD, y + saldoH / 2 + 11 * S, 11.5, C.tenue)
    der(fmt(saldoPendiente), W - PAD, y + saldoH / 2, 24, C.marcaOsc, true)
    y += saldoH
  }

  if (nota) {
    ctx.fillStyle = C.blanco
    ctx.fillRect(0, y, W, notaH)
    izq(recortar(nota, 11.5, W - PAD * 2), PAD, y + notaH / 2, 11.5, C.suave)
    y += notaH
  }

  // ================= PIE ============================================
  ctx.fillStyle = pintarMarco(y, footH)
  ctx.fillRect(0, y, W, footH)

  ctx.textAlign = 'center'
  ctx.fillStyle = M.titulo
  ctx.font = `600 ${17 * S}px ${FF}`
  ctx.fillText('¡Gracias por tu Happy Shopping! 📦', W / 2, y + 38 * S)

  ctx.fillStyle = M.linea
  ctx.fillRect(W / 2 - 75 * S, y + 68 * S, 150 * S, 1 * S)

  if (P2D) {
    const ico = 22 * S
    const sep = 30 * S
    const hueco = 9 * S
    const yRedes = y + 108 * S

    ctx.font = `${15 * S}px ${FF}`
    const anchos = REDES.map(r => ico + hueco + ctx.measureText(r.texto).width)
    const anchoTotal = anchos.reduce((a, b) => a + b, 0) + sep * (REDES.length - 1)
    let x = (W - anchoTotal) / 2

    REDES.forEach((r, i) => {
      ctx.save()
      ctx.translate(x, yRedes - ico / 2)
      ctx.scale(ico / 24, ico / 24)
      // El degradado se crea DESPUÉS del translate/scale, igual que en el
      // estado de cuenta: si se crea antes, el icono sale de un solo color.
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
