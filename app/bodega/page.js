'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { analizarCodigo, detectarPaqueteria } from '../../lib/bodega/guias'

// Pantalla única del usuario de bodega (Nogales, AZ). Dos pestañas:
//
//  ESCANEAR — por paquete:
//    1) la cámara lee la guía
//    2) "Llegó bien"    → se guarda al instante y la cámara se reabre.
//       "Llegó dañado"  → 1 a 3 fotos del daño (+ nota opcional) → Guardar.
//    Las fotos se suben en cuanto se toman, así guardar es instantáneo.
//
//  HISTORIAL — paquetes registrados por día (hasta 90 días atrás), con las
//    fotos de evidencia de los que llegaron dañados.

const AZUL = '#466D9B'
const AZUL_OSCURO = '#2f4d70'
const CREMA = '#FCE5D6'
const VERDE = '#15803d'
const ROJO = '#b91c1c'
const GRIS = '#8a7f73'
const MAX_FOTOS = 3
const DIAS_HISTORIAL = 90

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })

// Fecha YYYY-MM-DD en hora de Nogales/Hermosillo (UTC-7 todo el año).
const fechaLocal = (diasAtras = 0) =>
  new Date(Date.now() - 7 * 3600 * 1000 - diasAtras * 86400000).toISOString().slice(0, 10)

const moverDia = (fecha, dias) => {
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const nombreDia = (fecha) => {
  if (fecha === fechaLocal()) return 'Hoy'
  if (fecha === fechaLocal(1)) return 'Ayer'
  return new Date(fecha + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Reduce la foto para que suba rápido con poca señal. Las fotos de daño van a
// 1600px/70%; la de la etiqueta a 2000px/85% para que se lean bien los números.
async function comprimir(file, maximo = 1600, calidad = 0.7) {
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const escala = Math.min(1, maximo / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', calidad))
    return blob || file
  } catch {
    return file
  }
}

const boton = (fondo, extra = {}) => ({
  width: '100%', padding: '16px', borderRadius: 14, border: 'none', fontSize: 18, fontWeight: 700,
  color: '#fff', background: fondo, cursor: 'pointer', ...extra,
})

function FilaPaquete({ p, onFoto }) {
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid #f0ebe4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, alignItems: 'center' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>…{p.numero_guia.slice(-8)}</span>{' '}
          <span style={{ color: GRIS }}>{p.paqueteria}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {p.danado && <span style={{ background: '#fdecec', color: ROJO, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 6px' }}>DAÑADO</span>}
          <span style={{ color: GRIS }}>{hora(p.recibido_en)}</span>
        </span>
      </div>
      {p.notas && <div style={{ fontSize: 13, color: '#a16207', marginTop: 4 }}>{p.notas}</div>}
      {p.fotos_url?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {p.fotos_url.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="Evidencia" onClick={() => onFoto(u)}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, background: '#eee' }} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Bodega() {
  const [pestana, setPestana] = useState('escanear') // escanear | historial
  const [paso, setPaso] = useState('escanear') // escanear | etiqueta | revisar | danado | listo
  const [guia, setGuia] = useState('')
  const [manual, setManual] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)
  const [fotos, setFotos] = useState([]) // { id, preview, path, estado: subiendo|ok|error }
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [hoy, setHoy] = useState([])
  const [errorCamara, setErrorCamara] = useState('')
  const [nombre, setNombre] = useState('')
  const [ultimoDanado, setUltimoDanado] = useState(false)
  // Aviso rojo sobre la cámara cuando lo escaneado no es la guía.
  const [rechazo, setRechazo] = useState('')
  // Guía escrita a mano que no tiene forma conocida: se pide confirmar.
  const [dudaManual, setDudaManual] = useState(null)
  const [guiaForzada, setGuiaForzada] = useState(false)
  // Foto de la etiqueta (cuando el código no se deja escanear).
  const [leyendoEtiqueta, setLeyendoEtiqueta] = useState(false)
  const [errorEtiqueta, setErrorEtiqueta] = useState('')
  const [deFoto, setDeFoto] = useState(null) // { paqueteria, seguro } si la guía salió de la foto

  const [diaHistorial, setDiaHistorial] = useState(fechaLocal())
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [fotoGrande, setFotoGrande] = useState(null)

  const videoRef = useRef(null)
  const lectorRef = useRef(null)
  const controlesRef = useRef(null)
  const leidoRef = useRef(false)
  const ultimoRechazoRef = useRef({ texto: '', hasta: 0 })
  const timerRechazoRef = useRef(null)
  const inputFotoRef = useRef(null)
  const inputEtiquetaRef = useRef(null)

  const avisar = (tipo, texto, ms = 5000) => {
    setAviso({ tipo, texto })
    if (ms) setTimeout(() => setAviso(null), ms)
  }

  const traerDia = async (fecha) => {
    const r = await fetch(`/api/bodega/paquetes?fecha=${fecha}`)
    const d = await r.json()
    return d.ok ? d.paquetes : null
  }

  const cargarHoy = useCallback(async () => {
    try {
      const lista = await traerDia(fechaLocal())
      if (lista) setHoy(lista)
    } catch {}
  }, [])

  const detenerCamara = () => {
    controlesRef.current?.stop()
    controlesRef.current = null
  }

  // La cámara leyó algo que no es la guía: aviso rojo + vibración larga, y
  // sigue escaneando. El mismo código no repite el aviso por 3 segundos.
  const rechazarLectura = (texto, motivo) => {
    const ahora = Date.now()
    const ult = ultimoRechazoRef.current
    if (!(ult.texto === texto && ahora < ult.hasta)) {
      if (navigator.vibrate) navigator.vibrate([250, 100, 250])
      setRechazo(motivo)
      clearTimeout(timerRechazoRef.current)
      timerRechazoRef.current = setTimeout(() => setRechazo(''), 3500)
    }
    ultimoRechazoRef.current = { texto, hasta: ahora + 3000 }
    leidoRef.current = false
  }

  const alLeerCodigo = (texto, formato) => {
    const r = analizarCodigo(texto, formato)
    if (!r.ok) return rechazarLectura(texto, r.motivo)
    setRechazo('')
    elegirGuia(r.guia, false)
  }

  const alEscribirGuia = () => {
    const r = analizarCodigo(manual)
    if (r.ok) return elegirGuia(r.guia, false)
    const g = manual.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (g.length < 8) return avisar('error', 'Ese número es muy corto para ser una guía.')
    setDudaManual(g)
  }

  // Sube la foto a Storage y regresa su path. Lo usan las fotos de daño y la
  // de la etiqueta.
  const subirAStorage = async (blob) => {
    const r = await fetch('/api/bodega/subir-foto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'image/jpeg' }),
    })
    const d = await r.json()
    if (!d.ok) throw new Error(d.mensaje)
    const fd = new FormData()
    fd.append('', blob, 'foto.jpg')
    const s = await fetch(d.signedUrl, { method: 'PUT', body: fd })
    if (!s.ok) throw new Error('subida')
    return d.path
  }

  const abrirFotoEtiqueta = () => {
    setErrorEtiqueta('')
    setRechazo('')
    detenerCamara() // soltar la cámara antes de abrir la del teléfono
    setPaso('etiqueta')
    inputEtiquetaRef.current?.click()
  }

  const alElegirEtiqueta = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLeyendoEtiqueta(true)
    setErrorEtiqueta('')
    try {
      const blob = await comprimir(file, 2000, 0.85)
      const path = await subirAStorage(blob)
      const r = await fetch('/api/bodega/leer-etiqueta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const d = await r.json()
      if (!d.ok) { setErrorEtiqueta(d.mensaje || 'No se pudo leer la guía.'); return }
      elegirGuia(d.guia, !d.reconocida, { paqueteria: d.paqueteria, seguro: d.seguro })
    } catch {
      setErrorEtiqueta('Sin conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setLeyendoEtiqueta(false)
    }
  }

  const elegirGuia = (g, forzada, origenFoto = null) => {
    setDudaManual(null)
    const yaHoy = hoy.find(p => p.numero_guia === g)
    if (yaHoy) {
      avisar('error', `Esa guía ya se registró hoy a las ${hora(yaHoy.recibido_en)}.`)
      if (origenFoto) setPaso('escanear')
      // Pausa para no repetir el aviso mientras la cámara sigue viendo la misma guía.
      setTimeout(() => { leidoRef.current = false }, 2500)
      return
    }
    detenerCamara()
    if (navigator.vibrate) navigator.vibrate(80)
    setGuia(g)
    setGuiaForzada(forzada)
    setDeFoto(origenFoto)
    setMostrarManual(false)
    setManual('')
    setPaso('revisar')
  }

  // El callback del lector se crea una sola vez; con este ref siempre usa la
  // versión más nueva de alLeerCodigo (con la lista de hoy actualizada).
  const alLeerCodigoRef = useRef(alLeerCodigo)
  useEffect(() => { alLeerCodigoRef.current = alLeerCodigo })

  const iniciarCamara = useCallback(async () => {
    leidoRef.current = false
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const { BarcodeFormat, DecodeHintType } = await import('@zxing/library')
      if (!lectorRef.current) {
        // Solo los formatos que aparecen en etiquetas de envío (+ UPC/EAN para
        // poder avisar "ese es el código del producto").
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
          BarcodeFormat.PDF_417, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        ])
        lectorRef.current = new BrowserMultiFormatReader(hints)
        lectorRef.current.nombreFormato = (f) => BarcodeFormat[f] || ''
      }
      await new Promise(r => setTimeout(r, 0))
      if (!videoRef.current) return
      setErrorCamara('')
      controlesRef.current = await lectorRef.current.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (resultado) => {
          if (!resultado || leidoRef.current) return
          leidoRef.current = true
          alLeerCodigoRef.current(resultado.getText(), lectorRef.current.nombreFormato(resultado.getBarcodeFormat()))
        }
      )
    } catch {
      setErrorCamara('No se pudo abrir la cámara. Revisa que el navegador tenga permiso, o escribe la guía a mano.')
    }
  }, [])

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('cliente') || 'null')
      if (d?.nombre) setNombre(d.nombre.split(' ')[0]) // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
    cargarHoy()
    return () => detenerCamara()
  }, [cargarHoy])

  useEffect(() => {
    if (pestana === 'escanear' && paso === 'escanear') iniciarCamara() // eslint-disable-line react-hooks/set-state-in-effect
    else detenerCamara()
  }, [pestana, paso, iniciarCamara])

  useEffect(() => {
    if (pestana !== 'historial') return
    let vigente = true
    setCargandoHistorial(true) // eslint-disable-line react-hooks/set-state-in-effect
    traerDia(diaHistorial)
      .then(lista => { if (vigente) setHistorial(lista || []) })
      .catch(() => { if (vigente) avisar('error', 'Sin conexión.') })
      .finally(() => { if (vigente) setCargandoHistorial(false) })
    return () => { vigente = false }
  }, [pestana, diaHistorial])

  const subirFoto = async (file) => {
    const id = Math.random().toString(36).slice(2)
    const preview = URL.createObjectURL(file)
    setFotos(f => [...f, { id, preview, path: null, estado: 'subiendo' }])
    try {
      const blob = await comprimir(file)
      const r = await fetch('/api/bodega/subir-foto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'image/jpeg' }),
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.mensaje)
      const fd = new FormData()
      fd.append('', blob, 'foto.jpg')
      const s = await fetch(d.signedUrl, { method: 'PUT', body: fd })
      if (!s.ok) throw new Error('subida')
      setFotos(f => f.map(x => x.id === id ? { ...x, path: d.path, estado: 'ok' } : x))
    } catch {
      setFotos(f => f.map(x => x.id === id ? { ...x, estado: 'error' } : x))
      avisar('error', 'Una foto no se pudo subir. Bórrala y tómala otra vez.')
    }
  }

  const alElegirFoto = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FOTOS - fotos.length)
    files.forEach(subirFoto)
    e.target.value = ''
  }

  const tomarFoto = () => inputFotoRef.current?.click()
  const quitarFoto = (id) => setFotos(f => f.filter(x => x.id !== id))

  const reiniciar = () => {
    fotos.forEach(f => URL.revokeObjectURL(f.preview))
    setFotos([])
    setGuia('')
    setNota('')
    setDeFoto(null)
    setErrorEtiqueta('')
    setPaso('escanear')
  }

  const fotosOk = fotos.filter(f => f.estado === 'ok')
  const subiendo = fotos.some(f => f.estado === 'subiendo')

  const guardar = async (danado) => {
    if (danado && subiendo) return avisar('error', 'Espera a que terminen de subir las fotos.')
    if (danado && !fotosOk.length) return avisar('error', 'Toma al menos una foto del daño.')
    setGuardando(true)
    try {
      const r = await fetch('/api/bodega/paquetes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_guia: guia,
          forzar: guiaForzada,
          danado,
          fotos: danado ? fotosOk.map(f => f.path) : [],
          notas: danado ? nota : '',
        }),
      })
      const d = await r.json()
      if (d.duplicado) {
        const cuando = d.existente?.recibido_en
          ? ` el ${new Date(d.existente.recibido_en).toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo' })} a las ${hora(d.existente.recibido_en)}`
          : ''
        avisar('error', `Esta guía ya estaba registrada${cuando}.`, 7000)
        reiniciar()
        return
      }
      if (!d.ok) return avisar('error', d.mensaje || 'No se pudo guardar.')
      // Las fotos recién tomadas se muestran con su vista previa local.
      const nuevo = { ...d.paquete, fotos_url: danado ? fotosOk.map(f => f.preview) : [] }
      setHoy(h => [nuevo, ...h])
      setUltimoDanado(danado)
      setFotos([])
      setGuia('')
      setNota('')
      setPaso('listo')
      if (navigator.vibrate) navigator.vibrate([60, 40, 60])
      setTimeout(() => setPaso('escanear'), danado ? 1200 : 700)
    } catch {
      avisar('error', 'Sin conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const salir = async () => {
    detenerCamara()
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    localStorage.removeItem('cliente')
    window.location.href = '/'
  }

  const tab = (activa) => ({
    flex: 1, padding: '12px 0', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    background: 'transparent', color: activa ? AZUL : GRIS,
    borderBottom: `3px solid ${activa ? AZUL : 'transparent'}`,
  })

  const danadosHistorial = historial.filter(p => p.danado).length
  const enPrimerDia = diaHistorial <= fechaLocal(DIAS_HISTORIAL)
  const enHoy = diaHistorial >= fechaLocal()

  return (
    <div style={{ minHeight: '100vh', background: '#f6f4f1', color: '#2a2118', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <header style={{ background: AZUL, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Bodega Nogales</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre ? `Hola, ${nombre}` : 'Recepción de paquetes'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: CREMA, color: AZUL_OSCURO, borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 14 }}>
              Hoy: {hoy.length}
            </div>
            <button onClick={salir} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}>
              Salir
            </button>
          </div>
        </header>
        <nav style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e7e1d9' }}>
          <button style={tab(pestana === 'escanear')} onClick={() => setPestana('escanear')}>Escanear</button>
          <button style={tab(pestana === 'historial')} onClick={() => { setDiaHistorial(fechaLocal()); setPestana('historial') }}>Historial</button>
        </nav>
      </div>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        {aviso && (
          <div style={{
            marginBottom: 12, padding: '12px 14px', borderRadius: 12, fontSize: 15, fontWeight: 600,
            background: aviso.tipo === 'error' ? '#fdecec' : '#e8f5ec',
            color: aviso.tipo === 'error' ? ROJO : VERDE,
          }}>
            {aviso.texto}
          </div>
        )}

        <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} style={{ display: 'none' }} />
        <input ref={inputEtiquetaRef} type="file" accept="image/*" capture="environment" onChange={alElegirEtiqueta} style={{ display: 'none' }} />

        {pestana === 'escanear' && (
          <>
            {paso === 'escanear' && (
              <>
                <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
                  <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', left: '8%', right: '8%', top: '38%', height: '24%', border: `3px solid ${rechazo ? ROJO : 'rgba(255,255,255,0.85)'}`, borderRadius: 10 }} />
                  {rechazo && (
                    <div style={{ position: 'absolute', top: 10, left: 10, right: 10, background: ROJO, color: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
                      ✕ Esa no es la guía
                      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 3 }}>{rechazo}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4, opacity: 0.9 }}>¿No se deja? Usa “Tomar foto de la etiqueta”.</div>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 14, textShadow: '0 1px 3px #000' }}>
                    Apunta al código de barras de la guía
                  </div>
                </div>
                {errorCamara && <p style={{ color: ROJO, fontSize: 14, marginTop: 10 }}>{errorCamara}</p>}

                <button onClick={abrirFotoEtiqueta} style={{ marginTop: 14, width: '100%', background: 'transparent', border: `1.5px solid ${AZUL}`, color: AZUL, borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 700 }}>
                  Tomar foto de la etiqueta
                </button>
                <div style={{ fontSize: 12, color: GRIS, textAlign: 'center', marginTop: 6 }}>
                  Para cuando el código no se deja escanear: la guía se lee de la foto.
                </div>

              </>
            )}

            {paso === 'etiqueta' && (
              <div style={{ background: '#fff', border: '1px solid #e7e1d9', borderRadius: 16, padding: 16 }}>
                {leyendoEtiqueta ? (
                  <div style={{ textAlign: 'center', padding: '28px 8px' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: AZUL }}>Leyendo la guía…</div>
                    <div style={{ fontSize: 14, color: GRIS, marginTop: 6 }}>Unos segundos</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 17, fontWeight: 700 }}>Foto de la etiqueta</div>
                    <div style={{ fontSize: 14, color: GRIS, marginTop: 4 }}>
                      Que se vea completa y derecha, con buena luz, sobre todo donde dice TRACKING.
                    </div>
                    {errorEtiqueta && (
                      <div style={{ marginTop: 12, background: '#fdecec', color: ROJO, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontWeight: 600 }}>
                        {errorEtiqueta}
                      </div>
                    )}
                    <button onClick={() => inputEtiquetaRef.current?.click()} style={boton(AZUL, { marginTop: 14 })}>
                      {errorEtiqueta ? 'Tomar otra foto' : 'Tomar foto'}
                    </button>

                    {errorEtiqueta && !mostrarManual && (
                      <button onClick={() => setMostrarManual(true)} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: AZUL, fontSize: 14, padding: 6 }}>
                        No se puede leer: escribir la guía
                      </button>
                    )}
                    {mostrarManual && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        <input
                          autoFocus value={manual} onChange={e => setManual(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && alEscribirGuia()}
                          placeholder="1Z999AA10123456784" autoCapitalize="characters" autoCorrect="off"
                          style={{ flex: 1, padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #cfc7bd', background: '#fff' }}
                        />
                        <button onClick={alEscribirGuia} style={boton(AZUL, { width: 'auto', padding: '0 18px', fontSize: 16 })}>OK</button>
                      </div>
                    )}
                    {dudaManual && (
                      <div style={{ marginTop: 12, background: '#fff7e6', border: '1px solid #f3d19c', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Ese número no parece una guía conocida</div>
                        <div style={{ fontSize: 13, color: '#92400e', marginTop: 4, wordBreak: 'break-all' }}>{dudaManual}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={() => setDudaManual(null)} style={boton('#fff', { color: GRIS, border: '1px solid #cfc7bd', fontSize: 15, padding: 12 })}>Corregir</button>
                          <button onClick={() => elegirGuia(dudaManual, true)} style={boton('#a16207', { fontSize: 15, padding: 12 })}>Sí, es la guía</button>
                        </div>
                      </div>
                    )}

                    <button onClick={() => { setMostrarManual(false); setManual(''); setDudaManual(null); reiniciar() }}
                      style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: GRIS, fontSize: 14, padding: 8 }}>
                      Volver a escanear
                    </button>
                  </>
                )}
              </div>
            )}

            {(paso === 'revisar' || paso === 'danado') && (
              <div style={{ background: '#e8f5ec', color: VERDE, borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>GUÍA · {deFoto ? `${deFoto.paqueteria} · leída de la foto` : guiaForzada ? 'Escrita a mano' : detectarPaqueteria(guia)}</div>
                <div style={{ fontSize: 19, fontWeight: 700, wordBreak: 'break-all' }}>{guia}</div>
                {deFoto && paso === 'revisar' && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#92400e', background: '#fff7e6', borderRadius: 8, padding: '6px 8px' }}>
                    {deFoto.seguro ? 'Compárala con la etiqueta antes de guardar.' : 'No se leyó del todo clara: compárala bien con la etiqueta.'}{' '}
                    <button onClick={() => { setGuia(''); setDeFoto(null); abrirFotoEtiqueta() }} style={{ background: 'none', border: 'none', color: AZUL, fontWeight: 700, fontSize: 13, padding: 0 }}>
                      No coincide
                    </button>
                  </div>
                )}
              </div>
            )}

            {paso === 'revisar' && (
              <>
                <button onClick={() => guardar(false)} disabled={guardando} style={boton(VERDE, { marginTop: 16, padding: 20, fontSize: 20, opacity: guardando ? 0.6 : 1 })}>
                  {guardando ? 'Guardando…' : 'Llegó bien'}
                </button>
                <button onClick={() => { setPaso('danado'); tomarFoto() }} disabled={guardando} style={boton('#fff', { marginTop: 10, color: ROJO, border: `2px solid ${ROJO}` })}>
                  Llegó dañado
                </button>
                <button onClick={reiniciar} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: GRIS, fontSize: 14, padding: 8 }}>
                  Cancelar y escanear otra
                </button>
              </>
            )}

            {paso === 'danado' && (
              <>
                <div style={{ marginTop: 14, fontSize: 15, fontWeight: 700, color: ROJO }}>Fotos del daño ({fotos.length}/{MAX_FOTOS})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                  {fotos.map(f => (
                    <div key={f.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: '#ddd' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.preview} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: f.estado === 'subiendo' ? 0.5 : 1 }} />
                      <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#fff', color: f.estado === 'ok' ? VERDE : f.estado === 'error' ? ROJO : AZUL }}>
                        {f.estado === 'ok' ? 'Lista' : f.estado === 'error' ? 'Falló' : 'Subiendo…'}
                      </div>
                      <button onClick={() => quitarFoto(f.id)} aria-label="Quitar foto" style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 15 }}>×</button>
                    </div>
                  ))}
                </div>

                {fotos.length < MAX_FOTOS && (
                  <button onClick={tomarFoto} style={boton(fotos.length ? '#fff' : ROJO, { marginTop: 12, color: fotos.length ? ROJO : '#fff', border: fotos.length ? `1.5px solid ${ROJO}` : 'none' })}>
                    {fotos.length ? 'Otra foto' : 'Tomar foto del daño'}
                  </button>
                )}

                <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota: caja golpeada, abierta, mojada…" maxLength={300}
                  style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #cfc7bd', background: '#fff' }} />

                {fotos.length > 0 && (
                  <button onClick={() => guardar(true)} disabled={guardando} style={boton(VERDE, { marginTop: 14, opacity: guardando || subiendo ? 0.6 : 1 })}>
                    {guardando ? 'Guardando…' : subiendo ? 'Subiendo fotos…' : 'Guardar paquete dañado'}
                  </button>
                )}

                <button onClick={() => { fotos.forEach(f => URL.revokeObjectURL(f.preview)); setFotos([]); setNota(''); setPaso('revisar') }}
                  style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: GRIS, fontSize: 14, padding: 8 }}>
                  Regresar (no está dañado)
                </button>
              </>
            )}

            {paso === 'listo' && (
              <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                <div style={{ width: 72, height: 72, borderRadius: 36, background: ultimoDanado ? ROJO : VERDE, color: '#fff', fontSize: 40, lineHeight: '72px', margin: '0 auto' }}>✓</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 14 }}>{ultimoDanado ? 'Registrado como dañado' : 'Paquete registrado'}</div>
                <div style={{ fontSize: 14, color: GRIS, marginTop: 4 }}>Abriendo la cámara para el siguiente…</div>
              </div>
            )}

            <section style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: GRIS, marginBottom: 6 }}>ÚLTIMOS DE HOY</div>
              {hoy.length === 0 ? (
                <p style={{ fontSize: 14, color: GRIS }}>Aún no hay paquetes registrados hoy.</p>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e7e1d9', overflow: 'hidden' }}>
                  {hoy.slice(0, 5).map(p => <FilaPaquete key={p.id} p={p} onFoto={setFotoGrande} />)}
                </div>
              )}
            </section>
          </>
        )}

        {pestana === 'historial' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 12, border: '1px solid #e7e1d9', padding: 8 }}>
              <button
                onClick={() => !enPrimerDia && setDiaHistorial(d => moverDia(d, -1))}
                aria-label="Día anterior"
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', background: '#f3efe9', fontSize: 22, color: AZUL, opacity: enPrimerDia ? 0.4 : 1 }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>{nombreDia(diaHistorial)}</div>
                <input type="date" value={diaHistorial} min={fechaLocal(DIAS_HISTORIAL)} max={fechaLocal()}
                  onChange={e => e.target.value && setDiaHistorial(e.target.value)}
                  style={{ border: 'none', background: 'transparent', color: GRIS, fontSize: 13, textAlign: 'center' }} />
              </div>
              <button
                onClick={() => !enHoy && setDiaHistorial(d => moverDia(d, 1))}
                aria-label="Día siguiente"
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', background: '#f3efe9', fontSize: 22, color: AZUL, opacity: enHoy ? 0.4 : 1 }}>›</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e7e1d9', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, color: GRIS, fontWeight: 700 }}>PAQUETES</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{historial.length}</div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1px solid #e7e1d9', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 12, color: GRIS, fontWeight: 700 }}>DAÑADOS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: danadosHistorial ? ROJO : 'inherit' }}>{danadosHistorial}</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {cargandoHistorial ? (
                <p style={{ fontSize: 14, color: GRIS }}>Cargando…</p>
              ) : historial.length === 0 ? (
                <p style={{ fontSize: 14, color: GRIS }}>No se registraron paquetes este día.</p>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e7e1d9', overflow: 'hidden' }}>
                  {historial.map(p => <FilaPaquete key={p.id} p={p} onFoto={setFotoGrande} />)}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {fotoGrande && (
        <div onClick={() => setFotoGrande(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="Evidencia" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>
      )}
    </div>
  )
}
