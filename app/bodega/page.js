'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { analizarCodigo, detectarPaqueteria } from '../../lib/bodega/guias'
import { crearEscaner } from '../../lib/bodega/escaner'

// Pantalla única del usuario de bodega (Nogales, AZ). Pensada para usarse de
// pie, con una mano y rápido: lo importante va abajo, al alcance del pulgar.
// Con la identidad de Denog: logo, perrito, colores azul/crema y tipografía
// redonda (Baloo 2 para títulos, Poppins para textos).
//
//  ESCANEAR
//   · La cámara lee la guía → "Llegó bien" (guarda al instante) o
//     "Llegó dañado" (1 a 3 fotos + motivo).
//   · Si lee un código que no es la guía: aviso rojo + sonido + vibración.
//   · "Foto de etiqueta": cuando el código no se deja, la IA lee la guía.
//   · "Sin guía": bolsa de Walmart / pickup en tienda → tienda + foto(s).
//   · El último registro se ve abajo de la cámara, con "Deshacer" (10 min).
//
//  HISTORIAL — día por día (hasta 90 días), con fotos de dañados y sin guía.

// Marca
const AZUL = '#466D9B'
const AZUL_OSCURO = '#2f4d70'
const AZUL_CLARO = '#8aacdd'
const AZUL_SUAVE = '#eaf1fa'
const CREMA = '#FCE5D6'
const ARENA = '#DDBCA6'
// Estados
const VERDE = '#16a34a'
const VERDE_OSCURO = '#0f7a37'
const VERDE_SUAVE = '#e7f7ec'
const ROJO = '#dc2626'
const ROJO_OSCURO = '#a51d1d'
const ROJO_SUAVE = '#fdecec'
const AMBAR = '#d97706'
const AMBAR_OSCURO = '#9a5304'
const AMBAR_SUAVE = '#fff3df'
// Neutros
const TINTA = '#2a2118'
const GRIS = '#8a7f73'
const LINEA = '#efe6dc'

const TITULOS = 'var(--font-baloo2), "Baloo 2", system-ui, sans-serif'
const TEXTO = 'var(--font-poppins), Poppins, system-ui, sans-serif'
const MONO = 'ui-monospace, Menlo, monospace'

const MAX_FOTOS = 3
const DIAS_HISTORIAL = 90
const MINUTOS_DESHACER = 10

const TIENDAS = ['Walmart', "Sam's", 'Costco', 'Target', 'Five Below', 'Otra']
const MOTIVOS_DANO = ['Caja golpeada', 'Caja abierta', 'Mojada', 'Aplastada', 'Rota']

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

const mayuscula = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t
const nombreDia = (fecha) => {
  const largo = mayuscula(new Date(fecha + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))
  if (fecha === fechaLocal()) return { grande: 'Hoy', chico: largo }
  if (fecha === fechaLocal(1)) return { grande: 'Ayer', chico: largo }
  return { grande: largo.split(',')[0], chico: largo }
}

const saludo = () => {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Phoenix' }))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

// Cómo se nombra un registro en las listas.
const titulo = (p) => p.numero_guia
  ? `…${p.numero_guia.slice(-8)}`
  : `${p.tienda || 'Sin guía'} · ${p.tipo === 'pickup' ? 'Pickup' : 'Delivery'}`
const subtitulo = (p) => p.numero_guia ? (p.paqueteria || '') : p.tipo === 'pickup' ? 'Recogido en tienda' : 'Llegó en bolsa'
const colorDe = (p) => p.danado ? ROJO : !p.numero_guia ? AMBAR : VERDE
const iconoDe = (p) => p.danado ? 'alerta' : !p.numero_guia ? 'bolsa' : 'caja'

const puedeDeshacer = (p, yoId) =>
  p && (!yoId || String(p.recibido_por) === String(yoId)) &&
  Date.now() - new Date(p.recibido_en).getTime() < MINUTOS_DESHACER * 60000

// Reduce la foto para que suba rápido con poca señal. Fotos de evidencia a
// 1600px/70%; la de la etiqueta a 2000px/85% para que se lean los números.
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

// Sonidos cortos para no tener que estar mirando la pantalla.
function crearSonidos() {
  let ctx = null
  const tono = (frecuencia, inicio, duracion) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = frecuencia
    o.type = 'sine'
    g.gain.setValueAtTime(0.0001, ctx.currentTime + inicio)
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + inicio + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion)
    o.connect(g).connect(ctx.destination)
    o.start(ctx.currentTime + inicio)
    o.stop(ctx.currentTime + inicio + duracion + 0.02)
  }
  return {
    // Safari solo deja sonar audio después de un toque del usuario.
    activar() {
      try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
        if (ctx.state === 'suspended') ctx.resume()
      } catch {}
    },
    ok() { try { if (ctx) { tono(1046, 0, 0.12) } } catch {} },
    guardado() { try { if (ctx) { tono(784, 0, 0.1); tono(1175, 0.11, 0.14) } } catch {} },
    error() { try { if (ctx) { tono(220, 0, 0.22); tono(196, 0.26, 0.3) } } catch {} },
  }
}

const vibrar = (patron) => { try { navigator.vibrate?.(patron) } catch {} }

// ── Iconos (trazo redondeado, a juego con el logo) ──────────────────────────

const TRAZOS = {
  escanear: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10M8 9v6M11 9v6M14 9v6M16 9v6',
  historial: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5',
  camara: 'M5 7h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bolsa: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2',
  caja: 'M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 12.5 10 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  salir: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  deshacer: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  izq: 'M15 18l-6-6 6-6',
  der: 'M9 18l6-6-6-6',
  calendario: 'M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  etiqueta: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9zM7.5 7.5h.01',
  mas: 'M12 5v14M5 12h14',
  linterna: 'M9 2h6l1 5-2 3v10a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V10L8 7l1-5zM12 13v2',
}

function Icono({ nombre, tam = 22, color = 'currentColor', grosor = 2.2 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={TRAZOS[nombre]} />
    </svg>
  )
}

function Burbuja({ nombre, color, fondo, tam = 44 }) {
  return (
    <div style={{ width: tam, height: tam, borderRadius: tam / 2, background: fondo, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icono nombre={nombre} tam={tam * 0.5} />
    </div>
  )
}

// ── Botones con "relieve": se hunden al tocarlos (ver .btn en ESTILOS) ─────

const botonGrande = (fondo, sombra, extra = {}) => ({
  width: '100%', minHeight: 58, padding: '14px 18px', borderRadius: 18, border: 'none',
  fontFamily: TITULOS, fontSize: 20, fontWeight: 700, color: '#fff', background: fondo, cursor: 'pointer',
  boxShadow: `0 5px 0 ${sombra}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  marginBottom: 5, ...extra,
})

const botonContorno = (color, extra = {}) => ({
  width: '100%', minHeight: 58, padding: '12px 18px', borderRadius: 18, border: `2.5px solid ${color}`,
  fontFamily: TITULOS, fontSize: 19, fontWeight: 700, color, background: '#fff', cursor: 'pointer',
  boxShadow: `0 4px 0 ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  marginBottom: 4, ...extra,
})

const enlace = { background: 'none', border: 'none', color: GRIS, fontFamily: TEXTO, fontSize: 15, padding: 12, width: '100%', cursor: 'pointer' }
const tarjeta = { background: '#fff', borderRadius: 22, boxShadow: '0 6px 20px rgba(70,109,155,0.10)', border: `1px solid ${LINEA}` }
const etiquetaSeccion = { fontFamily: TITULOS, fontSize: 18, fontWeight: 700, color: TINTA, margin: '20px 0 10px' }

const ESTILOS = `
  .btn { transition: transform .08s ease, box-shadow .08s ease; -webkit-tap-highlight-color: transparent; }
  .btn:active { transform: translateY(4px); box-shadow: 0 1px 0 rgba(0,0,0,.15) !important; }
  .toque { -webkit-tap-highlight-color: transparent; transition: transform .1s ease; }
  .toque:active { transform: scale(.97); }
  @keyframes barrido { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }
  @keyframes rebote { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(2deg); } }
  @keyframes aparecer { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
  @keyframes subir { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes latido { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
  .entra { animation: subir .25s ease both; }
`

function Chip({ activo, onClick, children, color = AZUL }) {
  return (
    <button className="toque" onClick={onClick} style={{
      minHeight: 46, padding: '10px 16px', borderRadius: 999, fontFamily: TEXTO, fontSize: 15, fontWeight: 600, cursor: 'pointer',
      border: `2px solid ${activo ? color : LINEA}`, background: activo ? color : '#fff', color: activo ? '#fff' : TINTA,
      boxShadow: activo ? `0 3px 0 ${color}55` : '0 2px 0 rgba(0,0,0,0.04)', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {activo && <Icono nombre="check" tam={16} grosor={3} />}
      {children}
    </button>
  )
}

// Guía con los últimos 5 dígitos resaltados: son los que se comparan.
function GuiaResaltada({ guia, grande }) {
  const corte = Math.max(0, guia.length - 5)
  return (
    <div style={{ fontFamily: MONO, fontSize: grande ? 18 : 15, letterSpacing: 0.5, wordBreak: 'break-all', color: TINTA, lineHeight: 1.6 }}>
      {guia.slice(0, corte)}
      <span style={{ background: CREMA, color: AZUL_OSCURO, fontWeight: 800, fontSize: grande ? 28 : 19, padding: '1px 6px', borderRadius: 8, marginLeft: 2, border: `2px solid ${ARENA}` }}>
        {guia.slice(corte)}
      </span>
    </div>
  )
}

function CuadriculaFotos({ fotos, onAgregar, onQuitar, color, fondo }) {
  const vacios = Math.max(0, MAX_FOTOS - fotos.length - 1)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {fotos.map(f => (
        <div key={f.id} className="entra" style={{ position: 'relative', aspectRatio: '1', borderRadius: 18, overflow: 'hidden', background: '#ddd', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.preview} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: f.estado === 'subiendo' ? 0.5 : 1 }} />
          <div style={{ position: 'absolute', bottom: 6, left: 6, fontFamily: TEXTO, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fff', color: f.estado === 'ok' ? VERDE_OSCURO : f.estado === 'error' ? ROJO : AZUL, animation: f.estado === 'subiendo' ? 'latido 1s infinite' : 'none' }}>
            {f.estado === 'ok' ? '✓ Lista' : f.estado === 'error' ? 'Falló' : 'Subiendo…'}
          </div>
          <button onClick={() => onQuitar(f.id)} aria-label="Quitar foto" style={{ position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre="x" tam={16} grosor={3} />
          </button>
        </div>
      ))}
      {fotos.length < MAX_FOTOS && (
        <button className="toque" onClick={onAgregar} style={{ aspectRatio: '1', borderRadius: 18, border: `2.5px dashed ${color}`, background: fondo, color, fontFamily: TITULOS, fontSize: 16, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
          <Icono nombre="camara" tam={30} />
          Foto
        </button>
      )}
      {Array.from({ length: vacios }).map((_, i) => (
        <div key={i} style={{ aspectRatio: '1', borderRadius: 18, border: `2px dashed ${LINEA}`, background: 'rgba(255,255,255,0.5)' }} />
      ))}
    </div>
  )
}

function FilaPaquete({ p, onFoto }) {
  const color = colorDe(p)
  return (
    <div style={{ padding: '14px 14px 14px 12px', borderTop: `1px solid ${LINEA}`, display: 'flex', gap: 12 }}>
      <Burbuja nombre={iconoDe(p)} color={color} fondo={`${color}1a`} tam={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: p.numero_guia ? MONO : TITULOS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titulo(p)}
          </div>
          <span style={{ color: GRIS, fontSize: 13, flexShrink: 0 }}>{hora(p.recibido_en)}</span>
        </div>
        <div style={{ fontSize: 13, color: GRIS, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{subtitulo(p)}</span>
          {p.danado && <span style={{ background: ROJO_SUAVE, color: ROJO_OSCURO, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>Dañado</span>}
          {!p.numero_guia && <span style={{ background: AMBAR_SUAVE, color: AMBAR_OSCURO, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>Sin guía</span>}
        </div>
        {p.notas && <div style={{ fontSize: 13, color: AMBAR_OSCURO, marginTop: 6 }}>{p.notas}</div>}
        {p.fotos_url?.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {p.fotos_url.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt="Evidencia" onClick={() => onFoto(u)} className="toque"
                style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 14, background: '#eee', cursor: 'zoom-in', boxShadow: '0 3px 8px rgba(0,0,0,0.12)' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function Bodega() {
  const [pestana, setPestana] = useState('escanear') // escanear | historial
  // escanear | etiqueta | revisar | danado | singuia | listo
  const [paso, setPaso] = useState('escanear')
  const [guia, setGuia] = useState('')
  const [guiaForzada, setGuiaForzada] = useState(false)
  const [deFoto, setDeFoto] = useState(null) // { paqueteria, seguro } si la guía salió de la foto

  const [fotos, setFotos] = useState([]) // { id, preview, path, estado: subiendo|ok|error }
  const [motivos, setMotivos] = useState([])
  const [nota, setNota] = useState('')
  const [tipoSinGuia, setTipoSinGuia] = useState('delivery')
  const [tienda, setTienda] = useState('')
  const [sinGuiaDanado, setSinGuiaDanado] = useState(false)

  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [rechazo, setRechazo] = useState('')
  const [errorCamara, setErrorCamara] = useState('')
  const [hayLinterna, setHayLinterna] = useState(false)
  const [exito, setExito] = useState(null) // aviso verde sobre la cámara tras "Llegó bien"

  const [linterna, setLinterna] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState(null) // { danado, singuia }

  const [leyendoEtiqueta, setLeyendoEtiqueta] = useState(false)
  const [errorEtiqueta, setErrorEtiqueta] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)
  const [manual, setManual] = useState('')
  const [dudaManual, setDudaManual] = useState(null)

  const [hoy, setHoy] = useState([])
  const [yo, setYo] = useState({ id: null, nombre: '' })
  const [diaHistorial, setDiaHistorial] = useState(fechaLocal())
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [fotoGrande, setFotoGrande] = useState(null)
  const [, setReloj] = useState(0) // refresca "Deshacer" cuando pasan los minutos

  const videoRef = useRef(null)
  const escanerRef = useRef(null)
  const vueltaCamaraRef = useRef(0) // invalida aperturas de cámara que ya no sirven
  const pasoRef = useRef('escanear')
  // La guía recién guardada: si la cámara la vuelve a ver (sigue enfrente),
  // se ignora en silencio unos segundos en vez de avisar "ya registrada".
  const recienGuardadaRef = useRef({ guia: '', hasta: 0 })
  const timerExitoRef = useRef(null)
  const leidoRef = useRef(false)
  const inputFotoRef = useRef(null)
  const inputEtiquetaRef = useRef(null)
  const ultimoRechazoRef = useRef({ texto: '', hasta: 0 })
  const timerRechazoRef = useRef(null)
  const sonidosRef = useRef(null)
  const sonar = (tipo) => sonidosRef.current?.[tipo]?.()
  useEffect(() => { pasoRef.current = paso }, [paso])

  const avisar = (tipo, texto, ms = 5000) => {
    setAviso({ tipo, texto })
    if (ms) setTimeout(() => setAviso(null), ms)
  }

  // ── Datos ──
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

  // ── Cámara ──
  const detenerCamara = () => {
    vueltaCamaraRef.current++
    escanerRef.current?.detener()
    escanerRef.current = null
    setLinterna(false)
  }

  const rechazarLectura = (texto, motivo) => {
    const ahora = Date.now()
    const ult = ultimoRechazoRef.current
    if (!(ult.texto === texto && ahora < ult.hasta)) {
      vibrar([250, 100, 250])
      sonar('error')
      setRechazo(motivo)
      clearTimeout(timerRechazoRef.current)
      timerRechazoRef.current = setTimeout(() => setRechazo(''), 4000)
    }
    ultimoRechazoRef.current = { texto, hasta: ahora + 3000 }
    leidoRef.current = false
  }

  const elegirGuia = (g, forzada, origenFoto = null) => {
    setDudaManual(null)
    const yaHoy = hoy.find(p => p.numero_guia === g)
    if (yaHoy) {
      sonar('error')
      vibrar([250, 100, 250])
      avisar('error', `Esa guía ya se registró hoy a las ${hora(yaHoy.recibido_en)}.`)
      if (origenFoto) setPaso('escanear')
      setTimeout(() => { leidoRef.current = false }, 2500)
      return
    }
    escanerRef.current?.pausar() // la cámara sigue prendida para el siguiente
    sonar('ok')
    vibrar(80)
    setRechazo('')
    setExito(null)
    setGuia(g)
    setGuiaForzada(forzada)
    setDeFoto(origenFoto)
    setMostrarManual(false)
    setManual('')
    setPaso('revisar')
  }

  // La cámara puede ver varios códigos a la vez (el lector nativo de Android
  // los regresa todos): se toma el primero que sí es guía. Si ninguno lo es,
  // se avisa con el motivo del que está en el visor.
  const alLeerCodigos = (codigos) => {
    let primerRechazo = null
    for (const c of codigos) {
      const r = analizarCodigo(c.texto, c.formato)
      if (r.ok) {
        const reciente = recienGuardadaRef.current
        if (r.guia === reciente.guia && Date.now() < reciente.hasta) return // es la que acaba de guardar
        leidoRef.current = true
        return elegirGuia(r.guia, false)
      }
      if (!primerRechazo) primerRechazo = { texto: c.texto, motivo: r.motivo }
    }
    if (primerRechazo) rechazarLectura(primerRechazo.texto, primerRechazo.motivo)
  }

  // El escáner se crea una sola vez por apertura; con este ref siempre usa
  // la versión más nueva de alLeerCodigos (con la lista de hoy actualizada).
  const alLeerCodigosRef = useRef(alLeerCodigos)
  useEffect(() => { alLeerCodigosRef.current = alLeerCodigos })

  const iniciarCamara = useCallback(async () => {
    leidoRef.current = false
    const vuelta = ++vueltaCamaraRef.current
    try {
      await new Promise(r => setTimeout(r, 0))
      if (!videoRef.current) return
      setErrorCamara('')
      const escaner = await crearEscaner({
        video: videoRef.current,
        pausado: pasoRef.current !== 'escanear',
        onCodigos: (codigos) => { if (!leidoRef.current) alLeerCodigosRef.current(codigos) },
      })
      // Si mientras abría la cámara ya se cambió de pantalla, se suelta.
      if (vuelta !== vueltaCamaraRef.current) { escaner.detener(); return }
      escanerRef.current = escaner
      setHayLinterna(escaner.tieneLinterna)
    } catch {
      if (vuelta === vueltaCamaraRef.current) {
        setErrorCamara('No se pudo abrir la cámara. Revisa que el navegador tenga permiso, o usa "Foto de etiqueta".')
      }
    }
  }, [])

  const alternarLinterna = async () => {
    const nuevo = await escanerRef.current?.linterna(!linterna)
    setLinterna(!!nuevo)
  }

  // Pistola lectora (Bluetooth/USB): escribe el código como teclado muy
  // rápido y termina con Enter. Se atrapa aquí sin necesidad de un campo.
  useEffect(() => {
    if (pestana !== 'escanear' || paso !== 'escanear') return
    let buffer = ''
    let ultimo = 0
    const alTeclear = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const ahora = Date.now()
      if (ahora - ultimo > 80) buffer = '' // tecleo humano: se ignora
      ultimo = ahora
      if (e.key === 'Enter') {
        if (buffer.length >= 6 && !leidoRef.current) alLeerCodigosRef.current([{ texto: buffer, formato: '' }])
        buffer = ''
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [pestana, paso])

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('cliente') || 'null')
      if (d) setYo({ id: d.id || null, nombre: mayuscula((d.nombre || '').split(' ')[0].toLowerCase()) }) // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
    cargarHoy()
    // Activar el audio con el primer toque (requisito de Safari).
    sonidosRef.current = crearSonidos()
    const activar = () => sonidosRef.current?.activar()
    window.addEventListener('pointerdown', activar)
    const reloj = setInterval(() => setReloj(n => n + 1), 30000)
    return () => { detenerCamara(); window.removeEventListener('pointerdown', activar); clearInterval(reloj) }
  }, [cargarHoy])

  // La cámara se queda PRENDIDA mientras se escanea, se revisa y se guarda
  // ("¿Cómo llegó?" → "Llegó bien" → siguiente): solo se pausa la lectura.
  // Se apaga cuando hay que tomar fotos (el teléfono necesita su cámara) o
  // al ir al historial.
  useEffect(() => {
    const mantener = pestana === 'escanear' && ['escanear', 'revisar', 'listo'].includes(paso)
    if (!mantener) { detenerCamara(); return } // eslint-disable-line react-hooks/set-state-in-effect
    const esc = escanerRef.current
    if (!esc || !esc.vivo()) {
      if (esc) detenerCamara()
      iniciarCamara()
    } else if (paso === 'escanear') { leidoRef.current = false; esc.reanudar() }
    else esc.pausar()
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

  // ── Fotos ──
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

  const subirFoto = async (file) => {
    const id = Math.random().toString(36).slice(2)
    const preview = URL.createObjectURL(file)
    setFotos(f => [...f, { id, preview, path: null, estado: 'subiendo' }])
    try {
      const path = await subirAStorage(await comprimir(file))
      setFotos(f => f.map(x => x.id === id ? { ...x, path, estado: 'ok' } : x))
    } catch {
      setFotos(f => f.map(x => x.id === id ? { ...x, estado: 'error' } : x))
      avisar('error', 'Una foto no se pudo subir. Quítala y tómala otra vez.')
    }
  }

  const alElegirFoto = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FOTOS - fotos.length)
    files.forEach(subirFoto)
    e.target.value = ''
  }
  const tomarFoto = () => inputFotoRef.current?.click()
  const quitarFoto = (id) => setFotos(f => f.filter(x => x.id !== id))

  // ── Foto de la etiqueta (la IA lee la guía) ──
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
      const path = await subirAStorage(await comprimir(file, 2000, 0.85))
      const r = await fetch('/api/bodega/leer-etiqueta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const d = await r.json()
      if (!d.ok) { sonar('error'); setErrorEtiqueta(d.mensaje || 'No se pudo leer la guía.'); return }
      elegirGuia(d.guia, !d.reconocida, { paqueteria: d.paqueteria, seguro: d.seguro })
    } catch {
      setErrorEtiqueta('Sin conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setLeyendoEtiqueta(false)
    }
  }

  const alEscribirGuia = () => {
    const r = analizarCodigo(manual)
    if (r.ok) return elegirGuia(r.guia, false)
    const g = manual.toUpperCase().replace(/[^0-9A-Z]/g, '')
    if (g.length < 8) return avisar('error', 'Ese número es muy corto para ser una guía.')
    setDudaManual(g)
  }

  // ── Flujo ──
  const reiniciar = () => {
    fotos.forEach(f => URL.revokeObjectURL(f.preview))
    setFotos([])
    setMotivos([])
    setNota('')
    setGuia('')
    setDeFoto(null)
    setGuiaForzada(false)
    setTienda('')
    setTipoSinGuia('delivery')
    setSinGuiaDanado(false)
    setErrorEtiqueta('')
    setMostrarManual(false)
    setManual('')
    setDudaManual(null)
    setPaso('escanear')
  }

  const abrirSinGuia = () => {
    setRechazo('')
    detenerCamara()
    setPaso('singuia')
  }

  const fotosOk = fotos.filter(f => f.estado === 'ok')
  const subiendo = fotos.some(f => f.estado === 'subiendo')
  const notaFinal = [...motivos, nota.trim()].filter(Boolean).join(' · ')

  const guardar = async (modo) => {
    // modo: 'bien' | 'danado' | 'singuia'
    const conFotos = modo !== 'bien'
    if (conFotos && subiendo) return avisar('error', 'Espera a que terminen de subir las fotos.')
    if (conFotos && !fotosOk.length) return avisar('error', modo === 'danado' ? 'Toma al menos una foto del daño.' : 'Toma al menos una foto del paquete.')
    if (modo === 'singuia' && !tienda) return avisar('error', 'Elige la tienda.')

    const cuerpo = modo === 'singuia'
      ? { tipo: tipoSinGuia, tienda, danado: sinGuiaDanado, fotos: fotosOk.map(f => f.path), notas: notaFinal }
      : {
          tipo: 'guia', numero_guia: guia, forzar: guiaForzada, paqueteria: deFoto?.paqueteria,
          danado: modo === 'danado',
          fotos: modo === 'danado' ? fotosOk.map(f => f.path) : [],
          notas: modo === 'danado' ? notaFinal : '',
        }

    setGuardando(true)
    try {
      const r = await fetch('/api/bodega/paquetes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const d = await r.json()
      if (d.duplicado) {
        const cuando = d.existente?.recibido_en
          ? ` el ${new Date(d.existente.recibido_en).toLocaleDateString('es-MX', { timeZone: 'America/Hermosillo' })} a las ${hora(d.existente.recibido_en)}`
          : ''
        sonar('error')
        avisar('error', `Esta guía ya estaba registrada${cuando}.`, 7000)
        reiniciar()
        return
      }
      if (!d.ok) { sonar('error'); return avisar('error', d.mensaje || 'No se pudo guardar.') }
      // Las fotos recién tomadas se muestran con su vista previa local.
      const nuevo = { ...d.paquete, fotos_url: conFotos ? fotosOk.map(f => f.preview) : [] }
      setHoy(h => [nuevo, ...h])
      setUltimoGuardado({ danado: nuevo.danado, singuia: modo === 'singuia' })
      sonar('guardado')
      vibrar([60, 40, 60])
      setFotos([]) // las vistas previas siguen en uso en la lista de hoy
      setMotivos([])
      setNota('')
      setGuia('')
      setDeFoto(null)
      setTienda('')
      setSinGuiaDanado(false)
      if (nuevo.numero_guia) recienGuardadaRef.current = { guia: nuevo.numero_guia, hasta: Date.now() + 8000 }
      if (modo === 'bien') {
        // Camino rápido: de regreso a la cámara (que nunca se apagó) con un
        // aviso verde encima, sin pantalla intermedia.
        setExito({ texto: `Llegó bien · ${titulo(nuevo)}` })
        clearTimeout(timerExitoRef.current)
        timerExitoRef.current = setTimeout(() => setExito(null), 1800)
        setPaso('escanear')
      } else {
        setPaso('listo')
        setTimeout(() => setPaso(p => (p === 'listo' ? 'escanear' : p)), 1200)
      }
    } catch {
      avisar('error', 'Sin conexión. Revisa tu internet e intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const deshacer = async (p) => {
    try {
      const r = await fetch(`/api/bodega/paquetes?id=${p.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!d.ok) return avisar('error', d.mensaje || 'No se pudo deshacer.')
      setHoy(h => h.filter(x => x.id !== p.id))
      avisar('ok', 'Registro borrado. Vuelve a escanearlo.', 3500)
    } catch {
      avisar('error', 'Sin conexión.')
    }
  }

  const salir = async () => {
    detenerCamara()
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    localStorage.removeItem('cliente')
    window.location.href = '/'
  }

  const ultimo = hoy[0]
  const danadosHistorial = historial.filter(p => p.danado).length
  const sinGuiaHistorial = historial.filter(p => !p.numero_guia).length
  const enPrimerDia = diaHistorial <= fechaLocal(DIAS_HISTORIAL)
  const enHoy = diaHistorial >= fechaLocal()
  const dia = nombreDia(diaHistorial)

  // Barra de color que dice en qué paso va (debajo del encabezado).
  const pasoActual = pestana === 'escanear' && {
    revisar: { titulo: '¿Cómo llegó?', icono: 'caja', color: AZUL, fondo: AZUL_SUAVE },
    danado: { titulo: 'Paquete dañado', icono: 'alerta', color: ROJO, fondo: ROJO_SUAVE },
    singuia: { titulo: 'Paquete sin guía', icono: 'bolsa', color: AMBAR, fondo: AMBAR_SUAVE },
    etiqueta: { titulo: 'Foto de la etiqueta', icono: 'etiqueta', color: AZUL, fondo: AZUL_SUAVE },
  }[paso]

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(180deg, #fffaf5 0%, #fdf0e5 60%, ${CREMA} 100%)`, color: TINTA, fontFamily: TEXTO, display: 'flex', flexDirection: 'column' }}>
      <style>{ESTILOS}</style>
      <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} style={{ display: 'none' }} />
      <input ref={inputEtiquetaRef} type="file" accept="image/*" capture="environment" onChange={alElegirEtiqueta} style={{ display: 'none' }} />

      {/* ── Encabezado con el logo ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: '#fff', borderRadius: '0 0 26px 26px', boxShadow: '0 6px 24px rgba(70,109,155,0.14)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '10px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-bodega.png" alt="Denog" style={{ height: 46, width: 'auto' }} />
          <div style={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${LINEA}`, paddingLeft: 12 }}>
            <div style={{ fontFamily: TITULOS, fontSize: 12.5, fontWeight: 700, color: AZUL, letterSpacing: 0.6, lineHeight: 1.1 }}>BODEGA NOGALES</div>
            <div style={{ fontFamily: TITULOS, fontSize: 21, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {yo.nombre ? `Hola, ${yo.nombre}` : 'Hola'}
            </div>
            <div style={{ fontSize: 11.5, color: GRIS, lineHeight: 1.1 }}>{saludo()}</div>
          </div>
          <div style={{ background: AZUL, color: '#fff', borderRadius: 16, padding: '4px 12px', textAlign: 'center', boxShadow: `0 3px 0 ${AZUL_OSCURO}` }}>
            <div style={{ fontFamily: TITULOS, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{hoy.length}</div>
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.9, marginTop: -1 }}>hoy</div>
          </div>
          <button onClick={salir} aria-label="Salir" className="toque" style={{ width: 40, height: 40, borderRadius: 20, border: `1.5px solid ${LINEA}`, background: '#fff', color: GRIS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre="salir" tam={18} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 480, margin: '0 auto', padding: '16px 16px 120px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        {pasoActual && (
          <div className="entra" style={{ display: 'flex', alignItems: 'center', gap: 12, background: pasoActual.fondo, borderRadius: 20, padding: '10px 10px 10px 12px', marginBottom: 14 }}>
            <Burbuja nombre={pasoActual.icono} color="#fff" fondo={pasoActual.color} tam={40} />
            <div style={{ flex: 1, fontFamily: TITULOS, fontSize: 21, fontWeight: 700, color: pasoActual.color }}>{pasoActual.titulo}</div>
            <button onClick={reiniciar} aria-label="Cancelar" className="toque" style={{ width: 42, height: 42, borderRadius: 21, border: 'none', background: '#fff', color: pasoActual.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icono nombre="x" tam={20} grosor={2.8} />
            </button>
          </div>
        )}

        {aviso && (
          <div role="status" className="entra" style={{
            marginBottom: 12, padding: '12px 14px', borderRadius: 18, fontSize: 15, fontWeight: 600, display: 'flex', gap: 10, alignItems: 'center',
            background: aviso.tipo === 'error' ? ROJO_SUAVE : VERDE_SUAVE, color: aviso.tipo === 'error' ? ROJO_OSCURO : VERDE_OSCURO,
          }}>
            <Icono nombre={aviso.tipo === 'error' ? 'alerta' : 'check'} tam={20} />
            {aviso.texto}
          </div>
        )}

        {/* ── ESCANEAR ── */}
        {/* La cámara se queda montada (oculta) mientras se revisa/guarda,
            para no tener que volver a abrirla en cada paquete. */}
        {pestana === 'escanear' && ['escanear', 'revisar', 'listo'].includes(paso) && (
          <div style={{ display: paso === 'escanear' ? 'block' : 'none' }}>
            <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', background: '#16202c', aspectRatio: '4 / 4.3', border: '5px solid #fff', boxShadow: '0 12px 30px rgba(47,77,112,0.25)' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {/* Visor con esquinas y línea de barrido */}
              <div style={{ position: 'absolute', left: '8%', right: '8%', top: '30%', height: '34%' }}>
                {[{ top: 0, left: 0, b: 'borderTop', s: 'borderLeft' }, { top: 0, right: 0, b: 'borderTop', s: 'borderRight' }, { bottom: 0, left: 0, b: 'borderBottom', s: 'borderLeft' }, { bottom: 0, right: 0, b: 'borderBottom', s: 'borderRight' }].map((e, i) => {
                  const { b, s, ...pos } = e
                  return <div key={i} style={{ position: 'absolute', width: 34, height: 34, ...pos, [b]: `5px solid ${rechazo ? ROJO : '#fff'}`, [s]: `5px solid ${rechazo ? ROJO : '#fff'}`, borderRadius: 6 }} />
                })}
                {!rechazo && <div style={{ position: 'absolute', left: 8, right: 8, height: 3, borderRadius: 3, background: AZUL_CLARO, boxShadow: `0 0 12px ${AZUL_CLARO}`, animation: 'barrido 2.4s ease-in-out infinite' }} />}
              </div>
              {hayLinterna && !rechazo && (
                <button onClick={alternarLinterna} aria-label={linterna ? 'Apagar linterna' : 'Prender linterna'} className="toque"
                  style={{ position: 'absolute', right: 12, bottom: 12, height: 46, padding: '0 14px', borderRadius: 23, border: 'none', background: linterna ? '#fde68a' : 'rgba(255,255,255,0.92)', color: linterna ? '#7c4a03' : AZUL_OSCURO, fontFamily: TEXTO, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icono nombre="linterna" tam={20} /> {linterna ? 'Apagar' : 'Luz'}
                </button>
              )}
              {!rechazo && (
                <div style={{ position: 'absolute', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ background: 'rgba(255,255,255,0.92)', color: AZUL_OSCURO, borderRadius: 999, padding: '7px 14px', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icono nombre="escanear" tam={16} /> Apunta al código que dice TRACKING
                  </div>
                </div>
              )}
              {exito && !rechazo && (
                <div className="entra" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: VERDE, color: '#fff', borderRadius: 20, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Burbuja nombre="check" color={VERDE} fondo="#fff" tam={34} />
                  <div style={{ fontFamily: TITULOS, fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{exito.texto}</div>
                </div>
              )}
              {rechazo && (
                <div className="entra" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: ROJO, color: '#fff', borderRadius: 20, padding: '12px 14px', display: 'flex', gap: 10 }}>
                  <Burbuja nombre="x" color={ROJO} fondo="#fff" tam={34} />
                  <div>
                    <div style={{ fontFamily: TITULOS, fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>Esa no es la guía</div>
                    <div style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.35 }}>{rechazo}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {pestana === 'escanear' && paso === 'escanear' && (
          <>
            {errorCamara && <p style={{ color: ROJO_OSCURO, fontSize: 14, marginTop: 10 }}>{errorCamara}</p>}

            {ultimo ? (
              <div className="entra" style={{ ...tarjeta, marginTop: 14, padding: '10px 10px 10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Burbuja nombre={iconoDe(ultimo)} color={colorDe(ultimo)} fondo={`${colorDe(ultimo)}1a`} tam={42} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: GRIS }}>Último · {hora(ultimo.recibido_en)}</div>
                  <div style={{ fontFamily: ultimo.numero_guia ? MONO : TITULOS, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {titulo(ultimo)}
                  </div>
                </div>
                {puedeDeshacer(ultimo, yo.id) && (
                  <button onClick={() => deshacer(ultimo)} className="toque" style={{ minHeight: 42, padding: '8px 12px', borderRadius: 14, border: `1.5px solid ${LINEA}`, background: '#fffaf5', color: TINTA, fontFamily: TEXTO, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icono nombre="deshacer" tam={16} /> Deshacer
                  </button>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '4px 4px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/perrito-bodega.png" alt="" style={{ width: 54, height: 'auto' }} />
                <div style={{ fontSize: 14, color: GRIS, lineHeight: 1.4 }}>
                  <b style={{ color: TINTA, fontFamily: TITULOS, fontSize: 16 }}>¡Listos para recibir!</b><br />Escanea el primer paquete del día.
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button onClick={abrirFotoEtiqueta} className="btn" style={{ ...tarjeta, padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textAlign: 'left', boxShadow: `0 5px 0 ${AZUL}2e, 0 6px 20px rgba(70,109,155,0.08)` }}>
                <Burbuja nombre="camara" color={AZUL} fondo={AZUL_SUAVE} tam={44} />
                <div>
                  <div style={{ fontFamily: TITULOS, fontSize: 18, fontWeight: 700, color: TINTA, lineHeight: 1.15 }}>Foto de etiqueta</div>
                  <div style={{ fontSize: 12.5, color: GRIS }}>Si no se escanea</div>
                </div>
              </button>
              <button onClick={abrirSinGuia} className="btn" style={{ ...tarjeta, padding: '14px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, cursor: 'pointer', textAlign: 'left', boxShadow: `0 5px 0 ${AMBAR}2e, 0 6px 20px rgba(70,109,155,0.08)` }}>
                <Burbuja nombre="bolsa" color={AMBAR} fondo={AMBAR_SUAVE} tam={44} />
                <div>
                  <div style={{ fontFamily: TITULOS, fontSize: 18, fontWeight: 700, color: TINTA, lineHeight: 1.15 }}>Sin guía</div>
                  <div style={{ fontSize: 12.5, color: GRIS }}>Bolsa o pickup</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── FOTO DE ETIQUETA ── */}
        {pestana === 'escanear' && paso === 'etiqueta' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {leyendoEtiqueta ? (
              <div style={{ textAlign: 'center', padding: '40px 8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/perrito-bodega.png" alt="" style={{ width: 120, animation: 'rebote 1s ease-in-out infinite' }} />
                <div style={{ fontFamily: TITULOS, fontSize: 26, fontWeight: 700, color: AZUL, marginTop: 10 }}>Leyendo la guía…</div>
                <div style={{ fontSize: 15, color: GRIS, marginTop: 4 }}>Unos segundos</div>
              </div>
            ) : (
              <>
                <div style={{ ...tarjeta, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
                  <Burbuja nombre="etiqueta" color={AZUL} fondo={AZUL_SUAVE} tam={52} />
                  <div style={{ fontSize: 15, color: GRIS, lineHeight: 1.45 }}>
                    <b style={{ color: TINTA, fontFamily: TITULOS, fontSize: 18 }}>Tómale foto a la etiqueta</b><br />
                    Completa, derecha y con buena luz. Que se lea donde dice TRACKING.
                  </div>
                </div>
                {errorEtiqueta && (
                  <div className="entra" style={{ marginTop: 12, background: ROJO_SUAVE, color: ROJO_OSCURO, borderRadius: 18, padding: '12px 14px', fontSize: 15, fontWeight: 600, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Icono nombre="alerta" tam={20} /> {errorEtiqueta}
                  </div>
                )}
                {mostrarManual && (
                  <div className="entra" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      autoFocus value={manual} onChange={e => setManual(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && alEscribirGuia()}
                      placeholder="Número de guía" autoCapitalize="characters" autoCorrect="off"
                      style={{ flex: 1, minHeight: 56, padding: 14, fontSize: 17, fontFamily: MONO, borderRadius: 16, border: `2px solid ${LINEA}`, background: '#fff' }}
                    />
                    <button onClick={alEscribirGuia} className="btn" style={botonGrande(AZUL, AZUL_OSCURO, { width: 'auto', padding: '0 22px' })}>OK</button>
                  </div>
                )}
                {dudaManual && (
                  <div className="entra" style={{ marginTop: 12, background: AMBAR_SUAVE, borderRadius: 18, padding: 14 }}>
                    <div style={{ fontFamily: TITULOS, fontSize: 17, fontWeight: 700, color: AMBAR_OSCURO }}>No parece una guía conocida</div>
                    <div style={{ fontFamily: MONO, fontSize: 15, color: AMBAR_OSCURO, marginTop: 4, wordBreak: 'break-all' }}>{dudaManual}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => setDudaManual(null)} className="btn" style={botonContorno(GRIS, { fontSize: 16, minHeight: 50 })}>Corregir</button>
                      <button onClick={() => elegirGuia(dudaManual, true)} className="btn" style={botonGrande(AMBAR, AMBAR_OSCURO, { fontSize: 16, minHeight: 50 })}>Sí es la guía</button>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 'auto', paddingTop: 18 }}>
                  <button onClick={() => inputEtiquetaRef.current?.click()} className="btn" style={botonGrande(AZUL, AZUL_OSCURO)}>
                    <Icono nombre="camara" tam={24} /> {errorEtiqueta ? 'Tomar otra foto' : 'Tomar foto'}
                  </button>
                  {errorEtiqueta && !mostrarManual && (
                    <button onClick={() => setMostrarManual(true)} style={{ ...enlace, color: AZUL, fontWeight: 600 }}>No se puede leer: escribir la guía</button>
                  )}
                  <button onClick={reiniciar} style={enlace}>Volver a escanear</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ¿CÓMO LLEGÓ? ── */}
        {pestana === 'escanear' && paso === 'revisar' && (
          <div className="entra" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ ...tarjeta, padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: AZUL_SUAVE, color: AZUL_OSCURO, borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700 }}>
                <Icono nombre="caja" tam={15} />
                {deFoto ? `${deFoto.paqueteria} · leída de la foto` : guiaForzada ? 'Escrita a mano' : detectarPaqueteria(guia)}
              </div>
              <div style={{ marginTop: 14 }}><GuiaResaltada guia={guia} grande /></div>
              <div style={{ fontSize: 13, color: GRIS, marginTop: 10 }}>Compara los últimos dígitos con la etiqueta</div>
              {deFoto && (
                <div style={{ marginTop: 12, fontSize: 14, color: AMBAR_OSCURO, background: AMBAR_SUAVE, borderRadius: 14, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>{deFoto.seguro ? 'Revisa que coincida.' : 'No se leyó del todo clara: revísala bien.'}</span>
                  <button onClick={() => { setGuia(''); setDeFoto(null); abrirFotoEtiqueta() }} style={{ background: '#fff', border: 'none', borderRadius: 999, color: AZUL, fontWeight: 700, fontSize: 13, padding: '6px 10px' }}>No coincide</button>
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => guardar('bien')} disabled={guardando} className="btn" style={botonGrande(VERDE, VERDE_OSCURO, { minHeight: 88, fontSize: 26, opacity: guardando ? 0.6 : 1 })}>
                <Icono nombre="check" tam={30} grosor={3} /> {guardando ? 'Guardando…' : 'Llegó bien'}
              </button>
              <button onClick={() => { setPaso('danado'); tomarFoto() }} disabled={guardando} className="btn" style={botonContorno(ROJO, { minHeight: 62 })}>
                <Icono nombre="alerta" tam={22} /> Llegó dañado
              </button>
            </div>
          </div>
        )}

        {/* ── DAÑADO ── */}
        {pestana === 'escanear' && paso === 'danado' && (
          <div className="entra" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ ...tarjeta, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, color: GRIS, marginBottom: 2 }}>Guía</div>
              <GuiaResaltada guia={guia} />
            </div>

            <div style={etiquetaSeccion}>Fotos del daño <span style={{ color: GRIS, fontWeight: 500, fontSize: 15 }}>{fotos.length}/{MAX_FOTOS}</span></div>
            <CuadriculaFotos fotos={fotos} onAgregar={tomarFoto} onQuitar={quitarFoto} color={ROJO} fondo={ROJO_SUAVE} />

            <div style={etiquetaSeccion}>¿Qué tiene?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MOTIVOS_DANO.map(m => (
                <Chip key={m} color={ROJO} activo={motivos.includes(m)} onClick={() => setMotivos(ms => ms.includes(m) ? ms.filter(x => x !== m) : [...ms, m])}>{m}</Chip>
              ))}
            </div>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Otra nota (opcional)" maxLength={200}
              style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', minHeight: 54, padding: 14, fontSize: 16, fontFamily: TEXTO, borderRadius: 16, border: `2px solid ${LINEA}`, background: '#fff' }} />

            <div style={{ marginTop: 'auto', paddingTop: 18 }}>
              <button onClick={() => guardar('danado')} disabled={guardando} className="btn" style={botonGrande(VERDE, VERDE_OSCURO, { opacity: guardando || subiendo || !fotosOk.length ? 0.55 : 1 })}>
                {guardando ? 'Guardando…' : subiendo ? 'Subiendo fotos…' : !fotos.length ? 'Toma al menos una foto' : <><Icono nombre="check" tam={24} grosor={3} /> Guardar dañado</>}
              </button>
              <button onClick={() => { fotos.forEach(f => URL.revokeObjectURL(f.preview)); setFotos([]); setMotivos([]); setNota(''); setPaso('revisar') }} style={enlace}>
                Regresar (no está dañado)
              </button>
            </div>
          </div>
        )}

        {/* ── SIN GUÍA ── */}
        {pestana === 'escanear' && paso === 'singuia' && (
          <div className="entra" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['delivery', 'Delivery', 'Bolsa / sin etiqueta', 'bolsa'], ['pickup', 'Pickup', 'Recogido en tienda', 'caja']].map(([v, t, s, ic]) => {
                const activo = tipoSinGuia === v
                return (
                  <button key={v} onClick={() => setTipoSinGuia(v)} className="toque" style={{
                    ...tarjeta, padding: '12px 12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    border: `2.5px solid ${activo ? AMBAR : LINEA}`, background: activo ? AMBAR_SUAVE : '#fff',
                  }}>
                    <Burbuja nombre={ic} color={activo ? '#fff' : AMBAR} fondo={activo ? AMBAR : AMBAR_SUAVE} tam={38} />
                    <div>
                      <div style={{ fontFamily: TITULOS, fontSize: 18, fontWeight: 700, color: TINTA, lineHeight: 1.1 }}>{t}</div>
                      <div style={{ fontSize: 11.5, color: GRIS }}>{s}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={etiquetaSeccion}>Tienda</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TIENDAS.map(t => <Chip key={t} color={AMBAR} activo={tienda === t} onClick={() => setTienda(t)}>{t}</Chip>)}
            </div>

            <div style={{ ...etiquetaSeccion, marginBottom: 2 }}>Fotos <span style={{ color: GRIS, fontWeight: 500, fontSize: 15 }}>{fotos.length}/{MAX_FOTOS}</span></div>
            <div style={{ fontSize: 13, color: GRIS, marginBottom: 10 }}>Del paquete o bolsa, y del recibo o nombre si trae.</div>
            <CuadriculaFotos fotos={fotos} onAgregar={tomarFoto} onQuitar={quitarFoto} color={AMBAR} fondo={AMBAR_SUAVE} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <Chip color={ROJO} activo={sinGuiaDanado} onClick={() => setSinGuiaDanado(v => !v)}>Llegó dañado</Chip>
            </div>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (opcional): a nombre de quién, qué trae…" maxLength={200}
              style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', minHeight: 54, padding: 14, fontSize: 16, fontFamily: TEXTO, borderRadius: 16, border: `2px solid ${LINEA}`, background: '#fff' }} />

            <div style={{ marginTop: 'auto', paddingTop: 18 }}>
              <button onClick={() => guardar('singuia')} disabled={guardando} className="btn" style={botonGrande(VERDE, VERDE_OSCURO, { opacity: guardando || subiendo || !fotosOk.length || !tienda ? 0.55 : 1 })}>
                {guardando ? 'Guardando…' : subiendo ? 'Subiendo fotos…' : !tienda ? 'Elige la tienda' : !fotos.length ? 'Toma al menos una foto' : <><Icono nombre="check" tam={24} grosor={3} /> Guardar paquete</>}
              </button>
            </div>
          </div>
        )}

        {/* ── GUARDADO ── */}
        {pestana === 'escanear' && paso === 'listo' && (() => {
          const color = ultimoGuardado?.danado ? ROJO : ultimoGuardado?.singuia ? AMBAR : VERDE
          return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '30px 16px' }}>
              <div style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/perrito-bodega.png" alt="" style={{ width: 170, animation: 'rebote .9s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', right: -14, top: -6, width: 64, height: 64, borderRadius: 32, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '5px solid #fff', boxShadow: '0 6px 16px rgba(0,0,0,0.18)', animation: 'aparecer .3s ease both' }}>
                  <Icono nombre="check" tam={34} grosor={3.4} />
                </div>
              </div>
              <div style={{ fontFamily: TITULOS, fontSize: 30, fontWeight: 800, marginTop: 14, color }}>
                {ultimoGuardado?.danado ? 'Guardado como dañado' : ultimoGuardado?.singuia ? 'Guardado sin guía' : '¡Llegó bien!'}
              </div>
              <div style={{ fontSize: 15, color: GRIS, marginTop: 4 }}>Vamos con el siguiente…</div>
            </div>
          )
        })()}

        {/* ── HISTORIAL ── */}
        {pestana === 'historial' && (
          <>
            <div style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
              <button onClick={() => !enPrimerDia && setDiaHistorial(d => moverDia(d, -1))} aria-label="Día anterior" className="toque"
                style={{ width: 54, height: 54, borderRadius: 18, border: 'none', background: AZUL_SUAVE, color: AZUL, opacity: enPrimerDia ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icono nombre="izq" tam={26} grosor={2.8} />
              </button>
              <label style={{ flex: 1, textAlign: 'center', position: 'relative', cursor: 'pointer' }}>
                <div style={{ fontFamily: TITULOS, fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{dia.grande}</div>
                <div style={{ fontSize: 12.5, color: AZUL, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icono nombre="calendario" tam={13} /> {dia.chico}
                </div>
                <input type="date" value={diaHistorial} min={fechaLocal(DIAS_HISTORIAL)} max={fechaLocal()}
                  onChange={e => e.target.value && setDiaHistorial(e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%' }} />
              </label>
              <button onClick={() => !enHoy && setDiaHistorial(d => moverDia(d, 1))} aria-label="Día siguiente" className="toque"
                style={{ width: 54, height: 54, borderRadius: 18, border: 'none', background: AZUL_SUAVE, color: AZUL, opacity: enHoy ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icono nombre="der" tam={26} grosor={2.8} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
              {[
                { t: 'Paquetes', n: historial.length, icono: 'caja', color: AZUL, fondo: AZUL_SUAVE },
                { t: 'Dañados', n: danadosHistorial, icono: 'alerta', color: ROJO, fondo: ROJO_SUAVE },
                { t: 'Sin guía', n: sinGuiaHistorial, icono: 'bolsa', color: AMBAR, fondo: AMBAR_SUAVE },
              ].map(c => (
                <div key={c.t} style={{ ...tarjeta, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><Burbuja nombre={c.icono} color={c.color} fondo={c.fondo} tam={34} /></div>
                  <div style={{ fontFamily: TITULOS, fontSize: 28, fontWeight: 800, color: c.n ? c.color : TINTA, lineHeight: 1.1, marginTop: 4 }}>{c.n}</div>
                  <div style={{ fontSize: 12, color: GRIS, fontWeight: 600 }}>{c.t}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              {cargandoHistorial ? (
                <p style={{ fontSize: 15, color: GRIS, textAlign: 'center', padding: 24, animation: 'latido 1s infinite' }}>Cargando…</p>
              ) : historial.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/perrito-bodega.png" alt="" style={{ width: 110, opacity: 0.9 }} />
                  <div style={{ fontFamily: TITULOS, fontSize: 19, fontWeight: 700, marginTop: 8 }}>Día tranquilo</div>
                  <div style={{ fontSize: 14, color: GRIS }}>No se registraron paquetes este día.</div>
                </div>
              ) : (
                <div style={{ ...tarjeta, overflow: 'hidden' }}>
                  <div style={{ marginTop: -1 }}>
                    {historial.map(p => <FilaPaquete key={p.id} p={p} onFoto={setFotoGrande} />)}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ── Navegación flotante abajo, al alcance del pulgar ── */}
      <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '0 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
        <div style={{ maxWidth: 448, margin: '0 auto', background: '#fff', borderRadius: 26, boxShadow: '0 10px 30px rgba(47,77,112,0.22)', padding: 6, display: 'flex', gap: 6, pointerEvents: 'auto', border: `1px solid ${LINEA}` }}>
          {[['escanear', 'Escanear', 'escanear'], ['historial', 'Historial', 'historial']].map(([v, t, icono]) => {
            const activa = pestana === v
            return (
              <button key={v} className="toque"
                onClick={() => { if (v === 'historial') setDiaHistorial(fechaLocal()); if (v === 'escanear' && pestana !== 'escanear') reiniciar(); setPestana(v) }}
                style={{ flex: 1, minHeight: 56, border: 'none', borderRadius: 20, cursor: 'pointer', background: activa ? AZUL : 'transparent', color: activa ? '#fff' : GRIS, fontFamily: TITULOS, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: activa ? `0 3px 0 ${AZUL_OSCURO}` : 'none' }}>
                <Icono nombre={icono} tam={22} /> {t}
              </button>
            )
          })}
        </div>
      </nav>

      {fotoGrande && (
        <div onClick={() => setFotoGrande(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,26,34,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="Evidencia" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 18 }} />
          <div style={{ position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', right: 16, width: 44, height: 44, borderRadius: 22, background: '#fff', color: TINTA, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre="x" tam={22} grosor={2.8} />
          </div>
        </div>
      )}
    </div>
  )
}
