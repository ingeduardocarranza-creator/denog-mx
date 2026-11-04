'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PanelConfirmar, VistaEnTienda } from './EnTienda'

// Jarvis: el tablero de actividades del día. Una sola pantalla para el
// colaborador (su turno) y para el admin (sus misiones + cómo va el equipo).
// Hecha para verse y entenderse al instante: una tarea grande "toca ahora",
// una ruta con el resto, y un aro de progreso.

const VERDE = '#58a700', VERDE_SOMBRA = '#3f7a00'
const AZUL = '#1cb0f6'
const NARANJA = '#ff9600'

const ANIMOS = [{ v: 1, e: '😟', t: 'Difícil' }, { v: 2, e: '😐', t: 'Normal' }, { v: 3, e: '😀', t: 'Muy bien' }]

function Aro({ hechas, total }) {
  const pct = total ? hechas / total : 0
  const r = 46, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 112, height: 112, flex: 'none' }}>
      <svg width="112" height="112" viewBox="0 0 112 112" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(42,33,24,0.10)" strokeWidth="12" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={VERDE} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{hechas}/{total}</div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .6 }}>actividades</div>
      </div>
    </div>
  )
}

function Boton({ color = VERDE, sombra = VERDE_SOMBRA, children, ...p }) {
  return (
    <button {...p} style={{
      height: 52, border: 0, borderRadius: 14, background: color, color: '#fff', width: '100%',
      fontSize: 15, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
      boxShadow: `0 4px 0 ${sombra}`, cursor: 'pointer', ...(p.style || {}),
    }}>{children}</button>
  )
}

export default function JarvisPage() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState('dia') // dia | equipo
  const [equipo, setEquipo] = useState(null)
  const [festejo, setFestejo] = useState('')
  const [retro, setRetro] = useState({ animo: 0, dificil: '', ayuda: '' })
  const [retroEnviada, setRetroEnviada] = useState(false)
  const [monedero, setMonedero] = useState(null)
  const [verHistorial, setVerHistorial] = useState(false)
  const [comisiones, setComisiones] = useState(null)
  const [seguim, setSeguim] = useState(null)
  const [relevos, setRelevos] = useState([])
  const [avisosAdmin, setAvisosAdmin] = useState(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/jarvis').then(r => r.json())
      if (res.ok) { setDatos(res); setError('') } else setError(res.mensaje || 'No se pudo cargar')
    } catch { setError('Sin conexión') }
  }, [])

  const cargarEquipo = useCallback(async () => {
    const res = await fetch('/api/jarvis?equipo=1').then(r => r.json()).catch(() => null)
    if (res?.ok) setEquipo(res)
  }, [])

  const cargarMonedero = useCallback(async () => {
    const res = await fetch('/api/jarvis/comisiones').then(r => r.json()).catch(() => null)
    if (res?.ok) setMonedero(res)
  }, [])
  const cargarComisiones = useCallback(async () => {
    const res = await fetch('/api/jarvis/comisiones?admin=1').then(r => r.json()).catch(() => null)
    if (res?.ok) setComisiones(res)
  }, [])

  const cargarRelevos = useCallback(async () => {
    const res = await fetch('/api/jarvis/avisos').then(r => r.json()).catch(() => null)
    if (res?.ok) setRelevos(res.relevos || [])
  }, [])
  const cargarAvisosAdmin = useCallback(async () => {
    const res = await fetch('/api/jarvis/avisos?admin=1').then(r => r.json()).catch(() => null)
    if (res?.ok) setAvisosAdmin(res)
  }, [])
  const leerRelevo = async (id) => {
    await fetch('/api/jarvis/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'leer', id }) })
    cargarRelevos()
  }
  const cargarSeguim = useCallback(async () => {
    const res = await fetch('/api/jarvis/seguimiento').then(r => r.json()).catch(() => null)
    if (res?.ok) setSeguim(res)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  // Se refresca solo cada minuto: así las actividades "tocan" sin recargar.
  useEffect(() => {
    const t = setInterval(() => { cargar(); if (vista === 'equipo') cargarEquipo(); if (vista === 'comisiones') cargarComisiones() }, 60000)
    return () => clearInterval(t)
  }, [cargar, cargarEquipo, cargarComisiones, vista])
  useEffect(() => { if (vista === 'equipo') cargarEquipo() }, [vista, cargarEquipo])
  useEffect(() => { if (vista === 'comisiones') cargarComisiones() }, [vista, cargarComisiones])
  useEffect(() => { if (datos && datos.usuario.rol !== 'admin') cargarMonedero() }, [datos, cargarMonedero])
  useEffect(() => { if (datos && datos.usuario.rol !== 'admin') cargarRelevos() }, [datos, cargarRelevos])
  useEffect(() => { if (vista === 'avisos') cargarAvisosAdmin() }, [vista, cargarAvisosAdmin])
  useEffect(() => { if (datos?.usuario.rol === 'admin') cargarAvisosAdmin() }, [datos, cargarAvisosAdmin])
  const hayTareaSeguim = !!datos && datos.tareas.some(t => t.verif === 'seguimientos' && t.estado !== 'hecha')
  useEffect(() => { if (hayTareaSeguim) cargarSeguim() }, [hayTareaSeguim, cargarSeguim])

  const atrasadas = datos ? datos.tareas.filter(t => t.estado === 'pendiente' && t.toca) : []
  useEffect(() => {
    if (!datos) return
    document.title = atrasadas.length ? `(${atrasadas.length}) Jarvis` : 'Jarvis'
  }, [datos, atrasadas.length])

  const marcar = async (plantilla_id, accion) => {
    setGuardando(true)
    try {
      const res = await fetch('/api/jarvis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id, accion }),
      }).then(r => r.json())
      if (!res.ok) setError(res.mensaje || 'No se pudo guardar')
      else if (accion === 'hecha') {
        setFestejo(`+${res.xp} XP`)
        setTimeout(() => setFestejo(''), 1400)
      }
      await cargar()
    } finally { setGuardando(false) }
  }

  const enviarRetro = async () => {
    await fetch('/api/jarvis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'retro', ...retro }),
    })
    setRetroEnviada(true)
    cargar()
  }

  if (error && !datos) return <div style={{ padding: 24, color: '#b91c1c', fontWeight: 800 }}>{error}</div>
  if (!datos) return <div style={{ padding: 24 }}>Cargando…</div>

  const esAdmin = datos.usuario.rol === 'admin'
  const { tareas, resumen } = datos
  const siguiente = tareas.find(t => t.estado === 'pendiente' && t.toca) || tareas.find(t => t.estado === 'pendiente')
  const pendientesLuego = tareas.filter(t => t.estado === 'pendiente' && t !== siguiente)
  const todoListo = tareas.length > 0 && tareas.every(t => t.estado !== 'pendiente')
  const nombre = (datos.usuario.nombre || '').split(' ')[0]
  const ayer = datos.ayer
  const vsAyer = ayer ? resumen.xp_hoy - ayer.xp : null
  const retroDone = datos.retro_hecha || retroEnviada

  const tarjeta = { background: 'var(--sup, #fff)', border: '2px solid rgba(42,33,24,0.10)', borderRadius: 20, padding: 16 }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 80px', fontFamily: 'inherit', color: 'var(--tinta, #2a2118)' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>{esAdmin ? 'MIS MISIONES' : 'MI TURNO'}{datos.turno ? ` · ${datos.turno.desde}–${datos.turno.hasta}` : ''}</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Hola, {nombre} 👋</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ ...tarjeta, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: NARANJA }}>🔥 {datos.racha}</div>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: .6 }}>RACHA</div>
          </div>
          <div style={{ ...tarjeta, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: AZUL }}>⚡ {resumen.xp_hoy}</div>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: .6 }}>XP HOY</div>
          </div>
        </div>
      </div>

      {esAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['dia', '🎯 Mi día'], ['equipo', '👥 Equipo'], ['comisiones', '💰 Comisiones'], ['avisos', `📣 Avisos${avisosAdmin?.pendientes?.length ? ` (${avisosAdmin.pendientes.length})` : ''}`], ['entienda', '📦 En tienda']].map(([k, t]) => (
            <button key={k} onClick={() => setVista(k)} style={{
              flex: 1, height: 42, borderRadius: 12, fontWeight: 900, fontSize: 14, cursor: 'pointer',
              border: `2px solid ${vista === k ? AZUL : 'rgba(42,33,24,0.12)'}`,
              background: vista === k ? 'rgba(28,176,246,0.12)' : 'var(--sup, #fff)', color: 'inherit',
            }}>{t}</button>
          ))}
        </div>
      )}

      {vista === 'equipo' && esAdmin ? (
        <VistaEquipo equipo={equipo} tarjeta={tarjeta} />
      ) : vista === 'entienda' && esAdmin ? (
        <VistaEnTienda tarjeta={tarjeta} />
      ) : vista === 'avisos' && esAdmin ? (
        <VistaAvisos datos={avisosAdmin} recargar={cargarAvisosAdmin} tarjeta={tarjeta} />
      ) : vista === 'comisiones' && esAdmin ? (
        <VistaComisiones datos={comisiones} recargar={cargarComisiones} tarjeta={tarjeta} />
      ) : (
        <>
          {tareas.length === 0 ? (
            <div style={{ ...tarjeta, textAlign: 'center', padding: 28 }}>
              <div style={{ fontSize: 44 }}>🌴</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>Hoy no tienes turno</div>
              <div style={{ fontSize: 14, opacity: .65, marginTop: 4 }}>Cuando te toque, aquí aparecen tus actividades.</div>
            </div>
          ) : (
            <>
              {!esAdmin && monedero && (
                <div style={{ ...tarjeta, marginBottom: 14, border: `2px solid ${NARANJA}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 34 }}>👛</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>MI MONEDERO DE COMISIONES</div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#b45309' }}>${monedero.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, opacity: .6 }}>
                        {monedero.en_revision > 0 ? `${monedero.en_revision} venta${monedero.en_revision > 1 ? 's' : ''} en revisión · ` : ''}Ya cobrado: ${monedero.pagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <button onClick={() => setVerHistorial(v => !v)} style={{ border: 0, background: 'transparent', color: AZUL, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                      {verHistorial ? 'Cerrar' : 'Ver'}
                    </button>
                  </div>
                  {verHistorial && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {monedero.historial.length === 0 && <div style={{ fontSize: 13, opacity: .6 }}>Aún no tienes ventas propias. En el punto de venta activa &quot;Es mi cliente&quot; cuando vendas a alguien que tú conseguiste.</div>}
                      {monedero.historial.map(h => (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                          <span>{h.origen === 'domicilio' ? '🚚' : '🛍️'} {new Date(h.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Hermosillo' })} · venta ${Number(h.total_venta).toLocaleString('es-MX')}</span>
                          <span style={{ color: h.estado === 'rechazada' ? '#b91c1c' : h.estado === 'pendiente' ? '#b45309' : VERDE }}>
                            {h.estado === 'pendiente' ? '⏳ en revisión' : h.estado === 'rechazada' ? 'No aplicó' : `+$${Number(h.monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}${h.estado === 'pagada' ? ' ✓ pagada' : ''}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!esAdmin && relevos.map(r => (
                <div key={r.id} style={{ ...tarjeta, marginBottom: 14, border: `2px solid ${AZUL}`, background: 'rgba(28,176,246,0.08)' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: AZUL }}>📝 NOTA DE {r.autor.toUpperCase()} PARA TI</div>
                  <div style={{ fontSize: 15, fontWeight: 700, margin: '6px 0 10px', lineHeight: 1.4 }}>{r.texto}</div>
                  <Boton color={AZUL} sombra="#1899d6" onClick={() => leerRelevo(r.id)}>Entendido</Boton>
                </div>
              ))}

              {/* Progreso + mejor que ayer */}
              <div style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <Aro hechas={resumen.hechas} total={resumen.total} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {todoListo ? '¡Día completo! 🎉' : `Meta de hoy: ${resumen.meta} de ${resumen.total}`}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: .7, marginTop: 4, lineHeight: 1.35 }}>
                    {ayer && (ayer.hechas > 0 || ayer.xp > 0)
                      ? vsAyer > 0 ? `Vas ${vsAyer} XP arriba de tu último día (${ayer.hechas}/${ayer.total}). 💪`
                        : vsAyer === 0 ? `Vas igual que tu último día (${ayer.hechas}/${ayer.total}).`
                        : `Tu último día: ${ayer.hechas}/${ayer.total} y ${ayer.xp} XP. ¡A superarlo!`
                      : 'Hoy empiezas a marcar tu historial.'}
                  </div>
                </div>
              </div>

              {atrasadas.length > 1 && !todoListo && (
                <div style={{ background: 'rgba(255,150,0,0.14)', border: '2px solid rgba(255,150,0,0.4)', borderRadius: 14, padding: '10px 14px', fontSize: 13, fontWeight: 800, marginBottom: 14 }}>
                  ⏰ Jarvis: llevas {atrasadas.length} actividades por hacer. Empieza por la de abajo.
                </div>
              )}

              {/* Toca ahora */}
              {siguiente && (
                <div style={{ ...tarjeta, border: `2px solid ${siguiente.toca ? VERDE : 'rgba(42,33,24,0.12)'}`, boxShadow: `0 4px 0 ${siguiente.toca ? VERDE_SOMBRA : 'rgba(42,33,24,0.10)'}`, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: siguiente.toca ? VERDE : undefined, opacity: siguiente.toca ? 1 : .55 }}>
                    {siguiente.toca ? 'TOCA AHORA' : `SIGUIENTE · ${siguiente.hora}`}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0 12px' }}>
                    <div style={{ fontSize: 40 }}>{siguiente.emoji}</div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>{siguiente.titulo}</div>
                      {siguiente.detalle && <div style={{ fontSize: 14, fontWeight: 600, opacity: .7, marginTop: 3, lineHeight: 1.35 }}>{siguiente.detalle}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {siguiente.enlace && (
                      <Link href={siguiente.enlace} style={{ textDecoration: 'none' }}>
                        <Boton color={AZUL} sombra="#1899d6" type="button">Ir a hacerlo</Boton>
                      </Link>
                    )}
                    {siguiente.auto ? (
                      <div style={{ background: 'rgba(28,176,246,0.10)', border: '2px solid rgba(28,176,246,0.3)', borderRadius: 14, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 900 }}>
                          <span>🤖 Jarvis lo revisa solo</span>
                          <span>{siguiente.actual}/{siguiente.meta}</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 5, background: 'rgba(42,33,24,0.10)', margin: '8px 0 6px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round((siguiente.actual / siguiente.meta) * 100)}%`, height: 10, background: AZUL, transition: 'width .5s' }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, opacity: .65 }}>Se marca sola (+{siguiente.xp} XP) cuando lo hagas de verdad.</div>
                      </div>
                    ) : (
                      <Boton disabled={guardando} onClick={() => marcar(siguiente.id, 'hecha')}>¡Listo! +{siguiente.xp} XP</Boton>
                    )}
                    <button disabled={guardando} onClick={() => marcar(siguiente.id, 'saltada')}
                      style={{ height: 40, border: 0, background: 'transparent', color: AZUL, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                      Saltar por ahora
                    </button>
                  </div>
                </div>
              )}

              {hayTareaSeguim && seguim && seguim.clientes.length > 0 && (
                <PanelConfirmar key={seguim.clientes[0].cliente_id} seguim={seguim} tarjeta={tarjeta} alTerminar={() => Promise.all([cargarSeguim(), cargar()])} />
              )}

              {/* Ruta del día */}
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, margin: '18px 0 8px' }}>TU RUTA DE HOY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tareas.map(t => {
                  const hecha = t.estado === 'hecha', saltada = t.estado === 'saltada'
                  return (
                    <div key={t.id} style={{ ...tarjeta, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, opacity: hecha ? .65 : 1 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900,
                        background: hecha ? VERDE : saltada ? 'rgba(42,33,24,0.10)' : (t === siguiente ? 'rgba(88,167,0,0.15)' : 'rgba(42,33,24,0.06)'),
                        color: hecha ? '#fff' : 'inherit',
                      }}>{hecha ? '✓' : t.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, textDecoration: hecha ? 'line-through' : 'none' }}>{t.titulo}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, opacity: .55 }}>
                          {t.hora} · {t.xp} XP{saltada ? ' · saltada' : ''}{t.auto && !hecha ? ` · 🤖 ${t.actual}/${t.meta}` : ''}{t.auto && hecha ? ' · 🤖 comprobada' : ''}
                          {t.estado === 'pendiente' && t.toca && t !== siguiente ? ' · ⏰ pendiente' : ''}
                        </div>
                      </div>
                      {(hecha || saltada) && !(t.auto && hecha) && (
                        <button disabled={guardando} onClick={() => marcar(t.id, 'deshacer')}
                          style={{ border: 0, background: 'transparent', color: AZUL, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Deshacer</button>
                      )}
                      {t.estado === 'pendiente' && t !== siguiente && !t.auto && (
                        <button disabled={guardando} onClick={() => marcar(t.id, 'hecha')}
                          style={{ border: `2px solid ${VERDE}`, background: 'transparent', color: VERDE, borderRadius: 10, padding: '6px 10px', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>Listo</button>
                      )}
                    </div>
                  )
                })}
              </div>

              {!esAdmin && <PanelAvisar tarjeta={tarjeta} alEnviar={cargar} />}

              {/* Mini retro: 2 preguntas al terminar */}
              {!esAdmin && (todoListo || pendientesLuego.length === 0) && !retroDone && (
                <div style={{ ...tarjeta, marginTop: 18, border: `2px solid ${AZUL}` }}>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>🗣️ Ayúdame a conocerte</div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: .7, marginBottom: 8 }}>¿Cómo estuvo tu turno?</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {ANIMOS.map(a => (
                      <button key={a.v} onClick={() => setRetro(r => ({ ...r, animo: a.v }))} style={{
                        flex: 1, padding: '8px 0', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 12,
                        border: `2px solid ${retro.animo === a.v ? AZUL : 'rgba(42,33,24,0.12)'}`,
                        background: retro.animo === a.v ? 'rgba(28,176,246,0.12)' : 'transparent', color: 'inherit',
                      }}><div style={{ fontSize: 24 }}>{a.e}</div>{a.t}</button>
                    ))}
                  </div>
                  <input value={retro.dificil} onChange={e => setRetro(r => ({ ...r, dificil: e.target.value }))} placeholder="¿Qué se te hizo difícil?"
                    style={{ width: '100%', height: 42, borderRadius: 10, border: '2px solid rgba(42,33,24,0.12)', padding: '0 12px', marginBottom: 8, fontSize: 14, background: 'transparent', color: 'inherit' }} />
                  <input value={retro.ayuda} onChange={e => setRetro(r => ({ ...r, ayuda: e.target.value }))} placeholder="¿Qué te ayudaría mañana?"
                    style={{ width: '100%', height: 42, borderRadius: 10, border: '2px solid rgba(42,33,24,0.12)', padding: '0 12px', marginBottom: 12, fontSize: 14, background: 'transparent', color: 'inherit' }} />
                  <Boton color={AZUL} sombra="#1899d6" disabled={!retro.animo} onClick={enviarRetro}>Enviar</Boton>
                </div>
              )}
              {!esAdmin && retroDone && (
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, opacity: .6, marginTop: 16 }}>Gracias por tu respuesta de hoy 🙌</div>
              )}
            </>
          )}
        </>
      )}

      {festejo && (
        <div style={{ position: 'fixed', left: '50%', top: '38%', transform: 'translateX(-50%)', background: VERDE, color: '#fff', padding: '14px 28px', borderRadius: 999, fontSize: 26, fontWeight: 900, boxShadow: '0 6px 0 ' + VERDE_SOMBRA, zIndex: 50 }}>
          ⚡ {festejo}
        </div>
      )}
      {error && datos && <div style={{ marginTop: 12, fontSize: 13, color: '#b91c1c', fontWeight: 800 }}>{error}</div>}
    </div>
  )
}

function VistaEquipo({ equipo, tarjeta }) {
  if (!equipo) return <div style={{ opacity: .6 }}>Cargando equipo…</div>
  const dia = (f) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${f}T12:00:00Z`).getUTCDay()]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {equipo.equipo.map(p => {
        const pct = p.hoy.total ? Math.round((p.hoy.hechas / p.hoy.total) * 100) : 0
        return (
          <div key={p.usuario_id} style={tarjeta}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{p.nombre.split(' ').slice(0, 2).join(' ')}</div>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: .6 }}>
                {p.trabaja_hoy ? `Turno ${p.horario_hoy.desde}–${p.horario_hoy.hasta}` : 'Hoy descansa'}
              </div>
            </div>
            {p.trabaja_hoy && (
              <>
                <div style={{ height: 14, borderRadius: 7, background: 'rgba(42,33,24,0.10)', margin: '10px 0 6px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: 14, background: VERDE, transition: 'width .5s' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  {p.hoy.hechas}/{p.hoy.total} hechas · {p.hoy.xp} XP
                  {p.hoy.atrasadas > 0 && <span style={{ color: '#b45309' }}> · ⏰ {p.hoy.atrasadas} atrasadas</span>}
                </div>
                <div style={{ fontSize: 12, opacity: .6, fontWeight: 700, marginTop: 2 }}>
                  {p.hoy.ultima ? `Última actividad: ${new Date(p.hoy.ultima).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Hermosillo' })}` : 'Aún no marca nada hoy'}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {p.semana.map(d => {
                const r = d.total ? d.hechas / d.total : null
                const color = r === null ? 'rgba(42,33,24,0.06)' : r >= 0.7 ? VERDE : r > 0 ? NARANJA : '#e5a09a'
                return (
                  <div key={d.fecha} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: 28, borderRadius: 8, background: color, color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {r === null ? '' : `${d.hechas}/${d.total}`}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 800, opacity: .55, marginTop: 2 }}>{dia(d.fecha)}</div>
                  </div>
                )
              })}
            </div>
            {p.retros.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.45 }}>
                <div style={{ fontWeight: 900, opacity: .55, letterSpacing: 1, marginBottom: 4 }}>LO QUE DICE DE SU TURNO</div>
                {p.retros.slice(0, 3).map(r => (
                  <div key={r.id} style={{ marginBottom: 4 }}>
                    {['', '😟', '😐', '😀'][r.animo || 0]} <span style={{ opacity: .5 }}>{r.fecha.slice(5)}</span>
                    {r.dificil ? ` · Difícil: ${r.dificil}` : ''}{r.ayuda ? ` · Ayudaría: ${r.ayuda}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function VistaComisiones({ datos, recargar, tarjeta }) {
  const [pcts, setPcts] = useState({})
  const [estandar, setEstandar] = useState(null)
  const [montos, setMontos] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  if (!datos) return <div style={{ opacity: .6 }}>Cargando comisiones…</div>

  const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
  const enviar = async (cuerpo, okMsg) => {
    setOcupado(true); setAviso('')
    try {
      const res = await fetch('/api/jarvis/comisiones', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(r => r.json())
      setAviso(res.ok ? okMsg(res) : (res.mensaje || 'No se pudo guardar'))
      await recargar()
    } finally { setOcupado(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {aviso && <div style={{ ...tarjeta, padding: '10px 14px', fontSize: 13, fontWeight: 800 }}>{aviso}</div>}

      <div style={{ ...tarjeta, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>% ESTÁNDAR DE COMISIÓN</div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: .65 }}>Sobre la utilidad. Cada producto puede tener el suyo en Catálogo.</div>
        </div>
        <input type="number" value={estandar ?? datos.pct_estandar} onChange={e => setEstandar(e.target.value)}
          style={{ width: 70, height: 38, borderRadius: 10, border: '2px solid rgba(42,33,24,0.15)', padding: '0 8px', fontWeight: 900, background: 'transparent', color: 'inherit' }} />
        <button disabled={ocupado || estandar === null}
          onClick={async () => { await enviar({ accion: 'config', porcentaje: estandar }, r => `% estándar guardado: ${r.porcentaje}%.`); setEstandar(null) }}
          style={{ border: `2px solid ${VERDE}`, background: 'transparent', color: VERDE, borderRadius: 10, padding: '8px 12px', fontWeight: 900, fontSize: 12, cursor: 'pointer', opacity: estandar === null ? .35 : 1 }}>
          Guardar
        </button>
      </div>

      <div style={tarjeta}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginBottom: 8 }}>MONEDEROS DEL EQUIPO</div>
        {datos.saldos.length === 0 && <div style={{ fontSize: 13, opacity: .6 }}>Todavía nadie ha registrado ventas propias.</div>}
        {datos.saldos.map(s => (
          <div key={s.colaborador_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>{s.nombre.split(' ').slice(0, 2).join(' ')}</div>
              <div style={{ fontSize: 12, opacity: .6, fontWeight: 700 }}>Por pagar {dinero(s.por_pagar)} · ya pagado {dinero(s.pagado)}{s.pendientes ? ` · ${s.pendientes} por aprobar` : ''}</div>
            </div>
            <button disabled={ocupado || s.por_pagar <= 0}
              onClick={() => { if (window.confirm(`¿Marcar como pagados ${dinero(s.por_pagar)} a ${s.nombre.split(' ')[0]}?`)) enviar({ accion: 'pagar', colaborador_id: s.colaborador_id }, r => `Pagadas ${r.pagadas} comisiones (${dinero(r.total)}).`) }}
              style={{ border: `2px solid ${VERDE}`, background: 'transparent', color: VERDE, borderRadius: 10, padding: '8px 12px', fontWeight: 900, fontSize: 12, cursor: 'pointer', opacity: s.por_pagar <= 0 ? .35 : 1 }}>
              Marcar pagado
            </button>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginTop: 4 }}>
        POR APROBAR ({datos.solicitudes.length})
      </div>
      {datos.solicitudes.map(c => {
        const sinUtilidad = c.utilidad == null
        const pct = pcts[c.id] ?? String(c.porcentaje_sugerido ?? datos.pct_estandar)
        const calculada = sinUtilidad ? null : Math.max(0, Number(c.utilidad)) * (Number(pct) || 0) / 100
        return (
          <div key={c.id} style={tarjeta}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>{c.colaborador.split(' ')[0]} · {c.titulo}</div>
              <div style={{ fontSize: 12, opacity: .55, fontWeight: 700 }}>{new Date(c.creada_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Hermosillo' })}</div>
            </div>
            <div style={{ fontSize: 13, opacity: .75, fontWeight: 600, margin: '4px 0' }}>{c.detalle.join(', ') || 'Sin detalle'}</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              Venta {dinero(c.total_venta)} · {sinUtilidad ? <span style={{ color: '#b45309' }}>sin costo registrado: pon el monto tú</span> : `utilidad ${dinero(c.utilidad)}`}
            </div>
            {!sinUtilidad && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, fontWeight: 800 }}>
                Comisión
                <input type="number" value={pct} onChange={e => setPcts(m => ({ ...m, [c.id]: e.target.value }))}
                  style={{ width: 70, height: 36, borderRadius: 10, border: '2px solid rgba(42,33,24,0.15)', padding: '0 8px', fontWeight: 900, background: 'transparent', color: 'inherit' }} />
                % de la utilidad
              </div>
            )}
            {sinUtilidad && (
              <input type="number" placeholder="Monto de comisión $" value={montos[c.id] || ''} onChange={e => setMontos(m => ({ ...m, [c.id]: e.target.value }))}
                style={{ width: '100%', height: 40, borderRadius: 10, border: '2px solid rgba(42,33,24,0.15)', padding: '0 12px', marginTop: 8, background: 'transparent', color: 'inherit' }} />
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button disabled={ocupado} onClick={() => enviar(sinUtilidad ? { accion: 'aprobar', id: c.id, monto: montos[c.id] } : { accion: 'aprobar', id: c.id, porcentaje: pct }, r => `Aprobada: ${dinero(r.monto)} al monedero.`)}
                style={{ flex: 2, height: 44, border: 0, borderRadius: 12, background: VERDE, color: '#fff', fontWeight: 900, fontSize: 14, boxShadow: `0 3px 0 ${VERDE_SOMBRA}`, cursor: 'pointer' }}>
                Aprobar{calculada != null ? ` ${dinero(calculada)}` : ''}
              </button>
              <button disabled={ocupado} onClick={() => enviar({ accion: 'rechazar', id: c.id }, () => 'Solicitud rechazada.')}
                style={{ flex: 1, height: 44, border: '2px solid rgba(42,33,24,0.15)', borderRadius: 12, background: 'transparent', color: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                Rechazar
              </button>
            </div>
          </div>
        )
      })}
      {datos.solicitudes.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7, fontWeight: 700 }}>No hay solicitudes por aprobar 🎉</div>}
    </div>
  )
}

const TIPOS_AVISO = [
  { v: 'pidieron', e: '🙋', t: 'Pidieron y no había', ph: '¿Qué pidió el cliente? (producto, color, cuántos)' },
  { v: 'se_acaba', e: '📉', t: 'Se está acabando', ph: '¿Qué producto se acaba y cuántos quedan?' },
  { v: 'danado', e: '💔', t: 'Llegó dañado', ph: '¿Qué producto llegó dañado y qué tiene?' },
  { v: 'relevo', e: '📝', t: 'Nota para el siguiente turno', ph: '¿Qué quedó pendiente o qué debe saber quien sigue?' },
]

function PanelAvisar({ tarjeta, alEnviar }) {
  const [tipo, setTipo] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')
  const actual = TIPOS_AVISO.find(t => t.v === tipo)

  const enviar = async () => {
    setEnviando(true); setMsg('')
    try {
      const res = await fetch('/api/jarvis/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'crear', tipo, texto }) }).then(r => r.json())
      if (res.ok) {
        setMsg(tipo === 'relevo' ? '✅ Nota guardada. Se la mostraré a quien sigue.' : '✅ Aviso enviado al admin. ¡Gracias!')
        setTipo(null); setTexto('')
        alEnviar && alEnviar()
      } else setMsg(res.mensaje || 'No se pudo enviar')
    } finally { setEnviando(false) }
  }

  return (
    <div style={{ ...tarjeta, marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginBottom: 8 }}>📣 AVISAR</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {TIPOS_AVISO.map(t => (
          <button key={t.v} onClick={() => { setTipo(tipo === t.v ? null : t.v); setMsg('') }} style={{
            padding: '10px 6px', borderRadius: 12, cursor: 'pointer', fontWeight: 800, fontSize: 12, color: 'inherit',
            border: `2px solid ${tipo === t.v ? AZUL : 'rgba(42,33,24,0.12)'}`, background: tipo === t.v ? 'rgba(28,176,246,0.12)' : 'transparent',
          }}><div style={{ fontSize: 22 }}>{t.e}</div>{t.t}</button>
        ))}
      </div>
      {actual && (
        <div style={{ marginTop: 10 }}>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder={actual.ph} rows={3}
            style={{ width: '100%', borderRadius: 10, border: '2px solid rgba(42,33,24,0.12)', padding: 10, fontSize: 14, background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
          <div style={{ marginTop: 8 }}>
            <Boton color={AZUL} sombra="#1899d6" disabled={enviando || texto.trim().length < 3} onClick={enviar}>Enviar</Boton>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800 }}>{msg}</div>}
    </div>
  )
}

function VistaAvisos({ datos, recargar, tarjeta }) {
  const [ocupado, setOcupado] = useState(false)
  if (!datos) return <div style={{ opacity: .6 }}>Cargando avisos…</div>
  const resolver = async (id) => {
    setOcupado(true)
    try {
      await fetch('/api/jarvis/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'resolver', id }) })
      await recargar()
    } finally { setOcupado(false) }
  }
  const etiqueta = (t) => TIPOS_AVISO.find(x => x.v === t) || { e: '📣', t: 'Aviso' }
  const fecha = (f) => new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Hermosillo' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>POR ATENDER ({datos.pendientes.length})</div>
      {datos.pendientes.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7, fontWeight: 700 }}>No hay avisos pendientes 🎉</div>}
      {datos.pendientes.map(a => (
        <div key={a.id} style={tarjeta}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 900 }}>
            <span>{etiqueta(a.tipo).e} {etiqueta(a.tipo).t}</span>
            <span style={{ opacity: .55, fontWeight: 700 }}>{a.autor} · {fecha(a.creado_en)}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, margin: '6px 0 10px', lineHeight: 1.4 }}>{a.texto}</div>
          <Boton disabled={ocupado} onClick={() => resolver(a.id)}>Ya lo atendí</Boton>
        </div>
      ))}
      {datos.relevos.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginTop: 6 }}>ÚLTIMAS NOTAS DE RELEVO</div>
          {datos.relevos.map(a => (
            <div key={a.id} style={{ ...tarjeta, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: .6 }}>📝 {a.autor} · {fecha(a.creado_en)}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>{a.texto}</div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
