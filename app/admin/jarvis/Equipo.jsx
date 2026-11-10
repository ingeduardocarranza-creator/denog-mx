'use client'

import { useState, useEffect } from 'react'

const VERDE = '#58a700', VERDE_SOMBRA = '#3f7a00', AZUL = '#1cb0f6', ROJO = '#e5484d', AMBAR = '#e0a100'
const CARAS = [null, { e: '😟', t: 'Mal' }, { e: '😐', t: 'Regular' }, { e: '😀', t: 'Bien' }]
const peso = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const letra = (f) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${f}T12:00:00Z`).getUTCDay()]
const cuando = (f, hoy) => {
  if (f === hoy) return 'hoy'
  const d = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000)
  return d(hoy, f) === 1 ? 'ayer' : `el ${f.slice(8, 10)}/${f.slice(5, 7)}`
}

function Fila({ t, color, nota }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid rgba(42,33,24,0.07)' }}>
      <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{t.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{t.es_venta && t.emoji !== '💰' ? '💰 ' : ''}{t.titulo}</div>
        {(nota || t.meta) && (
          <div style={{ fontSize: 12, fontWeight: 700, color: color || 'inherit', opacity: color ? 1 : .6 }}>
            {t.meta ? `${t.actual}/${t.meta}` : ''}{t.meta && nota ? ' · ' : ''}{nota}
          </div>
        )}
      </div>
      {t.foto_url && (
        <a href={t.foto_url} target="_blank" rel="noreferrer" style={{ flex: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.foto_url} alt={`Evidencia: ${t.titulo}`} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, display: 'block', border: '2px solid rgba(42,33,24,0.12)' }} />
        </a>
      )}
    </div>
  )
}

function Retroalimentacion({ p, fecha, hoy, alGuardar }) {
  const [val, setVal] = useState(p.comentario?.valoracion || null)
  const [txt, setTxt] = useState(p.comentario?.comentario || '')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const nombre = String(p.nombre).split(' ')[0]
  const guardar = async () => {
    setOcupado(true); setMsg('')
    const r = await fetch('/api/jarvis/revision', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'comentar', usuario_id: p.usuario_id, fecha, valoracion: val, comentario: txt }) }).then(x => x.json()).catch(() => null)
    setOcupado(false)
    if (!r?.ok) { setMsg(r?.mensaje || 'No se pudo enviar'); return }
    setMsg('Enviado ✓'); alGuardar()
  }
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid rgba(42,33,24,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, opacity: .55, marginBottom: 8 }}>💬 DECIRLE A {nombre.toUpperCase()} CÓMO LE FUE {cuando(fecha, hoy).toUpperCase()}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {[3, 2, 1].map(v => (
          <button key={v} onClick={() => setVal(v)} style={{
            flex: 1, minHeight: 44, borderRadius: 12, fontWeight: 900, fontSize: 14, cursor: 'pointer', color: 'inherit',
            border: `2px solid ${val === v ? AZUL : 'rgba(42,33,24,0.12)'}`, background: val === v ? 'rgba(28,176,246,0.14)' : 'transparent',
          }}>{CARAS[v].e} {CARAS[v].t}</button>
        ))}
      </div>
      <textarea value={txt} onChange={e => setTxt(e.target.value)} maxLength={400} rows={2} placeholder="Un mensaje cortito (opcional). Ej. Buen día, solo faltó contar el inventario."
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '2px solid rgba(42,33,24,0.12)', padding: 10, fontSize: 14, background: 'transparent', color: 'inherit', fontFamily: 'inherit', resize: 'vertical' }} />
      <button disabled={ocupado || (!val && !txt.trim())} onClick={guardar}
        style={{ width: '100%', height: 46, marginTop: 8, border: 0, borderRadius: 14, background: VERDE, boxShadow: `0 4px 0 ${VERDE_SOMBRA}`, color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', opacity: ocupado || (!val && !txt.trim()) ? .5 : 1 }}>
        {p.comentario ? 'Actualizar mensaje' : `Enviar a ${nombre}`}
      </button>
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6, color: msg.includes('✓') ? VERDE : ROJO }}>{msg}</div>
      {p.comentario && !msg && (
        <div style={{ fontSize: 12, fontWeight: 800, opacity: .65, marginTop: 6 }}>
          {p.comentario.leido_en ? `✅ ${nombre} ya lo vio` : `⏳ ${nombre} aún no lo ve`}
        </div>
      )}
    </div>
  )
}

function Tarjeta({ p, fecha, hoy, tarjeta, elegirDia, alGuardar }) {
  const nombre = String(p.nombre).split(' ').slice(0, 2).join(' ')
  const { hechas, total } = p.resumen
  const pct = total ? Math.round((hechas / total) * 100) : 0
  const color = !total ? 'rgba(42,33,24,0.25)' : pct >= 80 ? VERDE : pct >= 50 ? AMBAR : ROJO
  const todas = [...p.puntuales, ...p.fijas]
  const falto = todas.filter(t => t.estado === 'falto' || t.estado === 'atrasada')
  const porHacer = todas.filter(t => t.estado === 'pendiente')
  const hizo = todas.filter(t => t.estado === 'hecha')
  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{nombre}</div>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: .6 }}>{p.trabaja ? `Turno ${p.turno.desde}–${p.turno.hasta}` : `Descansó ${cuando(fecha, hoy)}`}</div>
      </div>

      {p.trabaja && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 6px' }}>
            <div style={{ fontSize: 34, fontWeight: 900, color, lineHeight: 1 }}>{hechas}<span style={{ fontSize: 18, opacity: .55 }}> de {total}</span></div>
            <div style={{ fontSize: 13, fontWeight: 800, opacity: .7 }}>hechas {cuando(fecha, hoy)}</div>
          </div>
          <div style={{ height: 12, borderRadius: 6, background: 'rgba(42,33,24,0.10)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: 12, background: color, transition: 'width .5s' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: 'rgba(88,167,0,0.14)' }}>
              💰 {p.ventas.tickets} {p.ventas.tickets === 1 ? 'venta' : 'ventas'} · {peso(p.ventas.monto)}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: p.apertura ? 'rgba(28,176,246,0.14)' : 'rgba(229,72,77,0.14)' }}>
              {p.apertura ? `📱 Abrió Jarvis ${p.apertura.primera}` : '📱 No abrió Jarvis'}
            </span>
          </div>

          {falto.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: ROJO, marginBottom: 2 }}>❌ NO HIZO · {falto.length}</div>
              {falto.map(t => <Fila key={t.id} t={t} color={ROJO} nota={t.estado === 'atrasada' ? `atrasada desde ${t.hora === 'plan' ? 'antes' : t.hora}` : t.hora === 'plan' ? 'del plan' : `tocaba ${t.hora}`} />)}
            </div>
          )}
          {porHacer.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, opacity: .55, marginBottom: 2 }}>⏳ POR HACER · {porHacer.length}</div>
              {porHacer.map(t => <Fila key={t.id} t={t} nota={t.hora === 'plan' ? 'del plan' : `a las ${t.hora}`} />)}
            </div>
          )}
          {hizo.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, color: VERDE_SOMBRA, marginBottom: 2 }}>✅ HIZO · {hizo.length}</div>
              {hizo.map(t => <Fila key={t.id} t={t} nota={t.hecha_a ? `a las ${t.hecha_a}` : ''} />)}
            </div>
          )}
          {todas.length === 0 && <div style={{ marginTop: 12, fontSize: 13, opacity: .65, fontWeight: 700 }}>No tenía actividades ese día.</div>}
        </>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        {p.semana.map(d => {
          const r = d.total ? d.hechas / d.total : null
          const c = r === null ? 'rgba(42,33,24,0.08)' : r >= 0.8 ? VERDE : r >= 0.5 ? AMBAR : ROJO
          const sel = d.fecha === fecha
          return (
            <button key={d.fecha} onClick={() => elegirDia(d.fecha)} style={{ flex: 1, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'inherit' }}>
              <div style={{ height: 30, borderRadius: 8, background: c, color: r === null ? 'inherit' : '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: sel ? `3px solid ${AZUL}` : 'none', outlineOffset: 1 }}>
                {r === null ? '–' : `${d.hechas}/${d.total}`}
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, opacity: sel ? 1 : .55, marginTop: 2 }}>{d.fecha === hoy ? 'Hoy' : letra(d.fecha)}</div>
            </button>
          )
        })}
      </div>

      {p.trabaja && <Retroalimentacion key={`${p.usuario_id}-${fecha}-${p.comentario?.creado_en || ''}`} p={p} fecha={fecha} hoy={hoy} alGuardar={alGuardar} />}
    </div>
  )
}

// Lo primero que ve el admin: qué hizo y qué no cada colaborador, y cómo darle retroalimentación.
export default function VistaEquipoNueva({ tarjeta }) {
  const [fecha, setFecha] = useState('')
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    const cargar = () => fetch(`/api/jarvis/revision${fecha ? `?fecha=${fecha}` : ''}`).then(x => x.json()).then(r => {
      if (!vivo) return
      if (r?.ok) { setD(r); setMsg('') } else setMsg(r?.mensaje || 'No se pudo cargar')
    }).catch(() => vivo && setMsg('Sin conexión'))
    cargar()
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar() }, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [fecha, tick])

  if (!d) return <div style={{ opacity: .6 }}>{msg || 'Cargando equipo…'}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, opacity: .65 }}>
        Viendo: <b>{d.fecha === d.hoy ? 'hoy' : `${letra(d.fecha)} ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`}</b> · toca un día de la semana para cambiarlo
        {msg && <span style={{ color: ROJO }}> · {msg}</span>}
      </div>
      {d.equipo.map(p => (
        <Tarjeta key={p.usuario_id} p={p} fecha={d.fecha} hoy={d.hoy} tarjeta={tarjeta} elegirDia={setFecha} alGuardar={() => setTick(t => t + 1)} />
      ))}
      {d.equipo.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7 }}>Aún no hay colaboradores con horario.</div>}
    </div>
  )
}
