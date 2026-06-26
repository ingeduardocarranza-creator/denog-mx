'use client'
import { useRef, useEffect } from 'react'

export default function DogWalker({
  src,
  height    = '120px',
  bg        = 'dark',
  crop      = '0,0,1,1',
  loopStart = 0,
  loopEnd   = 0,
  shadow    = 'drop-shadow(0 6px 16px rgba(130,87,245,.5))',
}) {
  const canvasRef = useRef(null)
  const videoRef  = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas || !video) return

    const KW = 360, KH = 360
    const ctx  = canvas.getContext('2d', { willReadFrequently: true })

    // Off-screen work canvas (key runs here, then blit to display canvas)
    const work  = document.createElement('canvas')
    work.width  = KW
    work.height = KH
    const wctx  = work.getContext('2d', { willReadFrequently: true })

    const [cx0, cy0, cx1, cy1] = crop.split(',').map(parseFloat)
    const ls = parseFloat(loopStart) || 0
    const le = parseFloat(loopEnd)   || 0
    const mode = bg === 'dark' ? 'dark' : bg === 'green' ? 'green' : 'white'

    // Background detection per mode
    const isBg = (r, g, b) => {
      if (mode === 'dark')  return Math.max(r, g, b) < 64
      if (mode === 'green') return g > 90 && g > r + 28 && g > b + 28
      return r > 236 && g > 236 && b > 236
    }
    const stillGreen = (r, g, b) => g > 70 && g > r + 14 && g > b + 14

    const key = () => {
      const img = wctx.getImageData(0, 0, KW, KH)
      const d   = img.data
      const n   = KW * KH
      const seen  = new Uint8Array(n)
      const stack = []
      for (let x = 0; x < KW; x++) { stack.push(x); stack.push((KH - 1) * KW + x) }
      for (let y = 0; y < KH; y++) { stack.push(y * KW); stack.push(y * KW + KW - 1) }

      // Flood-fill from all border pixels
      while (stack.length) {
        const p = stack.pop()
        if (seen[p]) continue
        seen[p] = 1
        const i = p << 2
        if (!isBg(d[i], d[i + 1], d[i + 2])) continue
        d[i + 3] = 0
        const x = p % KW, y = (p / KW) | 0
        if (x > 0)       stack.push(p - 1)
        if (x < KW - 1)  stack.push(p + 1)
        if (y > 0)       stack.push(p - KW)
        if (y < KH - 1)  stack.push(p + KW)
      }

      let opaque = 0
      for (let p = 0; p < n; p++) {
        const i = p << 2
        if (d[i + 3] === 0) continue
        opaque++
        const r = d[i], g = d[i + 1], b = d[i + 2]
        const x = p % KW, y = (p / KW) | 0
        let edge = false
        if (x > 0       && d[((p - 1)  << 2) + 3] === 0) edge = true
        else if (x < KW - 1 && d[((p + 1)  << 2) + 3] === 0) edge = true
        else if (y > 0       && d[((p - KW) << 2) + 3] === 0) edge = true
        else if (y < KH - 1  && d[((p + KW) << 2) + 3] === 0) edge = true

        if (mode === 'green') {
          // Green-spill suppression
          if (g > r && g > b) {
            const avg = (r + b) / 2
            if (g - avg > 14) d[i + 1] = Math.round(avg + 14)
          }
          if (edge && stillGreen(d[i], d[i + 1], d[i + 2])) {
            d[i + 3] = Math.round(d[i + 3] * 0.35)
          }
        } else {
          const LO  = mode === 'dark' ? 60  : 206
          const HI  = mode === 'dark' ? 150 : 255
          const lum = mode === 'dark' ? Math.max(r, g, b) : Math.min(r, g, b)
          const fringe = mode === 'dark' ? lum < HI : lum > LO
          if (edge && fringe) {
            const t = Math.min(1, Math.max(0, (lum - LO) / (HI - LO)))
            d[i + 3] = Math.round(d[i + 3] * t)
          }
        }
      }
      wctx.putImageData(img, 0, 0)
      return opaque
    }

    let peakOpaque   = 1
    let hasGoodFrame = false

    const frame = () => {
      if (video.readyState >= 2 && video.videoWidth) {
        const vw = video.videoWidth, vh = video.videoHeight
        const sx = cx0 * vw, sy = cy0 * vh
        const sw = (cx1 - cx0) * vw, sh = (cy1 - cy0) * vh
        const sAR = sw / sh, dAR = KW / KH
        let dw = KW, dh = KH, dx = 0, dy = 0
        if (sAR > dAR) { dh = KW / sAR; dy = (KH - dh) / 2 }
        else           { dw = KH * sAR; dx = (KW - dw) / 2 }

        wctx.clearRect(0, 0, KW, KH)
        wctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)

        let opaque = 0
        try { opaque = key() } catch (_) { opaque = peakOpaque }
        if (opaque > peakOpaque) peakOpaque = opaque

        const enough = opaque > peakOpaque * 0.45
        if (enough || !hasGoodFrame) {
          ctx.clearRect(0, 0, KW, KH)
          ctx.drawImage(work, 0, 0)
          if (enough) hasGoodFrame = true
        }
      }
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(frame)
      else requestAnimationFrame(frame)
    }

    const tryPlay = () => video.play().catch(() => {})

    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('canplay', tryPlay)
    video.addEventListener('loadedmetadata', () => {
      if (ls > 0) { try { video.currentTime = ls } catch (_) {} }
    })
    video.addEventListener('timeupdate', () => {
      const end = le > 0 ? le : video.duration
      if (end && video.currentTime >= end - 0.04) {
        try { video.currentTime = ls } catch (_) {}
      }
    })
    tryPlay()

    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(frame)
    else requestAnimationFrame(frame)

    return () => {
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('canplay', tryPlay)
    }
  }, [src, bg, crop, loopStart, loopEnd])

  return (
    <>
      <canvas
        ref={canvasRef}
        width={360}
        height={360}
        style={{ height, width: 'auto', display: 'block', filter: shadow }}
      />
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        autoPlay
        playsInline
        crossOrigin="anonymous"
        style={{ display: 'none' }}
      />
    </>
  )
}
