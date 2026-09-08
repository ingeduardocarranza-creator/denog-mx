// Dibuja un código QR directo sobre el canvas, sin pasar por una imagen.
//
// Se usa la parte "core" del paquete qrcode (solo la matemática: qué
// cuadritos van prendidos), no sus ayudantes de canvas/SVG — así el mismo
// código sirve igual en el navegador (vista previa del panel) y en el
// servidor (@napi-rs/canvas, para el envío por WhatsApp): los dos exponen
// fillRect, que es todo lo que hace falta.
import { create as crearMatrizQR } from 'qrcode/lib/core/qrcode.js'

export function dibujarQR(ctx, texto, x, y, tamano, colorOscuro = '#000000', colorClaro = '#ffffff') {
  const qr = crearMatrizQR(texto, { errorCorrectionLevel: 'M' })
  const { size, data } = qr.modules
  const escala = tamano / size

  ctx.fillStyle = colorClaro
  ctx.fillRect(x, y, tamano, tamano)
  ctx.fillStyle = colorOscuro
  for (let fila = 0; fila < size; fila++) {
    for (let col = 0; col < size; col++) {
      if (data[fila * size + col]) {
        // Math.ceil para que no queden líneas blancas entre cuadritos por
        // redondeo — mejor un pelín de traslape que un hueco que confunda
        // al lector de la cámara.
        ctx.fillRect(x + col * escala, y + fila * escala, Math.ceil(escala) + 0.5, Math.ceil(escala) + 0.5)
      }
    }
  }
}
