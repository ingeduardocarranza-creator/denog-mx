'use client'
import { useState, useEffect } from 'react'

const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

const formatearFecha = (fecha) => {
  if (!fecha) return ''
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d = new Date(fecha + 'T12:00:00')
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

const formatearHora = (fecha) => {
  if (!fecha) return ''
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const getFechaLocal = () => {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
}

export default function AdminCaja() {
  const [fecha, setFecha] = useState(getFechaLocal())
  const [cortes, setCortes] = useState([])
  const [retiros, setRetiros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [montoRetiro, setMontoRetiro] = useState('')
  const [motivoRetiro, setMotivoRetiro] = useState('')
  const [enviandoRetiro, setEnviandoRetiro] = useState(false)
  const [mensajeRetiro, setMensajeRetiro] = useState('')
  const [metricas, setMetricas] = useState({ efectivo: 0, transferencia: 0, terminal: 0 })
  const [metricasTurno, setMetricasTurno] = useState({ efectivo: 0, transferencia: 0, terminal: 0 })

  useEffect(() => { cargar() }, [fecha])

  const cargar = async () => {
    setCargando(true)
    const [cortesRes, retirosRes] = await Promise.all([
      fetch(`/api/caja?fecha=${fecha}`).then(r => r.json()),
      fetch(`/api/retiros?fecha=${fecha}`).then(r => r.json())
    ])
    if (cortesRes.ok) setCortes(cortesRes.cortes || [])
    if (retirosRes.ok) setRetiros(retirosRes.retiros || [])
    setCargando(false)
  }

  const enviarRetiro = async () => {
    if (!montoRetiro || !motivoRetiro.trim()) return
    setEnviandoRetiro(true)
    const res = await fetch('/api/retiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto: parseFloat(montoRetiro), motivo: motivoRetiro, estado: 'confirmado' })
    })
    const data = await res.json()
    setEnviandoRetiro(false)
    if (data.ok) {
      setMontoRetiro('')
      setMotivoRetiro('')
      setMensajeRetiro('✅ Retiro registrado correctamente')
      await cargar()
      setTimeout(() => setMensajeRetiro(''), 5000)
    }
  }

  // Agrupar registros por colaborador
  const turnosPorColaborador = cortes.reduce((acc, c) => {
    const id = c.colaborador_id
    if (!acc[id]) acc[id] = { nombre: c.clientes?.nombre || 'Colaborador', aperturas: [], cortes: [] }
    if (c.tipo === 'apertura') acc[id].aperturas.push(c)
    if (c.tipo === 'corte') acc[id].cortes.push(c)
    return acc
  }, {})
  const turnos = Object.values(turnosPorColaborador)

  // Métricas del día completo
  useEffect(() => {
    fetch(`/api/caja?resumen=true&fecha=${fecha}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setMetricas({ efectivo: d.efectivo, transferencia: d.transferencia, terminal: d.terminal }) })
  }, [fecha])

  // Turno activo: el registro más reciente del colaborador determina el estado
  const turnoActivo = turnos.find(t => {
    const todos = [...t.aperturas, ...t.cortes].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))
    return todos[0]?.tipo === 'apertura'
  })

  // Métricas del turno activo (solo desde su apertura)
  useEffect(() => {
    const apertura = turnoActivo?.aperturas[0]
    if (!apertura?.creado_en) { setMetricasTurno({ efectivo: 0, transferencia: 0, terminal: 0 }); return }
    fetch(`/api/caja?resumen=true&fecha=${fecha}&desde=${encodeURIComponent(apertura.creado_en)}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setMetricasTurno({ efectivo: d.efectivo, transferencia: d.transferencia, terminal: d.terminal }) })
  }, [fecha, cortes])

  const aperturaActual = turnoActivo?.aperturas[0]
  const fondoInicial = aperturaActual?.total_contado || 0
  const retirosConfirmadosTurno = aperturaActual
    ? retiros.filter(r => r.estado === 'confirmado' && r.creado_en >= aperturaActual.creado_en).reduce((s, r) => s + r.monto, 0)
    : 0
  const efectivoEnCaja = fondoInicial + metricasTurno.efectivo - retirosConfirmadosTurno
  const fondoActualTurno = fondoInicial - retirosConfirmadosTurno
  const totalDia = metricas.efectivo + metricas.transferencia + metricas.terminal

  // Fondo inicial del día: la apertura más antigua (primera del día), orden explícito por fecha
  const todasAperturas = cortes.filter(c => c.tipo === 'apertura').sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
  const fondoDia = todasAperturas.length > 0 ? (todasAperturas[0]?.total_contado || 0) : 0
  const retirosConfirmadosDia = retiros.filter(r => r.estado === 'confirmado').reduce((s, r) => s + r.monto, 0)

  // Fondo actual: si hay un corte del día, el fondo arranca desde ese corte (no desde la apertura inicial)
  const ultimoCorteHoy = cortes.filter(c => c.tipo === 'corte').sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))[0]
  const retirosPostCorte = ultimoCorteHoy
    ? retiros.filter(r => r.estado === 'confirmado' && new Date(r.creado_en) > new Date(ultimoCorteHoy.creado_en)).reduce((s, r) => s + r.monto, 0)
    : 0
  const fondoActualDia = turnoActivo
    ? fondoActualTurno
    : ultimoCorteHoy
    ? Math.max(0, (ultimoCorteHoy.total_contado || 0) - retirosPostCorte)
    : Math.max(0, fondoDia - retirosConfirmadosDia)

  // Historial: una fila por turno, emparejando por timestamp.
  // Ordenamos aperturas y cortes ASC; el corte de una apertura es el que ocurre
  // después de esa apertura y antes de la siguiente.
  const turnosHistorial = turnos.flatMap(t => {
    const aperturas = [...t.aperturas].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
    const cortesAsc = [...t.cortes].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
    return aperturas.map((apertura, idx) => {
      const siguienteApertura = aperturas[idx + 1]
      const corte = cortesAsc.find(c =>
        new Date(c.creado_en) > new Date(apertura.creado_en) &&
        (!siguienteApertura || new Date(c.creado_en) < new Date(siguienteApertura.creado_en))
      )
      return { nombre: t.nombre, apertura, corte }
    })
  }).sort((a, b) => new Date(b.apertura.creado_en) - new Date(a.apertura.creado_en))

  // Alertas
  const alertas = cortes.filter(c => c.tipo === 'corte' && Math.abs(c.diferencia || 0) > 0.01)
  const alertaTurnoLargo = cortes.filter(c => c.tipo === 'apertura' && (new Date() - new Date(c.creado_en)) / 3600000 > 8)

  const secLabel = { color: 'rgba(255,255,255,0.35)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }
  const miniCard = { background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>💰 Caja</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>{formatearFecha(fecha)}</div>
          </div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', color: 'white', fontSize: 12, outline: 'none' }} />
        </div>

        {/* ── Alertas ───────────────────────────────────────────────────── */}
        {alertaTurnoLargo.length > 0 && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            <span style={{ color: '#f59e0b', fontSize: 13 }}>Turno activo lleva más de 8 horas sin corte — verifica con el colaborador</span>
          </div>
        )}
        {alertas.map((a, i) => (
          <div key={i} style={{ background: a.diferencia < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${a.diferencia < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 14, padding: '10px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{a.diferencia < 0 ? '🔴' : '⚠️'}</span>
              <div>
                <div style={{ color: a.diferencia < 0 ? '#f87171' : '#f59e0b', fontSize: 13, fontWeight: 600 }}>
                  {a.diferencia < 0 ? 'Faltante' : 'Sobrante'} de {fmt(Math.abs(a.diferencia))} — {a.clientes?.nombre}
                </div>
                {a.justificacion && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>"{a.justificacion}"</div>}
              </div>
            </div>
            <div style={{ color: a.diferencia < 0 ? '#f87171' : '#f59e0b', fontSize: 16, fontWeight: 800 }}>{fmt(a.diferencia)}</div>
          </div>
        ))}

        {/* ══ SECCIÓN 1: RESUMEN DEL DÍA ══════════════════════════════════ */}
        <div style={{ ...secLabel }}>Resumen del día</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 10 }}>
          {[
            { label: 'Fondo inicial', valor: fondoDia, color: 'white' },
            { label: 'Efectivo total día', valor: metricas.efectivo, color: 'white' },
            { label: 'Transferencias', valor: metricas.transferencia, color: 'white' },
            { label: 'Terminal', valor: metricas.terminal, color: 'white' },
            { label: 'Total del día', valor: totalDia, color: '#4ade80' },
          ].map((m, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 4 }}>{m.label}</div>
              <div style={{ color: m.color, fontSize: 20, fontWeight: 700 }}>{fmt(m.valor)}</div>
            </div>
          ))}
        </div>
        {/* Fondo actual del día */}
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '2px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>💵 Fondo en caja</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 3 }}>
              {turnoActivo
                ? `${fmt(fondoInicial)} fondo inicial − ${fmt(retirosConfirmadosTurno)} retiros del turno`
                : ultimoCorteHoy
                ? `${fmt(ultimoCorteHoy.total_contado)} corte − ${fmt(retirosPostCorte)} retiros post-corte`
                : `${fmt(fondoDia)} fondo inicial − ${fmt(retirosConfirmadosDia)} retiros confirmados`}
            </div>
          </div>
          <div style={{ color: '#f59e0b', fontSize: 28, fontWeight: 900 }}>{fmt(fondoActualDia)}</div>
        </div>

        {/* ══ SECCIÓN 2: TURNO ACTUAL ══════════════════════════════════════ */}
        <div style={{ ...secLabel }}>Turno actual</div>
        {!turnoActivo ? (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '20px 24px', marginBottom: 20, color: 'rgba(255,255,255,0.25)', fontSize: 13, textAlign: 'center' }}>
            Sin turno activo
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>

            {/* Quién / desde cuándo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#10b981', fontWeight: 700 }}>
                  {turnoActivo.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>{turnoActivo.nombre}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>En turno desde {formatearHora(aperturaActual?.creado_en)}</div>
                </div>
              </div>
              <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: '3px 12px', color: '#10b981', fontSize: 11 }}>
                ● Activo
              </span>
            </div>

            {/* Métricas del turno */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Fondo inicial', valor: fondoInicial },
                { label: 'Efectivo cobrado', valor: metricasTurno.efectivo },
                { label: 'Transferencias', valor: metricasTurno.transferencia },
                { label: 'Terminal', valor: metricasTurno.terminal },
                { label: 'Retiros confirmados', valor: retirosConfirmadosTurno, rojo: retirosConfirmadosTurno > 0 },
              ].map((m, i) => (
                <div key={i} style={{ ...miniCard }}>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ color: m.rojo ? '#f87171' : 'white', fontSize: 14, fontWeight: 700 }}>{fmt(m.valor)}</div>
                </div>
              ))}
            </div>

            {/* Fondo actual en caja (fondo inicial − retiros) */}
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '2px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>💵 Fondo en caja</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 3 }}>
                  {fmt(fondoInicial)} inicial − {fmt(retirosConfirmadosTurno)} retiros
                </div>
              </div>
              <div style={{ color: '#f59e0b', fontSize: 28, fontWeight: 900 }}>{fmt(fondoActualTurno)}</div>
            </div>

            {/* Efectivo en caja ahora */}
            <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600 }}>Efectivo total en caja ahora</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>
                  {fmt(fondoInicial)} fondo + {fmt(metricasTurno.efectivo)} cobrado − {fmt(retirosConfirmadosTurno)} retiros
                </div>
              </div>
              <div style={{ color: '#10b981', fontSize: 26, fontWeight: 800 }}>{fmt(efectivoEnCaja)}</div>
            </div>
          </div>
        )}

        {/* ══ SECCIÓN 3: HISTORIAL + RETIROS (2 columnas) ═════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>

          {/* Historial de turnos */}
          <div>
            <div style={{ ...secLabel }}>Historial de turnos</div>
            {cargando ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: 20, textAlign: 'center' }}>Cargando...</div>
            ) : turnosHistorial.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                No hay turnos registrados este día
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {turnosHistorial.map((t, i) => {
                  const apertura = t.apertura
                  const corte = t.corte
                  const enTurno = !corte
                  const diferencia = corte?.diferencia || 0
                  const hayDif = Math.abs(diferencia) > 0.01
                  const horasTurno = apertura ? ((new Date() - new Date(apertura.creado_en)) / 3600000).toFixed(1) : 0
                  const iniciales = t.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

                  // Para turnos cerrados: total_efectivo guardado en el corte.
                  // Fallback: fondo_cierre − fondo_inicio si total_efectivo es null.
                  // Para el turno activo: metricasTurno.efectivo (live).
                  const efectivoCobrado = enTurno
                    ? metricasTurno.efectivo
                    : (corte?.total_efectivo != null
                        ? corte.total_efectivo
                        : Math.max(0, (corte?.total_contado || 0) - (apertura?.total_contado || 0)))

                  return (
                    <div key={apertura.creado_en} style={{ padding: '12px 16px', borderBottom: i < turnosHistorial.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>

                      {/* Encabezado fila */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: enTurno ? 'rgba(16,185,129,0.15)' : hayDif ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: enTurno ? '#10b981' : hayDif ? '#f87171' : '#818cf8', fontWeight: 700 }}>
                            {iniciales}
                          </div>
                          <div>
                            <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{t.nombre}</div>
                            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                              {formatearHora(apertura?.creado_en)}
                              {enTurno ? ` — en curso (${horasTurno}h)` : ` → ${formatearHora(corte?.creado_en)}`}
                            </div>
                          </div>
                        </div>
                        <span style={{ background: enTurno ? 'rgba(16,185,129,0.1)' : hayDif ? (diferencia < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)') : 'rgba(74,222,128,0.1)', border: `1px solid ${enTurno ? 'rgba(16,185,129,0.2)' : hayDif ? (diferencia < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)') : 'rgba(74,222,128,0.2)'}`, borderRadius: 20, padding: '2px 10px', color: enTurno ? '#10b981' : hayDif ? (diferencia < 0 ? '#f87171' : '#f59e0b') : '#4ade80', fontSize: 10 }}>
                          {enTurno ? 'En turno' : hayDif ? (diferencia < 0 ? `Faltante ${fmt(Math.abs(diferencia))}` : `Sobrante ${fmt(diferencia)}`) : '✓ Sin diferencia'}
                        </span>
                      </div>

                      {/* Columnas fondo inicio / efectivo cobrado / fondo cierre */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>Fondo inicio</div>
                          <div style={{ color: 'white', fontSize: 11, fontWeight: 600 }}>{fmt(apertura?.total_contado)}</div>
                        </div>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>Efectivo cobrado</div>
                          <div style={{ color: 'white', fontSize: 11, fontWeight: 600 }}>{fmt(efectivoCobrado)}</div>
                        </div>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{enTurno ? 'En caja ahora' : 'Fondo cierre'}</div>
                          <div style={{ color: enTurno ? '#10b981' : hayDif ? '#f87171' : '#4ade80', fontSize: 11, fontWeight: 600 }}>
                            {enTurno ? fmt(efectivoEnCaja) : fmt(corte?.total_contado)}
                          </div>
                        </div>
                      </div>

                      {corte?.justificacion && (
                        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 8, padding: '6px 10px', marginTop: 8, fontSize: 10, color: 'rgba(248,113,113,0.7)' }}>
                          Justificación: "{corte.justificacion}"
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Retiros */}
          <div>
            <div style={{ ...secLabel }}>Retiro de caja</div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              {mensajeRetiro && (
                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, padding: '8px 12px', color: '#4ade80', fontSize: 12, marginBottom: 10 }}>
                  {mensajeRetiro}
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Monto</label>
                <input type="number" placeholder="$0.00" value={montoRetiro} onChange={e => setMontoRetiro(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }}>Motivo</label>
                <input type="text" placeholder="Ej. Pago repartidor" value={motivoRetiro} onChange={e => setMotivoRetiro(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button onClick={enviarRetiro} disabled={enviandoRetiro || !montoRetiro || !motivoRetiro}
                style={{ width: '100%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '9px', color: '#f59e0b', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: enviandoRetiro || !montoRetiro || !motivoRetiro ? 0.5 : 1 }}>
                {enviandoRetiro ? 'Registrando...' : '💾 Registrar retiro'}
              </button>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'center', marginTop: 6 }}>
                Se registra directamente como confirmado
              </div>
            </div>

            <div style={{ ...secLabel }}>Historial de retiros</div>
            {retiros.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                Sin retiros este día
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {retiros.map((r, i) => (
                  <div key={r.id} style={{ padding: '10px 14px', borderBottom: i < retiros.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{fmt(r.monto)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{r.motivo}</div>
                      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>{formatearHora(r.creado_en)}</div>
                    </div>
                    <span style={{ background: r.estado === 'confirmado' ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${r.estado === 'confirmado' ? 'rgba(74,222,128,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 20, padding: '2px 10px', color: r.estado === 'confirmado' ? '#4ade80' : '#f59e0b', fontSize: 10 }}>
                      {r.estado === 'confirmado' ? '✓ Confirmado' : '⏳ Pendiente'}
                    </span>
                  </div>
                ))}
                <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Total retirado</span>
                  <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>{fmt(retiros.reduce((s, r) => s + r.monto, 0))}</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
