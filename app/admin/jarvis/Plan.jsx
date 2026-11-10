'use client'

import { useState, useEffect } from 'react'

const VERDE = '#58a700', VERDE_SOMBRA = '#3f7a00', AZUL = '#1cb0f6', ROJO = '#e5484d', AMBAR = '#e0a100'
const PRIO = { 1: { t: 'Alta', e: '🔴', c: ROJO }, 2: { t: 'Media', e: '🟡', c: AMBAR }, 3: { t: 'Baja', e: '🟢', c: VERDE } }
const peso = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const SUGERIDAS = [
  'Ofrecer un producto extra a cada cliente que pase por caja',
  'Escribirle a 5 clientes que no han recogido su pedido',
  'Acomodar al frente lo que más se vende',
  'Anotar lo que pidieron los clientes y no había',
]
const campo = { width: '100%', height: 44, borderRadius: 12, border: '2px solid rgba(42,33,24,0.12)', padding: '0 12px', fontSize: 15, background: 'transparent', color: 'inherit', boxSizing: 'border-box' }

async function enviar(cuerpo) {
  const r = await fetch('/api/jarvis/tareas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(x => x.json()).catch(() => null)
  return r || { ok: false, mensaje: 'Sin conexión' }
}

// Tu plan de trabajo: meta de venta del día y tareas con prioridad para el equipo.
export default function VistaPlan({ tarjeta }) {
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [meta, setMeta] = useState('')
  const vacio = { titulo: '', detalle: '', para_usuario: '', prioridad: 2, fecha_limite: '', es_venta: false, requiere_foto: false }
  const [f, setF] = useState(vacio)

  const [tick, setTick] = useState(0) // subirlo vuelve a cargar el plan
  useEffect(() => {
    let vivo = true
    fetch('/api/jarvis/tareas').then(x => x.json()).then(r => {
      if (!vivo) return
      if (r?.ok) { setD(r); setMeta(m => (m === '' && r.meta_venta ? String(r.meta_venta) : m)) } else setMsg(r?.mensaje || 'No se pudo cargar')
    }).catch(() => vivo && setMsg('Sin conexión'))
    return () => { vivo = false }
  }, [tick])

  const accion = async (cuerpo, ok) => {
    setOcupado(true); setMsg('')
    const r = await enviar(cuerpo)
    setOcupado(false)
    if (!r.ok) { setMsg(r.mensaje || 'No se pudo guardar'); return false }
    if (ok) { setMsg(ok); setTimeout(() => setMsg(''), 2500) }
    setTick(t => t + 1); return true
  }

  if (!d) return <div style={{ opacity: .6 }}>{msg || 'Cargando plan…'}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Meta de venta */}
      <div style={tarjeta}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>💰 META DE VENTA DIARIA (TIENDA)</div>
        <div style={{ display: 'flex', gap: 8, margin: '10px 0 6px' }}>
          <input inputMode="numeric" value={meta} onChange={e => setMeta(e.target.value.replace(/[^\d]/g, ''))} placeholder="Ej. 3000" style={campo} />
          <button disabled={ocupado || meta === ''} onClick={() => accion({ accion: 'meta_venta', monto: meta }, 'Meta guardada ✓')}
            style={{ height: 44, padding: '0 18px', border: 0, borderRadius: 12, background: VERDE, boxShadow: `0 3px 0 ${VERDE_SOMBRA}`, color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Guardar</button>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, opacity: .65, lineHeight: 1.4 }}>
          {d.promedio_30_dias
            ? `Referencia: en los últimos 30 días, los días con venta promediaron ${peso(d.promedio_30_dias)} (${d.dias_con_venta_30} días). `
            : 'Aún no hay ventas de tienda para sugerirte una referencia. '}
          Aparece arriba de todo en la pantalla de ellos. Pon 0 para quitarla.
        </div>
      </div>

      {/* Nueva tarea */}
      <div style={tarjeta}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginBottom: 10 }}>➕ NUEVA TAREA</div>
        <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="¿Qué hay que hacer?" maxLength={120} style={{ ...campo, marginBottom: 8 }} />
        <input value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} placeholder="Detalle (opcional, cortito)" maxLength={300} style={{ ...campo, marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[1, 2, 3].map(p => (
            <button key={p} onClick={() => setF({ ...f, prioridad: p })} style={{
              flex: 1, minHeight: 42, borderRadius: 12, fontWeight: 900, fontSize: 14, cursor: 'pointer', color: 'inherit',
              border: `2px solid ${f.prioridad === p ? PRIO[p].c : 'rgba(42,33,24,0.12)'}`,
              background: f.prioridad === p ? `${PRIO[p].c}22` : 'transparent',
            }}>{PRIO[p].e} {PRIO[p].t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <select value={f.para_usuario} onChange={e => setF({ ...f, para_usuario: e.target.value })} style={{ ...campo, flex: 1 }}>
            <option value="">Para todos</option>
            {d.colaboradores.map(c => <option key={c.id} value={c.id}>{String(c.nombre).split(' ')[0]}</option>)}
          </select>
          <input type="date" value={f.fecha_limite} onChange={e => setF({ ...f, fecha_limite: e.target.value })} style={{ ...campo, flex: 1 }} aria-label="Fecha límite" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.es_venta} onChange={e => setF({ ...f, es_venta: e.target.checked })} style={{ width: 20, height: 20 }} />
          💰 Es de venta (sale primero en su lista)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.requiere_foto} onChange={e => setF({ ...f, requiere_foto: e.target.checked })} style={{ width: 20, height: 20 }} />
          📸 Pedir foto de evidencia (no la pueden marcar sin foto)
        </label>
        <button disabled={ocupado || !f.titulo.trim()} onClick={async () => { if (await accion({ accion: 'crear', ...f }, 'Tarea creada ✓')) setF(vacio) }}
          style={{ width: '100%', height: 48, border: 0, borderRadius: 14, background: VERDE, boxShadow: `0 4px 0 ${VERDE_SOMBRA}`, color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', opacity: ocupado || !f.titulo.trim() ? .55 : 1 }}>
          Mandar al equipo
        </button>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.3, opacity: .5, margin: '14px 0 6px' }}>IDEAS DE VENTA (toca para llenar)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SUGERIDAS.map(s => (
            <button key={s} onClick={() => setF({ ...f, titulo: s, es_venta: true, prioridad: 1 })}
              style={{ border: `2px solid ${AZUL}55`, background: `${AZUL}12`, color: 'inherit', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>{s}</button>
          ))}
        </div>
        {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: msg.includes('✓') ? VERDE : ROJO }}>{msg}</div>}
      </div>

      {/* Tareas activas */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, margin: '4px 0 8px' }}>PLAN ACTIVO · {d.tareas.length}</div>
        {d.tareas.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7, fontWeight: 700 }}>Aún no hay tareas en el plan. Crea la primera arriba.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.tareas.map(t => {
            const todos = t.avance.length > 0 && t.avance.every(a => a.hecha_en)
            return (
              <div key={t.id} style={{ ...tarjeta, padding: '12px 14px', borderLeft: `6px solid ${PRIO[t.prioridad].c}`, opacity: todos ? .6 : 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.3 }}>{t.es_venta ? '💰 ' : ''}{t.titulo}</div>
                    {t.detalle && <div style={{ fontSize: 13, fontWeight: 600, opacity: .7, marginTop: 2 }}>{t.detalle}</div>}
                  </div>
                  <button disabled={ocupado} onClick={() => accion({ accion: 'archivar', id: t.id }, 'Tarea archivada')}
                    style={{ border: 0, background: 'transparent', color: AZUL, fontWeight: 800, fontSize: 12, cursor: 'pointer', flex: 'none' }}>Archivar</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <select value={t.prioridad} disabled={ocupado} onChange={e => accion({ accion: 'prioridad', id: t.id, prioridad: Number(e.target.value) })}
                    style={{ height: 30, borderRadius: 8, border: '2px solid rgba(42,33,24,0.12)', background: 'transparent', color: 'inherit', fontWeight: 800, fontSize: 12 }}>
                    {[1, 2, 3].map(p => <option key={p} value={p}>{PRIO[p].e} {PRIO[p].t}</option>)}
                  </select>
                  {t.fecha_limite && <span style={{ fontSize: 12, fontWeight: 800, opacity: .65 }}>📅 {t.fecha_limite.slice(8, 10)}/{t.fecha_limite.slice(5, 7)}</span>}
                  {t.dia_unico && <span style={{ fontSize: 12, fontWeight: 800, opacity: .65 }}>📌 solo {t.dia_unico.slice(8, 10)}/{t.dia_unico.slice(5, 7)}</span>}
                  {t.requiere_foto && <span style={{ fontSize: 12, fontWeight: 800, opacity: .65 }}>📸 con foto</span>}
                  {t.avance.map(a => (
                    <span key={a.usuario_id} style={{ fontSize: 12, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: a.hecha_en ? `${VERDE}22` : 'rgba(42,33,24,0.07)', color: a.hecha_en ? VERDE_SOMBRA : 'inherit' }}>
                      {a.hecha_en ? '✅' : '⏳'} {String(a.nombre).split(' ')[0]}
                    </span>
                  ))}
                </div>
                {t.avance.some(a => a.foto_url) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {t.avance.filter(a => a.foto_url).map(a => (
                      <a key={a.usuario_id} href={a.foto_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit', textAlign: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.foto_url} alt={`Evidencia de ${a.nombre}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '2px solid rgba(42,33,24,0.12)', display: 'block' }} />
                        <div style={{ fontSize: 11, fontWeight: 800, opacity: .7, marginTop: 2 }}>{String(a.nombre).split(' ')[0]}</div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
