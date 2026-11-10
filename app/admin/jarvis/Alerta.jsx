'use client'

import { useEffect, useRef, useState } from 'react'

const NARANJA = '#ff9600', ROJO = '#e5484d'
const CADA_MIN = 10 // cada cuánto vuelve a insistir si la dejan para después

// Insiste hasta que lo urgente se haga: tareas de prioridad alta, de venta, o
// cualquier tarea que ya pasó de su hora. Si dicen "ahorita", vuelve a los 10 min.
export default function AlertaInsistente({ tareas, onIr }) {
  const urgentes = tareas.filter(t => t.estado === 'pendiente' && t.toca && (t.es_venta || (t.puntual && t.prioridad === 1) || t.vencida))
  const otras = tareas.filter(t => t.estado === 'pendiente' && t.toca).length
  const [pospuesta, setPospuesta] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const vistaUna = useRef(false)

  useEffect(() => { const i = setInterval(() => setAhora(Date.now()), 15000); return () => clearInterval(i) }, [])

  const hay = urgentes.length > 0 || otras >= 3
  const visible = hay && ahora >= pospuesta
  useEffect(() => {
    // Vibra (en celulares) cada vez que reaparece, no en cada refresco.
    if (visible && !vistaUna.current) { vistaUna.current = true; try { navigator.vibrate?.([250, 120, 250]) } catch {} }
    if (!visible) vistaUna.current = false
  }, [visible])
  useEffect(() => {
    if (!visible) return
    const base = document.title.replace(/^🔔 /, '')
    document.title = `🔔 ${base}`
    return () => { document.title = base }
  }, [visible])

  if (!visible) return null
  const primera = urgentes[0] || tareas.find(t => t.estado === 'pendiente' && t.toca)
  const etiqueta = urgentes.length
    ? `${urgentes.length} ${urgentes.length === 1 ? 'tarea urgente' : 'tareas urgentes'}`
    : `${otras} actividades esperando`
  return (
    <div role="alert" style={{
      position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 60, maxWidth: 536, margin: '0 auto',
      background: urgentes.length ? ROJO : NARANJA, color: '#fff', borderRadius: 18, padding: '12px 14px',
      boxShadow: '0 6px 0 rgba(0,0,0,0.18), 0 10px 30px rgba(0,0,0,0.25)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .9 }}>🔔 JARVIS INSISTE · {etiqueta.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 900, margin: '4px 0 10px', lineHeight: 1.25 }}>
        {primera?.emoji} {primera?.titulo}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { onIr?.(primera); setPospuesta(Date.now() + 60 * 1000) }}
          style={{ flex: 1, height: 44, border: 0, borderRadius: 12, background: '#fff', color: urgentes.length ? ROJO : '#b45309', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>
          Voy a hacerla
        </button>
        <button onClick={() => setPospuesta(Date.now() + CADA_MIN * 60 * 1000)}
          style={{ height: 44, padding: '0 14px', border: '2px solid rgba(255,255,255,0.7)', borderRadius: 12, background: 'transparent', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
          Ahorita ({CADA_MIN} min)
        </button>
      </div>
    </div>
  )
}
