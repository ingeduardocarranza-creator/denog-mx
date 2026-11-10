'use client'

import { useState, useEffect } from 'react'

const VERDE = '#58a700', AZUL = '#1cb0f6', NARANJA = '#ff9600', ROJO = '#e5484d'
const peso = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const letra = (f) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${f}T12:00:00Z`).getUTCDay()]
const hora = (ts) => ts ? new Date(ts).toLocaleString('es-MX', { timeZone: 'America/Hermosillo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const colorPct = (p) => p == null ? 'inherit' : p >= 70 ? VERDE : p >= 40 ? NARANJA : ROJO

function Dato({ t, v, sub, color }) {
  return (
    <div style={{ flex: '1 1 45%', minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, opacity: .5 }}>{t}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{v}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, opacity: .6 }}>{sub}</div>}
    </div>
  )
}

// Cómo va el equipo: cumplimiento, uso de Jarvis y ventas (tienda, sin encargos).
export default function VistaEstadisticas({ tarjeta }) {
  const [dias, setDias] = useState(14)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let vivo = true
    fetch(`/api/jarvis/estadisticas?dias=${dias}`).then(r => r.json()).then(j => { if (!vivo) return; if (j?.ok) { setD(j); setErr('') } else setErr(j?.mensaje || 'No se pudo cargar') }).catch(() => vivo && setErr('Sin conexión'))
    return () => { vivo = false }
  }, [dias])

  if (err && !d) return <div style={{ color: ROJO, fontWeight: 800 }}>{err}</div>
  if (!d) return <div style={{ opacity: .6 }}>Cargando números…</div>
  const maxTienda = Math.max(d.meta || 0, ...d.tienda.map(x => x.total), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[7, 14, 30].map(n => (
          <button key={n} onClick={() => setDias(n)} style={{
            flex: 1, minHeight: 38, borderRadius: 10, fontWeight: 900, fontSize: 13, cursor: 'pointer', color: 'inherit',
            border: `2px solid ${dias === n ? AZUL : 'rgba(42,33,24,0.12)'}`, background: dias === n ? 'rgba(28,176,246,0.12)' : 'transparent',
          }}>{n} días</button>
        ))}
      </div>

      {/* Tienda por día contra la meta */}
      <div style={tarjeta}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>🏪 VENTA DE TIENDA POR DÍA{d.meta ? ` · META ${peso(d.meta)}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, marginTop: 12, position: 'relative' }}>
          {d.meta && <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(d.meta / maxTienda) * 100}%`, borderTop: `2px dashed ${NARANJA}`, pointerEvents: 'none' }} />}
          {d.tienda.map(x => (
            <div key={x.fecha} title={`${x.fecha}: ${peso(x.total)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${Math.max(2, (x.total / maxTienda) * 100)}%`, background: d.meta && x.total >= d.meta ? VERDE : AZUL, borderRadius: '4px 4px 0 0', opacity: x.total ? 1 : .25 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
          {d.tienda.map(x => <div key={x.fecha} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 800, opacity: .5 }}>{letra(x.fecha)}</div>)}
        </div>
        {d.meta && <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 8, opacity: .75 }}>Días que se llegó a la meta: {d.tienda.filter(x => x.total >= d.meta).length} de {d.tienda.length}</div>}
      </div>

      {d.colaboradores.map(c => {
        const r = c.resumen
        const usoPct = r.dias_con_turno ? Math.round((r.dias_que_abrio / r.dias_con_turno) * 100) : null
        return (
          <div key={c.usuario_id} style={tarjeta}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>{String(c.nombre).split(' ')[0]}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Dato t="CUMPLIMIENTO" v={r.cumplimiento_pct == null ? '—' : `${r.cumplimiento_pct}%`} color={colorPct(r.cumplimiento_pct)} sub="actividades fijas hechas" />
              <Dato t="ABRIÓ JARVIS" v={`${r.dias_que_abrio}/${r.dias_con_turno}`} color={colorPct(usoPct)} sub="días con turno" />
              <Dato t="VENDIÓ (SUYO)" v={peso(r.vendido)} sub="tienda, registrado a su nombre" />
              <Dato t="TIENDA EN SU TURNO" v={peso(r.vendido_en_turno)} sub="todo el mostrador en su horario" />
              <Dato t="TAREAS DEL PLAN" v={`${r.puntuales_hechas}/${r.puntuales_asignadas}`} sub="hechas / asignadas" />
              <Dato t="MENSAJES VISTOS" v={`${r.mensajes_vistos}/${r.mensajes_generados}`} sub={`última vez: ${hora(r.ultima_apertura)}`} />
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 14 }}>
              {c.dias.map(x => {
                const sinTurno = !x.turno
                const pct = x.total ? x.hechas / x.total : 0
                return (
                  <div key={x.fecha} title={`${x.fecha}${x.turno ? ` · turno ${x.turno}` : ' · sin turno'} · ${x.hechas}/${x.total} · abrió ${x.aperturas}×`} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 34, borderRadius: 6, background: sinTurno ? 'rgba(42,33,24,0.05)' : `rgba(88,167,0,${0.12 + pct * 0.88})`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: 10, fontWeight: 900, paddingBottom: 2 }}>
                      {!sinTurno && (x.abrio ? '' : '·')}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, opacity: .5, marginTop: 2 }}>{letra(x.fecha)}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, opacity: .55, marginTop: 6 }}>Verde más fuerte = más actividades hechas. Un punto (·) = ese día con turno no abrió Jarvis. Gris = sin turno.</div>
          </div>
        )
      })}
      <div style={{ fontSize: 11.5, fontWeight: 700, opacity: .55, lineHeight: 1.4 }}>
        Las ventas son solo de tienda (mostrador); los encargos no se mezclan aquí. &quot;Visto&quot; significa que el mensaje se mostró en su pantalla; antes de hoy no se registraba, por eso los primeros días salen en cero.
      </div>
    </div>
  )
}
