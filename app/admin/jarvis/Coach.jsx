'use client'

import { useState, useEffect } from 'react'

const MORADO = '#7c5cff'

function Bloque({ icono, titulo, items, color }) {
  if (!items?.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.3, color, marginBottom: 4 }}>{icono} {titulo}</div>
      {items.map((t, i) => <div key={i} style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 }}>• {t}</div>)}
    </div>
  )
}

function Mensaje({ titulo, m }) {
  return (
    <div style={{ border: `2px solid ${MORADO}`, borderRadius: 18, padding: '14px 16px', background: 'rgba(124,92,255,0.07)', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: MORADO }}>🤖 {titulo}</div>
      {m.saludo && <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6, lineHeight: 1.3 }}>{m.saludo}</div>}
      <Bloque icono="🌟" titulo="LO EXCELENTE" items={m.excelente} color="#3f7a00" />
      <Bloque icono="🎯" titulo="A MEJORAR" items={m.mejorar} color="#d97706" />
      <Bloque icono="👥" titulo="EL EQUIPO" items={m.equipo} color={MORADO} />
      {m.reto && (
        <div style={{ marginTop: 12, background: MORADO, color: '#fff', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontWeight: 800, lineHeight: 1.4 }}>
          🔥 RETO: {m.reto}
        </div>
      )}
    </div>
  )
}

// Mensajes del coach: el admin ve su plan del día; el colaborador, su arranque y su cierre.
export function TarjetaCoach({ esAdmin }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    let vivo = true
    const cargar = () => fetch('/api/jarvis/coach').then(r => r.json()).then(j => { if (vivo && j?.ok) setD(j) }).catch(() => {})
    cargar()
    const t = setInterval(cargar, 10 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  if (!d) return null
  if (esAdmin) return d.admin_manana ? <Mensaje titulo="JARVIS · TU PLAN DEL DÍA" m={d.admin_manana} /> : null
  return (
    <>
      {d.cierre && <Mensaje titulo="JARVIS · CÓMO TERMINASTE TU TURNO" m={d.cierre} />}
      {d.arranque && !d.cierre && <Mensaje titulo="JARVIS · TU RETO DE HOY" m={d.arranque} />}
    </>
  )
}

// Para el admin: la retroalimentación que Jarvis dio a cada colaborador al cerrar turno.
export function CierresEquipo({ tarjeta }) {
  const [c, setC] = useState(null)
  useEffect(() => { fetch('/api/jarvis/coach?equipo=1').then(r => r.json()).then(j => j?.ok && setC(j.cierres)).catch(() => {}) }, [])
  if (!c?.length) return null
  return (
    <div style={{ ...tarjeta, marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: MORADO, marginBottom: 8 }}>🤖 RETROALIMENTACIÓN DE JARVIS AL CERRAR TURNO</div>
      {c.map(x => (
        <div key={x.usuario_id + x.fecha} style={{ borderTop: '1px solid rgba(42,33,24,0.1)', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{x.nombre} · {x.fecha}</div>
          {x.contenido.saludo && <div style={{ fontSize: 13, opacity: .8 }}>{x.contenido.saludo}</div>}
          {(x.contenido.excelente || []).map((t, i) => <div key={'e' + i} style={{ fontSize: 13, fontWeight: 700 }}>🌟 {t}</div>)}
          {(x.contenido.mejorar || []).map((t, i) => <div key={'m' + i} style={{ fontSize: 13, fontWeight: 700 }}>🎯 {t}</div>)}
          {x.contenido.reto && <div style={{ fontSize: 13, fontWeight: 800, color: MORADO }}>🔥 {x.contenido.reto}</div>}
        </div>
      ))}
    </div>
  )
}
