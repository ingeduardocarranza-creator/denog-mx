'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { limpiarGuia, detectarPaqueteria } from '../../lib/bodega/guias'

// Pantalla única del usuario de bodega (Nogales, AZ). Flujo por paquete:
//   1) escanear la guía con la cámara  2) 1 a 3 fotos  3) guardar → vuelve a 1.
// Las fotos se suben en cuanto se toman (mientras toma la siguiente), así al
// tocar "Guardar" ya están arriba y el registro es instantáneo.

const AZUL = '#466D9B'
const AZUL_OSCURO = '#2f4d70'
const CREMA = '#FCE5D6'
const VERDE = '#15803d'
const ROJO = '#b91c1c'
const MAX_FOTOS = 3

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })

// Reduce la foto a 1600px y JPEG 70% para que suba rápido con poca señal.
async function comprimir(file) {
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7))
    return blob || file
  } catch {
    return file
  }
}

export default function Bodega() {
  const [paso, setPaso] = useState('escanear') // escanear | fotos | listo
  const [guia, setGuia] = useState('')
  const [manual, setManual] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)
  const [fotos, setFotos] = useState([]) // { id, preview, path, estado: subiendo|ok|error }
  const [nota, setNota] = useState('')
  const [mostrarNota, setMostrarNota] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [hoy, setHoy] = useState([])
  const [errorCamara, setErrorCamara] = useState('')
  const [nombre, setNombre] = useState('')

  const videoRef = useRef(null)
  const lectorRef = useRef(null)
  const controlesRef = useRef(null)
  const leidoRef = useRef(false)
  const inputFotoRef = useRef(null)

  const avisar = (tipo, texto, ms = 5000) => {
    setAviso({ tipo, texto })
    if (ms) setTimeout(() => setAviso(null), ms)
  }

  const cargarHoy = useCallback(async () => {
    try {
      const r = await fetch('/api/bodega/paquetes')
      const d = await r.json()
      if (d.ok) setHoy(d.paquetes)
    } catch {}
  }, [])

  const detenerCamara = () => {
    controlesRef.current?.stop()
    controlesRef.current = null
  }

  const elegirGuia = (texto) => {
    const g = limpiarGuia(texto)
    if (g.length < 6) return avisar('error', 'Ese número de guía no es válido.')
    const yaHoy = hoy.find(p => p.numero_guia === g)
    if (yaHoy) {
      avisar('error', `Esa guía ya se registró hoy a las ${hora(yaHoy.recibido_en)}.`)
      // Pausa para no repetir el aviso mientras la cámara sigue viendo la misma guía.
      setTimeout(() => { leidoRef.current = false }, 2500)
      return
    }
    detenerCamara()
    if (navigator.vibrate) navigator.vibrate(80)
    setGuia(g)
    setMostrarManual(false)
    setManual('')
    setPaso('fotos')
  }

  // El callback del lector se crea una sola vez; con este ref siempre usa la
  // versión más nueva de elegirGuia (con la lista de hoy actualizada).
  const elegirGuiaRef = useRef(elegirGuia)
  useEffect(() => { elegirGuiaRef.current = elegirGuia })

  const iniciarCamara = useCallback(async () => {
    setErrorCamara('')
    leidoRef.current = false
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (!lectorRef.current) lectorRef.current = new BrowserMultiFormatReader()
      await new Promise(r => setTimeout(r, 0))
      if (!videoRef.current) return
      controlesRef.current = await lectorRef.current.decodeFromConstraints(
        { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
        videoRef.current,
        (resultado) => {
          if (!resultado || leidoRef.current) return
          leidoRef.current = true
          elegirGuiaRef.current(resultado.getText())
        }
      )
    } catch (err) {
      setErrorCamara('No se pudo abrir la cámara. Revisa que el navegador tenga permiso, o escribe la guía a mano.')
    }
  }, [])

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem('cliente') || 'null')
      if (d?.nombre) setNombre(d.nombre.split(' ')[0])
    } catch {}
    cargarHoy()
    return () => detenerCamara()
  }, [cargarHoy])

  useEffect(() => {
    if (paso === 'escanear') iniciarCamara()
    else detenerCamara()
  }, [paso, iniciarCamara])

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

  const quitarFoto = (id) => setFotos(f => f.filter(x => x.id !== id))

  const reiniciar = () => {
    fotos.forEach(f => URL.revokeObjectURL(f.preview))
    setFotos([])
    setGuia('')
    setNota('')
    setMostrarNota(false)
    setPaso('escanear')
  }

  const fotosOk = fotos.filter(f => f.estado === 'ok')
  const subiendo = fotos.some(f => f.estado === 'subiendo')

  const guardar = async () => {
    if (subiendo) return avisar('error', 'Espera a que terminen de subir las fotos.')
    if (!fotosOk.length) return avisar('error', 'Toma al menos una foto.')
    setGuardando(true)
    try {
      const r = await fetch('/api/bodega/paquetes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_guia: guia, fotos: fotosOk.map(f => f.path), notas: nota }),
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
      setHoy(h => [d.paquete, ...h])
      setPaso('listo')
      if (navigator.vibrate) navigator.vibrate([60, 40, 60])
      setTimeout(reiniciar, 1200)
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

  const boton = (fondo, extra = {}) => ({
    width: '100%', padding: '16px', borderRadius: 14, border: 'none', fontSize: 18, fontWeight: 700,
    color: '#fff', background: fondo, cursor: 'pointer', ...extra,
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f6f4f1', color: '#2a2118', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ background: AZUL, color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}>
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

        {paso === 'escanear' && (
          <>
            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', left: '8%', right: '8%', top: '38%', height: '24%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 10 }} />
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 14, textShadow: '0 1px 3px #000' }}>
                Apunta al código de barras de la guía
              </div>
            </div>
            {errorCamara && <p style={{ color: ROJO, fontSize: 14, marginTop: 10 }}>{errorCamara}</p>}

            {!mostrarManual ? (
              <button onClick={() => setMostrarManual(true)} style={{ marginTop: 14, width: '100%', background: 'transparent', border: `1.5px solid ${AZUL}`, color: AZUL, borderRadius: 12, padding: 12, fontSize: 15, fontWeight: 600 }}>
                Escribir la guía a mano
              </button>
            ) : (
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <input
                  autoFocus value={manual} onChange={e => setManual(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && elegirGuia(manual)}
                  placeholder="1Z999AA10123456784" autoCapitalize="characters" autoCorrect="off"
                  style={{ flex: 1, padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #cfc7bd', background: '#fff' }}
                />
                <button onClick={() => elegirGuia(manual)} style={{ ...boton(AZUL, { width: 'auto', padding: '0 18px', fontSize: 16 }) }}>OK</button>
              </div>
            )}
          </>
        )}

        {paso === 'fotos' && (
          <>
            <div style={{ background: '#e8f5ec', color: VERDE, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>GUÍA · {detectarPaqueteria(guia)}</div>
              <div style={{ fontSize: 19, fontWeight: 700, wordBreak: 'break-all' }}>{guia}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
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

            <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} style={{ display: 'none' }} />

            {fotos.length < MAX_FOTOS && (
              <button onClick={() => inputFotoRef.current?.click()} style={{ ...boton(fotos.length ? '#fff' : AZUL, { marginTop: 14, color: fotos.length ? AZUL : '#fff', border: fotos.length ? `1.5px solid ${AZUL}` : 'none' }) }}>
                {fotos.length ? `Otra foto (${fotos.length}/${MAX_FOTOS})` : 'Tomar foto'}
              </button>
            )}

            {!mostrarNota ? (
              <button onClick={() => setMostrarNota(true)} style={{ marginTop: 10, background: 'none', border: 'none', color: AZUL, fontSize: 14, padding: 6 }}>
                + Agregar nota (caja dañada, abierta…)
              </button>
            ) : (
              <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Caja golpeada en una esquina" maxLength={300}
                style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #cfc7bd', background: '#fff' }} />
            )}

            {fotos.length > 0 && (
              <button onClick={guardar} disabled={guardando} style={{ ...boton(VERDE, { marginTop: 14, opacity: guardando || subiendo ? 0.6 : 1 }) }}>
                {guardando ? 'Guardando…' : subiendo ? 'Subiendo fotos…' : 'Guardar paquete'}
              </button>
            )}

            <button onClick={reiniciar} style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: '#8a7f73', fontSize: 14, padding: 8 }}>
              Cancelar y escanear otra
            </button>
          </>
        )}

        {paso === 'listo' && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 36, background: VERDE, color: '#fff', fontSize: 40, lineHeight: '72px', margin: '0 auto' }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 14 }}>Paquete registrado</div>
            <div style={{ fontSize: 14, color: '#8a7f73', marginTop: 4 }}>Abriendo la cámara para el siguiente…</div>
          </div>
        )}

        <section style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#8a7f73', marginBottom: 6 }}>REGISTRADOS HOY</div>
          {hoy.length === 0 ? (
            <p style={{ fontSize: 14, color: '#8a7f73' }}>Aún no hay paquetes registrados hoy.</p>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e7e1d9' }}>
              {hoy.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderTop: i ? '1px solid #f0ebe4' : 'none', fontSize: 14 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    …{p.numero_guia.slice(-8)} <span style={{ color: '#8a7f73', fontFamily: 'inherit' }}>{p.paqueteria}</span>
                  </span>
                  <span style={{ color: '#8a7f73', flexShrink: 0 }}>{hora(p.recibido_en)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
