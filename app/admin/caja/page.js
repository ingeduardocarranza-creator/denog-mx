'use client'
import { useState, useEffect } from 'react'

// Sin decimales cuando la cifra es entera; con centavos sólo cuando existen.
// Un panel lleno de ".00" hace ruido y no aporta nada.
const fmt = (n) => {
  const v = Number(n || 0)
  const centavos = Math.abs(v % 1) > 0.004
  return `$${v.toLocaleString('es-MX', {
    minimumFractionDigits: centavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

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
  // Sólo alerta si HAY turno abierto y su apertura ya pasó de 8 horas. Antes
  // miraba cualquier apertura del día, cerrada o no, y contradecía al propio
  // panel de abajo.
  const horasTurnoActivo = aperturaActual
    ? (new Date() - new Date(aperturaActual.creado_en)) / 3600000
    : 0
  const alertaTurnoLargo = !!turnoActivo && horasTurnoActivo > 8

  // Mismo lenguaje visual que Anticipos: una superficie, un borde, un radio.
  const secLabel = { color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700, marginBottom: 9, marginTop: 22 }
  const tarjeta = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
  const miniCard = { background: 'var(--w03)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Caja</div>
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>{formatearFecha(fecha)}</div>
          </div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '6px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }} />
        </div>

        {/* ── Alertas ───────────────────────────────────────────────────── */}
        {alertaTurnoLargo && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            <span style={{ color: 'var(--ambar)', fontSize: 13 }}>
              {turnoActivo?.nombre} lleva {horasTurnoActivo.toFixed(0)} horas sin hacer corte — verifica con quien está en turno
            </span>
          </div>
        )}
        {alertas.map((a, i) => (
          <div key={i} style={{ background: a.diferencia < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${a.diferencia < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 14, padding: '10px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{a.diferencia < 0 ? '🔴' : '⚠️'}</span>
              <div>
                <div style={{ color: a.diferencia < 0 ? 'var(--rojo-t)' : 'var(--ambar)', fontSize: 13, fontWeight: 600 }}>
                  {a.diferencia < 0 ? 'Faltante' : 'Sobrante'} de {fmt(Math.abs(a.diferencia))} — {a.clientes?.nombre}
                </div>
                {a.justificacion && <div style={{ color: 'var(--w40)', fontSize: 11 }}>"{a.justificacion}"</div>}
              </div>
            </div>
            <div style={{ color: a.diferencia < 0 ? 'var(--rojo-t)' : 'var(--ambar)', fontSize: 16, fontWeight: 800 }}>{fmt(a.diferencia)}</div>
          </div>
        ))}

        {/* ══ SECCIÓN 1: EL DÍA ═══════════════════════════════════════════
            Antes eran cinco tarjetas iguales y, aparte, una banda amarilla con
            el fondo en caja compitiendo con ellas. Ahora hay un solo bloque: el
            efectivo que debe haber, en grande, y los totales del día como
            respaldo — que es el orden en que se leen. */}
        <div style={{ ...tarjeta, overflow: 'hidden', marginBottom: 4 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '20px 22px' }}>
            <div>
              <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>
                Efectivo que debe haber en caja
              </div>
              <div style={{ color: 'var(--w40)', fontSize: 11.5, marginTop: 6 }}>
                {turnoActivo
                  ? `${fmt(fondoInicial)} de fondo inicial − ${fmt(retirosConfirmadosTurno)} de retiros del turno`
                  : ultimoCorteHoy
                  ? `${fmt(ultimoCorteHoy.total_contado)} del último corte − ${fmt(retirosPostCorte)} de retiros posteriores`
                  : `${fmt(fondoDia)} de fondo inicial − ${fmt(retirosConfirmadosDia)} de retiros confirmados`}
              </div>
            </div>
            <div className="monto" style={{ color: 'var(--ambar)', fontSize: 40, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>
              {fmt(fondoActualDia)}
            </div>
          </div>

          <div className="cifras-caja" style={{ borderTop: '1px solid var(--w06)' }}>
            {[
              { label: 'Fondo inicial', valor: fondoDia },
              { label: 'Efectivo', valor: metricas.efectivo },
              { label: 'Transferencias', valor: metricas.transferencia },
              { label: 'Terminal', valor: metricas.terminal },
              { label: 'Cobrado hoy', valor: totalDia, tono: 'var(--verde)' },
            ].map((m, i) => (
              <div key={i}>
                <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{m.label}</div>
                <div className="monto" style={{ color: m.tono || 'var(--tinta)', fontSize: 19, fontWeight: 800, marginTop: 5, letterSpacing: -0.5 }}>
                  {fmt(m.valor)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ SECCIÓN 2: TURNO ACTUAL ══════════════════════════════════════ */}
        <div style={{ ...secLabel }}>Turno actual</div>
        {!turnoActivo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--w38)', fontSize: 12.5, padding: '2px 2px 6px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--w22)', flexShrink: 0 }} />
            Nadie tiene turno abierto ahora mismo
          </div>
        ) : (
          <div style={{ ...tarjeta, padding: '16px 20px', marginBottom: 20 }}>

            {/* Quién / desde cuándo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--verde)', fontWeight: 700 }}>
                  {turnoActivo.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>{turnoActivo.nombre}</div>
                  <div style={{ color: 'var(--w35)', fontSize: 11 }}>En turno desde {formatearHora(aperturaActual?.creado_en)}</div>
                </div>
              </div>
              <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: '3px 12px', color: 'var(--verde)', fontSize: 11 }}>
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
                  <div style={{ color: 'var(--w35)', fontSize: 9, marginBottom: 4 }}>{m.label}</div>
                  <div className="monto" style={{ color: m.rojo ? 'var(--rojo-t)' : 'var(--tinta)', fontSize: 14, fontWeight: 700 }}>{fmt(m.valor)}</div>
                </div>
              ))}
            </div>

            {/* Efectivo en caja ahora */}
            <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: 'var(--w50)', fontSize: 12, fontWeight: 600 }}>Efectivo total en caja ahora</div>
                <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 2 }}>
                  {fmt(fondoInicial)} fondo + {fmt(metricasTurno.efectivo)} cobrado − {fmt(retirosConfirmadosTurno)} retiros
                </div>
              </div>
              <div style={{ color: 'var(--verde)', fontSize: 26, fontWeight: 800 }}>{fmt(efectivoEnCaja)}</div>
            </div>
          </div>
        )}

        {/* ══ SECCIÓN 3: HISTORIAL + RETIROS (2 columnas) ═════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>

          {/* Historial de turnos */}
          <div>
            <div style={{ ...secLabel }}>Historial de turnos</div>
            {cargando ? (
              <div style={{ color: 'var(--w30)', fontSize: 13, padding: 20, textAlign: 'center' }}>Cargando...</div>
            ) : turnosHistorial.length === 0 ? (
              <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 14, padding: 32, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>
                No hay turnos registrados este día
              </div>
            ) : (
              <div style={{ ...tarjeta, overflow: 'hidden' }}>
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
                    <div key={apertura.creado_en} style={{ padding: '12px 16px', borderBottom: i < turnosHistorial.length - 1 ? '1px solid var(--w05)' : 'none' }}>

                      {/* Encabezado fila */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: enTurno ? 'rgba(16,185,129,0.15)' : hayDif ? 'rgba(239,68,68,0.15)' : 'rgba(193,85,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: enTurno ? 'var(--verde)' : hayDif ? 'var(--rojo-t)' : 'var(--marca-t)', fontWeight: 700 }}>
                            {iniciales}
                          </div>
                          <div>
                            <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600 }}>{t.nombre}</div>
                            <div style={{ color: 'var(--w30)', fontSize: 10 }}>
                              {formatearHora(apertura?.creado_en)}
                              {enTurno ? ` — en curso (${horasTurno}h)` : ` → ${formatearHora(corte?.creado_en)}`}
                            </div>
                          </div>
                        </div>
                        <span style={{ background: enTurno ? 'rgba(16,185,129,0.1)' : hayDif ? (diferencia < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)') : 'rgba(74,222,128,0.1)', border: `1px solid ${enTurno ? 'rgba(16,185,129,0.2)' : hayDif ? (diferencia < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)') : 'rgba(74,222,128,0.2)'}`, borderRadius: 20, padding: '2px 10px', color: enTurno ? 'var(--verde)' : hayDif ? (diferencia < 0 ? 'var(--rojo-t)' : 'var(--ambar)') : 'var(--verde)', fontSize: 10 }}>
                          {enTurno ? 'En turno' : hayDif ? (diferencia < 0 ? `Faltante ${fmt(Math.abs(diferencia))}` : `Sobrante ${fmt(diferencia)}`) : '✓ Sin diferencia'}
                        </span>
                      </div>

                      {/* Columnas fondo inicio / efectivo cobrado / fondo cierre */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'var(--w30)', fontSize: 9 }}>Fondo inicio</div>
                          <div style={{ color: 'var(--tinta)', fontSize: 11, fontWeight: 600 }}>{fmt(apertura?.total_contado)}</div>
                        </div>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'var(--w30)', fontSize: 9 }}>Efectivo cobrado</div>
                          <div style={{ color: 'var(--tinta)', fontSize: 11, fontWeight: 600 }}>{fmt(efectivoCobrado)}</div>
                        </div>
                        <div style={{ ...miniCard }}>
                          <div style={{ color: 'var(--w30)', fontSize: 9 }}>{enTurno ? 'En caja ahora' : 'Fondo cierre'}</div>
                          <div style={{ color: enTurno ? 'var(--verde)' : hayDif ? 'var(--rojo-t)' : 'var(--verde)', fontSize: 11, fontWeight: 600 }}>
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
            <div style={{ ...secLabel, marginTop: 0 }}>Retiro de caja</div>
            {/* Sacar dinero de la caja es una acción con consecuencia, no un
                campo más: el monto se teclea en grande, el motivo es
                obligatorio (por eso el asterisco y el botón bloqueado hasta
                que exista), y se avisa cuánto queda antes de confirmar. */}
            <div style={{ ...tarjeta, padding: 16, marginBottom: 14 }}>
              {mensajeRetiro && (
                <div style={{ background: 'var(--verde-suave)', border: '1px solid var(--verde-borde)', borderRadius: 9, padding: '9px 12px', color: 'var(--verde)', fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
                  {mensajeRetiro}
                </div>
              )}

              <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
                Cuánto sale
              </div>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: montoRetiro ? 'var(--ambar)' : 'var(--w30)', fontSize: 22, fontWeight: 800, pointerEvents: 'none' }}>$</span>
                <input type="number" placeholder="0" value={montoRetiro}
                  onChange={e => setMontoRetiro(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && montoRetiro && motivoRetiro) enviarRetiro() }}
                  className="monto"
                  style={{ width: '100%', background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 11, padding: '12px 14px 12px 34px', color: 'var(--tinta)', fontSize: 26, fontWeight: 800, letterSpacing: -0.8, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>
                Para qué <span style={{ color: 'var(--marca-t)' }}>*</span>
              </div>
              <input type="text" placeholder="Pago a repartidor, compra de insumos…" value={motivoRetiro}
                onChange={e => setMotivoRetiro(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && montoRetiro && motivoRetiro) enviarRetiro() }}
                style={{ width: '100%', background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 11, padding: '11px 14px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />

              {/* Motivos de siempre: la mayoría de los retiros son estos. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {['Pago a repartidor', 'Compra de insumos', 'Depósito a banco', 'Gasto del día'].map(m => (
                  <button key={m} onClick={() => setMotivoRetiro(m)}
                    style={{
                      padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
                      border: `1px solid ${motivoRetiro === m ? 'var(--marca)' : 'var(--w10)'}`,
                      background: motivoRetiro === m ? 'var(--marca)' : 'transparent',
                      color: motivoRetiro === m ? 'var(--sup)' : 'var(--w50)',
                      fontWeight: motivoRetiro === m ? 700 : 500,
                    }}>
                    {m}
                  </button>
                ))}
              </div>

              {Number(montoRetiro) > 0 && (
                <div style={{ background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', borderRadius: 10, padding: '10px 13px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--w55)', fontSize: 12 }}>Quedarían en caja</span>
                  <span className="monto" style={{ color: fondoActualDia - Number(montoRetiro) < 0 ? 'var(--rojo-t)' : 'var(--ambar)', fontSize: 17, fontWeight: 800 }}>
                    {fmt(fondoActualDia - Number(montoRetiro))}
                  </span>
                </div>
              )}

              <button onClick={enviarRetiro} disabled={enviandoRetiro || !montoRetiro || !motivoRetiro}
                style={{
                  width: '100%', borderRadius: 11, padding: '12px', fontSize: 13.5, fontWeight: 700, border: 'none',
                  cursor: (montoRetiro && motivoRetiro && !enviandoRetiro) ? 'pointer' : 'not-allowed',
                  background: (montoRetiro && motivoRetiro) ? 'var(--marca)' : 'var(--w06)',
                  color: (montoRetiro && motivoRetiro) ? 'var(--sup)' : 'var(--w30)',
                }}>
                {enviandoRetiro ? 'Registrando…' : montoRetiro ? `Registrar retiro de ${fmt(Number(montoRetiro))}` : 'Registrar retiro'}
              </button>
              <div style={{ color: 'var(--w30)', fontSize: 10.5, textAlign: 'center', marginTop: 8 }}>
                Queda registrado como confirmado y descuenta de la caja al instante
              </div>
            </div>

            <div style={{ ...secLabel }}>Historial de retiros</div>
            {retiros.length === 0 ? (
              <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--w30)', fontSize: 12 }}>
                Sin retiros este día
              </div>
            ) : (
              <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, overflow: 'hidden' }}>
                {retiros.map((r, i) => (
                  <div key={r.id} style={{ padding: '10px 14px', borderBottom: i < retiros.length - 1 ? '1px solid var(--w05)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600 }}>{fmt(r.monto)}</div>
                      <div style={{ color: 'var(--w30)', fontSize: 10 }}>{r.motivo}</div>
                      <div style={{ color: 'var(--w20)', fontSize: 9 }}>{formatearHora(r.creado_en)}</div>
                    </div>
                    <span style={{ background: r.estado === 'confirmado' ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${r.estado === 'confirmado' ? 'rgba(74,222,128,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 20, padding: '2px 10px', color: r.estado === 'confirmado' ? 'var(--verde)' : 'var(--ambar)', fontSize: 10 }}>
                      {r.estado === 'confirmado' ? '✓ Confirmado' : '⏳ Pendiente'}
                    </span>
                  </div>
                ))}
                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--w05)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--w40)', fontSize: 11 }}>Total retirado</span>
                  <span style={{ color: 'var(--rojo-t)', fontSize: 12, fontWeight: 700 }}>{fmt(retiros.reduce((s, r) => s + r.monto, 0))}</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
