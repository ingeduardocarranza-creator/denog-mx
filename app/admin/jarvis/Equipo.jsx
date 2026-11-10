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


async function llamar(cuerpo) {
  const r = await fetch('/api/jarvis/equipo-lista', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(x => x.json()).catch(() => null)
  return r || { ok: false, mensaje: 'Sin conexión' }
}
const IDEAS_DIA = [
  '📦 Llegó paquetería: recibirla, revisarla y acomodarla',
  '🏷️ Etiquetar y acomodar la mercancía nueva',
  '📲 Avisar a clientes que ya llegó su pedido',
]
const campo = { width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 10, border: '2px solid rgba(42,33,24,0.12)', padding: '0 10px', fontSize: 14, background: 'transparent', color: 'inherit', fontFamily: 'inherit' }
const botonMini = { minWidth: 34, height: 34, borderRadius: 8, border: '2px solid rgba(42,33,24,0.12)', background: 'transparent', color: 'inherit', fontWeight: 900, fontSize: 14, cursor: 'pointer', padding: 0 }

// Editar la lista de un colaborador: arrastrar para ordenar, editar, quitar, mover y agregar.
function Editor({ p, otros, alGuardar }) {
  const nombre = String(p.nombre).split(' ')[0]
  const [lista, setLista] = useState(p.lista)
  const [arrastrando, setArrastrando] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [conf, setConf] = useState(null)
  const [form, setForm] = useState({ titulo: '', detalle: '', hora: '', requiere_foto: false })
  const [nuevo, setNuevo] = useState({ titulo: '', solo_hoy: true, requiere_foto: false, es_venta: false })
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const accion = async (cuerpo, ok) => {
    setOcupado(true); setMsg('')
    const r = await llamar({ usuario_id: p.usuario_id, ...cuerpo })
    setOcupado(false)
    if (!r.ok) { setMsg(r.mensaje || 'No se pudo guardar'); return false }
    if (ok) setMsg(ok)
    alGuardar(); return true
  }
  const guardarOrden = async (n) => { const r = await llamar({ accion: 'orden', usuario_id: p.usuario_id, items: n.map(t => t.id) }); setMsg(r.ok ? 'Orden guardado ✓' : (r.mensaje || 'No se pudo guardar el orden')) }
  const poner = (n) => { setLista(n); guardarOrden(n) }
  const subir = (i, d) => { const j = i + d; if (j < 0 || j >= lista.length) return; const n = [...lista];[n[i], n[j]] = [n[j], n[i]]; poner(n) }
  const soltar = (i) => {
    if (arrastrando === null || arrastrando === i) { setArrastrando(null); return }
    const n = [...lista]; const [x] = n.splice(arrastrando, 1); n.splice(i, 0, x); setArrastrando(null); poner(n)
  }
  const abrir = (t) => { setConf(null); setAbierto(abierto === t.id ? null : t.id); setForm({ titulo: t.titulo, detalle: t.detalle || '', hora: t.puntual ? '' : t.hora, requiere_foto: !!t.requiere_foto, meta: t.meta ? String(t.meta) : '' }) }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: .65, lineHeight: 1.4, marginBottom: 8 }}>
        Arrastra ☰ o usa ▲▼: lo de arriba es lo más importante y le sale primero a {nombre}.
      </div>
      {lista.map((t, i) => (
        <div key={t.id} draggable onDragStart={() => setArrastrando(i)} onDragOver={e => e.preventDefault()} onDrop={() => soltar(i)} onDragEnd={() => setArrastrando(null)}
          style={{ borderTop: '1px solid rgba(42,33,24,0.08)', padding: '6px 0', opacity: arrastrando === i ? .45 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div title="Arrastrar" style={{ cursor: 'grab', fontSize: 18, opacity: .5, width: 22, textAlign: 'center', userSelect: 'none' }}>☰</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{t.estado === 'hecha' ? '✅ ' : ''}{t.emoji} {t.titulo}</div>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: .55 }}>
                {t.puntual ? (t.solo_hoy ? '📌 solo hoy' : '🗓️ del plan') : `fija · ${t.hora}`}{t.requiere_foto ? ' · 📸 con foto' : ''}
              </div>
            </div>
            <button type="button" aria-label="Subir" style={botonMini} onClick={() => subir(i, -1)}>▲</button>
            <button type="button" aria-label="Bajar" style={botonMini} onClick={() => subir(i, 1)}>▼</button>
            <button type="button" aria-label="Editar" style={botonMini} onClick={() => abrir(t)}>✏️</button>
            <button type="button" aria-label="Quitar" style={botonMini} onClick={() => { setAbierto(null); setConf(conf === t.id ? null : t.id) }}>🗑</button>
          </div>
          {conf === t.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px 28px', fontSize: 13, fontWeight: 800 }}>
              ¿Quitar de la lista?
              <button disabled={ocupado} onClick={async () => { if (await accion({ accion: 'quitar', id: t.id }, 'Quitada ✓')) setConf(null) }} style={{ ...botonMini, padding: '0 12px', background: ROJO, color: '#fff', borderColor: ROJO }}>Sí, quitar</button>
              <button onClick={() => setConf(null)} style={{ ...botonMini, padding: '0 12px' }}>No</button>
            </div>
          )}
          {abierto === t.id && (
            <div style={{ margin: '8px 0 4px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} maxLength={120} placeholder="Nombre de la actividad" style={campo} />
              <input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })} maxLength={300} placeholder="Detalle (opcional)" style={campo} />
              {!t.puntual && t.meta > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}>
                  Cantidad que debe hacer
                  <input type="number" min="1" max="50" value={form.meta} style={{ ...campo, width: 80 }}
                    onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); setForm({ ...form, meta: v, titulo: v ? form.titulo.replace(/\d+/, v) : form.titulo }) }} />
                </label>
              )}
              {!t.puntual && <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} style={campo} aria-label="Hora" />}
              {t.puntual && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800 }}>
                  <input type="checkbox" checked={form.requiere_foto} onChange={e => setForm({ ...form, requiere_foto: e.target.checked })} style={{ width: 18, height: 18 }} /> 📸 Pedir foto de evidencia
                </label>
              )}
              {!t.puntual && <div style={{ fontSize: 11, fontWeight: 700, opacity: .6 }}>El cambio aplica todos los días que le toca esta actividad.</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button disabled={ocupado || !form.titulo.trim()} onClick={async () => { if (await accion({ accion: 'editar', id: t.id, ...form }, 'Guardado ✓')) setAbierto(null) }}
                  style={{ ...botonMini, padding: '0 14px', background: VERDE, color: '#fff', borderColor: VERDE }}>Guardar</button>
                {t.puntual && (
                  <button disabled={ocupado} onClick={() => accion({ accion: 'mover', id: t.id, destino: 'manana' }, 'Pasada a mañana ✓')} style={{ ...botonMini, padding: '0 12px' }}>→ Mañana</button>
                )}
                {t.puntual && otros.map(o => (
                  <button key={o.usuario_id} disabled={ocupado} onClick={() => accion({ accion: 'mover', id: t.id, destino: o.usuario_id }, `Pasada a ${String(o.nombre).split(' ')[0]} ✓`)} style={{ ...botonMini, padding: '0 12px' }}>→ {String(o.nombre).split(' ')[0]}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {lista.length === 0 && <div style={{ fontSize: 13, opacity: .65, fontWeight: 700 }}>Hoy no tiene actividades. Agrega la primera abajo.</div>}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid rgba(42,33,24,0.08)' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.3, opacity: .55, marginBottom: 8 }}>➕ AGREGAR ACTIVIDAD PARA {nombre.toUpperCase()}</div>
        <input value={nuevo.titulo} onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} maxLength={120} placeholder="¿Qué tiene que hacer?" style={{ ...campo, marginBottom: 8 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {IDEAS_DIA.map(x => (
            <button key={x} onClick={() => setNuevo({ ...nuevo, titulo: x.replace(/^\S+\s/, ''), solo_hoy: true })}
              style={{ border: `2px solid ${AZUL}55`, background: `${AZUL}12`, color: 'inherit', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>{x}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[[true, '📌 Solo hoy'], [false, '🗓️ Hasta que la haga']].map(([v, t]) => (
            <button key={String(v)} onClick={() => setNuevo({ ...nuevo, solo_hoy: v })} style={{
              flex: 1, minHeight: 40, borderRadius: 10, fontWeight: 900, fontSize: 13, cursor: 'pointer', color: 'inherit',
              border: `2px solid ${nuevo.solo_hoy === v ? AZUL : 'rgba(42,33,24,0.12)'}`, background: nuevo.solo_hoy === v ? 'rgba(28,176,246,0.14)' : 'transparent',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .6, marginBottom: 8 }}>
          {nuevo.solo_hoy ? 'Mañana ya no le aparece. Si hace falta, la pasas a mañana desde ✏️.' : 'Le sigue apareciendo cada día hasta que la marque como hecha.'}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <input type="checkbox" checked={nuevo.requiere_foto} onChange={e => setNuevo({ ...nuevo, requiere_foto: e.target.checked })} style={{ width: 18, height: 18 }} /> 📸 Con foto
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <input type="checkbox" checked={nuevo.es_venta} onChange={e => setNuevo({ ...nuevo, es_venta: e.target.checked })} style={{ width: 18, height: 18 }} /> 💰 Es de venta
          </label>
        </div>
        <button disabled={ocupado || !nuevo.titulo.trim()} onClick={async () => { if (await accion({ accion: 'agregar', ...nuevo }, `Agregada a la lista de ${nombre} ✓`)) setNuevo({ titulo: '', solo_hoy: true, requiere_foto: false, es_venta: false }) }}
          style={{ width: '100%', height: 46, border: 0, borderRadius: 14, background: VERDE, boxShadow: `0 4px 0 ${VERDE_SOMBRA}`, color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', opacity: ocupado || !nuevo.titulo.trim() ? .5 : 1 }}>
          Agregar a la lista de {nombre}
        </button>
        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6, color: msg.includes('✓') ? VERDE : ROJO }}>{msg}</div>
      </div>
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

function Tarjeta({ p, otros, fecha, hoy, tarjeta, elegirDia, alGuardar }) {
  const [editando, setEditando] = useState(false)
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
      {p.trabaja && fecha === hoy && (
        <button onClick={() => setEditando(e => !e)} style={{
          width: '100%', minHeight: 40, marginTop: 8, borderRadius: 12, fontWeight: 900, fontSize: 14, cursor: 'pointer', color: 'inherit',
          border: `2px solid ${editando ? AZUL : 'rgba(42,33,24,0.12)'}`, background: editando ? 'rgba(28,176,246,0.12)' : 'transparent',
        }}>{editando ? '✔ Listo, volver a la revisión' : `✏️ Editar su lista (agregar, ordenar, quitar)`}</button>
      )}

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

          {editando ? (
            <Editor key={p.lista.map(t => t.id + t.titulo + t.estado).join('|')} p={p} otros={otros} alGuardar={alGuardar} />
          ) : (
            <>
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
        <Tarjeta key={p.usuario_id} p={p} otros={d.equipo.filter(x => x.usuario_id !== p.usuario_id)} fecha={d.fecha} hoy={d.hoy} tarjeta={tarjeta} elegirDia={setFecha} alGuardar={() => setTick(t => t + 1)} />
      ))}
      {d.equipo.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7 }}>Aún no hay colaboradores con horario.</div>}
    </div>
  )
}
