// Escáner de códigos con la cámara del celular, afinado para velocidad.
//
// Por qué no se usa tal cual BrowserMultiFormatReader.decodeFromConstraints:
//  · De fábrica revisa la imagen solo cada 500 ms (delayBetweenScanAttempts).
//  · Analiza el cuadro completo de la cámara (más píxeles = más lento) y
//    además lee códigos que están fuera del visor (otros de la etiqueta).
//
// Aquí:
//  1. Si el navegador trae el lector nativo (BarcodeDetector — Chrome en
//     Android), se usa ese: es mucho más rápido y devuelve TODOS los códigos
//     del cuadro a la vez, así la pantalla puede escoger el que es la guía.
//  2. Si no (iPhone/Safari), ZXing pero revisando ~12 veces por segundo y
//     solo la franja del visor (recortada), con menos formatos.
//  3. Cámara a más resolución, enfoque continuo y linterna si el teléfono
//     la permite (bodega con poca luz).

// Formatos que salen en etiquetas de envío + UPC/EAN (para poder avisar
// "ese es el código del producto").
const FORMATOS_ZXING = ['CODE_128', 'CODE_39', 'PDF_417', 'DATA_MATRIX', 'QR_CODE', 'UPC_A', 'UPC_E', 'EAN_13', 'EAN_8']
const NATIVO_A_ZXING = {
  code_128: 'CODE_128', code_39: 'CODE_39', code_93: 'CODE_93', codabar: 'CODABAR', itf: 'ITF',
  ean_13: 'EAN_13', ean_8: 'EAN_8', upc_a: 'UPC_A', upc_e: 'UPC_E',
  pdf417: 'PDF_417', qr_code: 'QR_CODE', data_matrix: 'DATA_MATRIX', aztec: 'AZTEC',
}
const FORMATOS_NATIVOS = Object.keys(NATIVO_A_ZXING).filter(f => FORMATOS_ZXING.includes(NATIVO_A_ZXING[f]))

const ESPERA_MS = 80       // entre intentos (≈12 por segundo)
const ANCHO_MAX = 1280     // ancho máximo del recorte que se manda a ZXing

// Franja del video que corresponde al visor de la pantalla (en % del
// elemento <video> como se ve). Un poco más amplia que el dibujo del visor
// para que no haya que atinarle exacto.
const VISOR = { x: 0.04, y: 0.2, w: 0.92, h: 0.56 }

// Convierte la franja visible del <video> (con object-fit: cover) a
// coordenadas reales del cuadro de la cámara.
function recorteVisor(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const ew = video.clientWidth || vw, eh = video.clientHeight || vh
  const escala = Math.max(ew / vw, eh / vh)
  const offX = (vw * escala - ew) / 2, offY = (vh * escala - eh) / 2
  const sx = Math.max(0, (offX + VISOR.x * ew) / escala)
  const sy = Math.max(0, (offY + VISOR.y * eh) / escala)
  const sw = Math.min(vw - sx, (VISOR.w * ew) / escala)
  const sh = Math.min(vh - sy, (VISOR.h * eh) / escala)
  return { sx, sy, sw, sh }
}

export async function crearEscaner({ video, onCodigos }) {
  let activo = true
  let timer = null
  let stream = null
  let linternaPrendida = false

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }],
    },
  })
  const track = stream.getVideoTracks()[0]
  video.srcObject = stream
  video.setAttribute('playsinline', '')
  video.muted = true
  await video.play().catch(() => {})
  // Esperar a que la cámara mande el primer cuadro con tamaño real.
  for (let i = 0; i < 50 && !video.videoWidth; i++) await new Promise(r => setTimeout(r, 40))

  const capacidades = (() => { try { return track.getCapabilities?.() || {} } catch { return {} } })()
  try {
    if (capacidades.focusMode?.includes?.('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
  } catch {}

  // ── Motor de lectura ──
  let leer = null
  let motor = 'zxing'

  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const soportados = await window.BarcodeDetector.getSupportedFormats()
      const usar = FORMATOS_NATIVOS.filter(f => soportados.includes(f))
      if (usar.includes('code_128')) {
        const detector = new window.BarcodeDetector({ formats: usar })
        motor = 'nativo'
        leer = async () => {
          const r = await detector.detect(video)
          // Primero los que están dentro del visor, luego el resto.
          const { sx, sy, sw, sh } = recorteVisor(video)
          const dentro = (c) => {
            const b = c.boundingBox
            const cx = b.x + b.width / 2, cy = b.y + b.height / 2
            return cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh
          }
          return r
            .sort((a, b) => Number(dentro(b)) - Number(dentro(a)))
            .map(c => ({ texto: c.rawValue, formato: NATIVO_A_ZXING[c.format] || '' }))
        }
      }
    } catch {}
  }

  if (!leer) {
    const { BarcodeFormat, DecodeHintType, MultiFormatReader, BinaryBitmap, HybridBinarizer } = await import('@zxing/library')
    const { HTMLCanvasElementLuminanceSource } = await import('@zxing/browser')
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS_ZXING.map(f => BarcodeFormat[f]))
    const lector = new MultiFormatReader()
    lector.setHints(hints)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let vuelta = 0

    leer = async () => {
      vuelta++
      // Casi siempre solo la franja del visor; de vez en cuando el cuadro
      // completo (por si el código está chueco o es cuadrado y grande).
      const completo = vuelta % 5 === 0
      const { sx, sy, sw, sh } = completo
        ? { sx: 0, sy: 0, sw: video.videoWidth, sh: video.videoHeight }
        : recorteVisor(video)
      if (!sw || !sh) return []
      const escala = Math.min(1, ANCHO_MAX / sw)
      canvas.width = Math.round(sw * escala)
      canvas.height = Math.round(sh * escala)
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      try {
        const fuente = new HTMLCanvasElementLuminanceSource(canvas)
        const r = lector.decodeWithState(new BinaryBitmap(new HybridBinarizer(fuente)))
        return [{ texto: r.getText(), formato: BarcodeFormat[r.getBarcodeFormat()] || '' }]
      } catch {
        return [] // no hay código en este cuadro
      }
    }
  }

  const ciclo = async () => {
    if (!activo) return
    if (video.readyState >= 2 && video.videoWidth) {
      try {
        const codigos = await leer()
        if (activo && codigos.length) onCodigos(codigos)
      } catch {}
    }
    if (activo) timer = setTimeout(ciclo, ESPERA_MS)
  }
  ciclo()

  return {
    motor,
    tieneLinterna: !!capacidades.torch,
    async linterna(prender) {
      try {
        await track.applyConstraints({ advanced: [{ torch: !!prender }] })
        linternaPrendida = !!prender
      } catch {}
      return linternaPrendida
    },
    detener() {
      activo = false
      clearTimeout(timer)
      try { stream?.getTracks().forEach(t => t.stop()) } catch {}
      try { video.srcObject = null } catch {}
    },
  }
}
