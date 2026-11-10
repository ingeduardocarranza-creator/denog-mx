'use client'

import { useState, useEffect } from 'react'

const VERDE = '#58a700', AZUL = '#1cb0f6', ROJO = '#e5484d'
const CARAS = [null, '😟', '😐', '😀']
const peso = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

// Lo que ve el colaborador como retroalimentación: cómo le fue su día anterior y el mensaje del admin.
export default function MiRetro({ tarjeta }) {
  const [d, setD] = useState(null)
  const [oculto, setOculto] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/jarvis/revision?mia=1').then(x => x.json()).then(r => { if (vivo && r?.ok) setD(r) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!d || oculto) return null
  const { ayer, comentario } = d
  const msg = comentario && !comentario.leido_en ? comentario : null
  // El resumen del día anterior se muestra solo si hay algo que contar y no ha sido cerrado hoy
  let visto = false
  try { visto = !!ayer && localStorage.getItem('jarvis_retro_visto') === `${ayer.fecha}:${new Date().toISOString().slice(0, 10)}` } catch {}
  if (!msg && (!ayer || visto)) return null

  const cerrar = async () => {
    setOculto(true)
    try { if (ayer) localStorage.setItem('jarvis_retro_visto', `${ayer.fecha}:${new Date().toISOString().slice(0, 10)}`) } catch {}
    if (msg) fetch('/api/jarvis/revision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'leido', id: msg.id }) }).catch(() => {})
  }
  const pct = ayer?.total ? Math.round((ayer.hechas / ayer.total) * 100) : 0
  return (
    <div style={{ ...tarjeta, marginBottom: 14, border: `2px solid ${msg ? AZUL : 'rgba(42,33,24,0.10)'}` }}>
      {msg && (
        <div style={{ marginBottom: ayer ? 12 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: AZUL }}>💬 MENSAJE DE LALO</div>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.35, marginTop: 4 }}>
            {msg.valoracion ? `${CARAS[msg.valoracion]} ` : ''}{msg.comentario || ['', 'Hay que mejorar', 'Más o menos', '¡Buen trabajo!'][msg.valoracion]}
          </div>
        </div>
      )}
      {ayer && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>TU ÚLTIMO TURNO</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, color: pct >= 80 ? VERDE : pct >= 50 ? '#b45309' : ROJO }}>
            {ayer.hechas} de {ayer.total} hechas{ayer.ventas.tickets > 0 ? ` · 💰 ${peso(ayer.ventas.monto)}` : ''}
          </div>
          {ayer.faltaron.length > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, opacity: .75, marginTop: 4, lineHeight: 1.4 }}>Faltó: {ayer.faltaron.join(' · ')}</div>
          )}
          {ayer.faltaron.length === 0 && pct === 100 && <div style={{ fontSize: 13, fontWeight: 800, color: VERDE, marginTop: 4 }}>¡Todo completo! 🎉</div>}
        </div>
      )}
      <button onClick={cerrar} style={{ display: 'block', margin: '12px auto 0', border: 0, background: 'transparent', color: AZUL, fontWeight: 900, fontSize: 14, cursor: 'pointer', minHeight: 40 }}>
        Entendido
      </button>
    </div>
  )
}
