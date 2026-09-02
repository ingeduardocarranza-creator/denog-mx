'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ConteoEfectivo from '../../components/pos/ConteoEfectivo'

const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatearFecha = (fecha) => {
  if (!fecha) return ''
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d = new Date(fecha)
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

export default function CajaPage() {
  const router = useRouter()
  const [colaborador, setColaborador] = useState(null)
  const [paso, setPaso] = useState('cargando')
  const [ultimoCorte, setUltimoCorte] = useState(null)
  const [turnoActual, setTurnoActual] = useState(null)
  const [denominaciones, setDenominaciones] = useState({
    b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0,
    m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m50c: 0
  })
  const [resumenTurno, setResumenTurno] = useState({
    efectivo: 0, transferencia: 0, terminal: 0, totalRetiros: 0
  })
  const [justificacion, setJustificacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [retirosPostCorte, setRetirosPostCorte] = useState(0)

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)
    setColaborador(c)
    cargarEstado(c.id)
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && colaborador) {
        // Re-verificar estado al volver a la página (puede haber cambiado el día)
        cargarEstado(colaborador.id)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [colaborador])

  useEffect(() => {
    if (paso !== 'turno' || !turnoActual) return

    // Refrescar resumen cada 30 segundos
    const intervalo = setInterval(() => {
      cargarResumenTurno(turnoActual)
    }, 30000)

    return () => clearInterval(intervalo)
  }, [paso, turnoActual])

  const cargarEstado = async (colaborador_id) => {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const res = await fetch(`/api/caja?fecha=${hoy}`)
    const data = await res.json()

    if (data.ok && data.cortes.length > 0) {
      const misCortes = data.cortes
        .filter(c => c.colaborador_id === colaborador_id)
        .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))

      const masReciente = misCortes[0]

      if (!masReciente) {
        await cargarUltimoCorteGlobal()
        setPaso('apertura')
      } else if (masReciente.tipo === 'corte') {
        setUltimoCorte(masReciente)
        setPaso('corte_hecho')
      } else if (masReciente.tipo === 'apertura') {
        setTurnoActual(masReciente)
        await cargarResumenTurno(masReciente)
        setPaso('turno')
      }
    } else {
      await cargarUltimoCorteGlobal()
      setPaso('apertura')
    }
  }

  const cargarUltimoCorteGlobal = async () => {
    const res = await fetch('/api/caja?tipo=corte')
    const data = await res.json()
    if (data.ok && data.cortes.length > 0) {
      const corte = data.cortes[0]
      setUltimoCorte(corte)
      const ahora = new Date()
      const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
      const retirosRes = await fetch(`/api/retiros?fecha=${hoy}&estado=confirmado`)
      const retirosData = await retirosRes.json()
      console.log('[caja] retiros confirmados hoy:', retirosData.retiros?.length ?? 0, retirosData.retiros)
      if (retirosData.ok) {
        const postCorte = (retirosData.retiros || []).filter(r =>
          new Date(r.creado_en) > new Date(corte.creado_en)
        )
        const totalPostCorte = postCorte.reduce((s, r) => s + r.monto, 0)
        console.log('[caja] fondo bruto:', corte.total_contado, '| retiros post-corte:', totalPostCorte, '| fondo final:', corte.total_contado - totalPostCorte)
        setRetirosPostCorte(totalPostCorte)
      }
    }
  }

  const cargarResumenTurno = async (apertura) => {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const ref = apertura ?? turnoActual
    const desde = ref?.creado_en ? `&desde=${encodeURIComponent(ref.creado_en)}` : ''
    console.log('[caja] cargarResumenTurno desde:', ref?.creado_en ?? '(sin desde, usa inicio del día)')
    const res = await fetch(`/api/caja?resumen=true&fecha=${hoy}${desde}`)
    const data = await res.json()
    console.log('[caja] resumenTurno raw:', data)
    if (data.ok) {
      console.log('[caja] totalRetiros del turno:', data.totalRetiros, '| efectivo:', data.efectivo)
      setResumenTurno({
        efectivo: data.efectivo,
        transferencia: data.transferencia,
        terminal: data.terminal,
        totalRetiros: data.totalRetiros || 0
      })
    }
  }

  const calcularTotal = (d) => {
    return (d.b1000 * 1000) + (d.b500 * 500) + (d.b200 * 200) +
      (d.b100 * 100) + (d.b50 * 50) + (d.b20 * 20) +
      (d.m20 * 20) + (d.m10 * 10) + (d.m5 * 5) +
      (d.m2 * 2) + (d.m1 * 1) + (d.m50c * 0.5)
  }

  const totalContado = calcularTotal(denominaciones)
  const fondoEsperado = Math.max(0, (ultimoCorte?.total_contado || 0) - retirosPostCorte)
  const diferencia = totalContado - fondoEsperado
  const hayDiferencia = ultimoCorte ? Math.abs(diferencia) > 0.01 : false

  const totalEsperadoCorte = (turnoActual?.total_contado || 0) + resumenTurno.efectivo - resumenTurno.totalRetiros
  const diferenciaCorte = totalContado - totalEsperadoCorte
  const hayDiferenciaCorte = Math.abs(diferenciaCorte) > 0.01

  const registrarApertura = async () => {
    if (hayDiferencia && !justificacion.trim()) {
      setError('Escribe una justificación para la diferencia'); return
    }
    setGuardando(true)
    const res = await fetch('/api/caja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colaborador_id: colaborador.id,
        tipo: 'apertura',
        billetes_1000: denominaciones.b1000,
        billetes_500: denominaciones.b500,
        billetes_200: denominaciones.b200,
        billetes_100: denominaciones.b100,
        billetes_50: denominaciones.b50,
        billetes_20: denominaciones.b20,
        monedas_20: denominaciones.m20,
        monedas_10: denominaciones.m10,
        monedas_5: denominaciones.m5,
        monedas_2: denominaciones.m2,
        monedas_1: denominaciones.m1,
        monedas_50c: denominaciones.m50c,
        total_contado: totalContado,
        total_esperado: fondoEsperado,
        diferencia,
        justificacion: hayDiferencia ? justificacion : null
      })
    })
    const data = await res.json()
    setGuardando(false)
    if (data.ok) window.location.href = colaborador?.rol === 'admin' ? '/admin/punto-venta' : '/pos/punto-venta'
    else setError(data.mensaje)
  }

  const registrarCorte = async () => {
    if (hayDiferenciaCorte && !justificacion.trim()) {
      setError('Escribe una justificación para la diferencia'); return
    }
    setGuardando(true)
    const res = await fetch('/api/caja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colaborador_id: colaborador.id,
        tipo: 'corte',
        billetes_1000: denominaciones.b1000,
        billetes_500: denominaciones.b500,
        billetes_200: denominaciones.b200,
        billetes_100: denominaciones.b100,
        billetes_50: denominaciones.b50,
        billetes_20: denominaciones.b20,
        monedas_20: denominaciones.m20,
        monedas_10: denominaciones.m10,
        monedas_5: denominaciones.m5,
        monedas_2: denominaciones.m2,
        monedas_1: denominaciones.m1,
        monedas_50c: denominaciones.m50c,
        total_contado: totalContado,
        total_esperado: totalEsperadoCorte,
        diferencia: diferenciaCorte,
        total_efectivo: resumenTurno.efectivo,
        total_transferencia: resumenTurno.transferencia,
        total_terminal: resumenTurno.terminal,
        total_retiros: resumenTurno.totalRetiros,
        justificacion: hayDiferenciaCorte ? justificacion : null
      })
    })
    const data = await res.json()
    setGuardando(false)
    if (data.ok) cargarEstado(colaborador.id)
    else setError(data.mensaje)
  }

  const abrirNuevoTurno = async () => {
    await cargarUltimoCorteGlobal()
    setDenominaciones({ b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m50c: 0 })
    setJustificacion('')
    setError('')
    setPaso('apertura')
  }

  const setDen = (campo, valor) => {
    setDenominaciones(prev => ({ ...prev, [campo]: parseFloat(valor) || 0 }))
  }


  if (paso === 'cargando') return (
    <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--w40)' }}>Cargando...</div>
    </div>
  )

  const iniciales = (colaborador?.nombre || 'Colaborador').trim().split(/\s+/).slice(0, 2).map(n => n[0] || '').join('').toUpperCase()
  const contexto = {
    apertura: { icon: '🔓', bg: 'rgba(193,85,58,0.16)', titulo: 'Apertura de turno' },
    turno: { icon: '💰', bg: 'rgba(52,211,153,0.16)', titulo: 'Turno activo' },
    haciendo_corte: { icon: '🔒', bg: 'rgba(250,204,21,0.16)', titulo: 'Corte de turno' },
    corte_hecho: { icon: '✅', bg: 'rgba(52,211,153,0.16)', titulo: 'Turno cerrado' },
  }[paso] || { icon: '💰', bg: 'rgba(52,211,153,0.16)', titulo: '' }

  const ctaPrimaria = { background: 'linear-gradient(135deg,var(--ambar),#eab308)', color: '#ffffff', border: 'none', boxShadow: '0 8px 22px rgba(250,204,21,0.26)' }
  const ctaPrimariaDeshabilitada = { background: 'rgba(250,204,21,0.2)', color: 'var(--w40)', border: 'none', boxShadow: 'none' }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: 'var(--tinta)', padding: '26px 16px 60px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Barra de usuario — no aparece en corte_hecho */}
        {paso !== 'corte_hecho' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(193,85,58,0.18)', border: '1px solid rgba(193,85,58,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--marca-t)' }}>
                {iniciales}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{colaborador?.nombre || 'Colaborador'}</div>
            </div>
            <button
              onClick={() => { localStorage.removeItem('colaborador'); router.push('/') }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--rojo-t)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              ⎋ Cerrar sesión
            </button>
          </div>
        )}

        {/* Fila de contexto — no aparece en corte_hecho */}
        {paso !== 'corte_hecho' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <button onClick={() => router.back()}
              style={{ background: 'var(--w06)', color: 'var(--w70)', border: '1px solid var(--w14)', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ← Regresar
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: contexto.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{contexto.icon}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{contexto.titulo}</div>
                <div style={{ fontSize: 13, color: 'var(--w45)', marginTop: 2 }}>{colaborador?.nombre}</div>
              </div>
            </div>
          </div>
        )}

        {/* APERTURA */}
        {paso === 'apertura' && (
          <div>
            {ultimoCorte && (
              <div style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.3)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', color: 'var(--marca-t)' }}>Fondo disponible</div>
                <div style={{ color: 'var(--marca-t)', fontSize: 32, fontWeight: 900, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fmt(fondoEsperado)}</div>
                <div style={{ color: 'var(--w40)', fontSize: 12, marginTop: 6 }}>Corte de {ultimoCorte.clientes?.nombre} — {formatearFecha(ultimoCorte.creado_en)}</div>
                {retirosPostCorte > 0 && (
                  <div style={{ color: 'var(--rojo-t)', fontSize: 11, marginTop: 4 }}>
                    {fmt(ultimoCorte.total_contado)} fondo − {fmt(retirosPostCorte)} retiros registrados
                  </div>
                )}
              </div>
            )}
            {!ultimoCorte && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <div style={{ color: 'var(--ambar-t)', fontSize: 13, fontWeight: 600 }}>⚠️ Primera apertura del sistema — cuenta el efectivo en caja</div>
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Cuenta el efectivo físico en caja</div>
            <div style={{ fontSize: 13, color: 'var(--w45)', marginBottom: 18 }}>Ingresa cuántas piezas de cada denominación hay en la caja.</div>
            <ConteoEfectivo denominaciones={denominaciones} onChange={setDen} />
            {ultimoCorte ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch', marginBottom: 16 }}>
                  <div style={{ background: 'var(--sup)', border: '1px solid var(--w14)', borderRadius: 16, padding: 18, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--w50)' }}>Contado</div>
                    <div style={{ fontSize: 15, color: 'var(--w40)', marginTop: 3 }}>lo que hay físico</div>
                    <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalContado)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'var(--w30)', fontWeight: 700 }}>vs</div>
                  <div style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.35)', borderRadius: 16, padding: 18, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--marca-t)' }}>Fondo esperado</div>
                    <div style={{ fontSize: 15, color: 'var(--w40)', marginTop: 3 }}>del turno anterior</div>
                    <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8, color: 'var(--marca-t)', fontVariantNumeric: 'tabular-nums' }}>{fmt(fondoEsperado)}</div>
                  </div>
                </div>

                <div style={{
                  background: !hayDiferencia ? 'rgba(52,211,153,0.1)' : diferencia > 0 ? 'rgba(250,204,21,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `2px solid ${!hayDiferencia ? 'rgba(52,211,153,0.5)' : diferencia > 0 ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.55)'}`,
                  borderRadius: 16, padding: '18px 20px', marginBottom: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'var(--w06)',
                      border: `1px solid ${!hayDiferencia ? 'rgba(52,211,153,0.5)' : diferencia > 0 ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.55)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    }}>
                      {!hayDiferencia ? '✅' : diferencia > 0 ? '🟡' : '🔴'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--w55)' }}>
                        {!hayDiferencia ? 'Fondo correcto' : diferencia > 0 ? 'Sobrante vs. fondo esperado' : 'Faltante vs. fondo esperado'}
                      </div>
                      <div style={{
                        fontSize: 26, fontWeight: 900, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums',
                        color: !hayDiferencia ? 'var(--verde)' : diferencia > 0 ? 'var(--ambar-t)' : 'var(--rojo-t)',
                      }}>
                        {!hayDiferencia ? 'Exacto ✓' : diferencia > 0 ? `+ ${fmt(diferencia)}` : `− ${fmt(Math.abs(diferencia))}`}
                      </div>
                    </div>
                  </div>
                  {hayDiferencia && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w70)', marginBottom: 6 }}>Justificación obligatoria</div>
                      <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                        placeholder="Explica el motivo de la diferencia…"
                        rows={3}
                        style={{ width: '100%', minHeight: 80, resize: 'vertical', background: 'var(--w25)', border: '1px solid var(--w15)', borderRadius: 10, padding: '12px 14px', color: 'var(--tinta)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w14)', borderRadius: 16, padding: 18, textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--w50)' }}>Contado</div>
                <div style={{ fontSize: 15, color: 'var(--w40)', marginTop: 3 }}>lo que hay físico</div>
                <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalContado)}</div>
              </div>
            )}
            {error && <div style={{ color: 'var(--rojo-t)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <button
              onClick={registrarApertura}
              disabled={guardando || totalContado === 0 || (hayDiferencia && !justificacion.trim())}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                borderRadius: 14, padding: 18, fontSize: 17, fontWeight: 900,
                cursor: guardando || totalContado === 0 || (hayDiferencia && !justificacion.trim()) ? 'not-allowed' : 'pointer',
                ...(guardando || totalContado === 0 || (hayDiferencia && !justificacion.trim()) ? ctaPrimariaDeshabilitada : ctaPrimaria),
              }}>
              {guardando ? 'Registrando...' : '🔓 Abrir turno'}
            </button>
          </div>
        )}

        {/* TURNO ACTIVO — Resumen del turno */}
        {paso === 'turno' && (
          <div>
            <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,rgba(52,211,153,0.16),rgba(52,211,153,0.03))', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 18, padding: '26px 28px', marginBottom: 24 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase', color: 'var(--verde)' }}>Fondo inicial de tu turno</div>
              <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 8, color: 'var(--verde)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(turnoActual?.total_contado)}</div>
              <div style={{ position: 'absolute', right: -10, bottom: -14, fontSize: 120, opacity: 0.06 }}>💵</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', color: 'var(--w50)' }}>Resumen del turno</div>
              <button
                onClick={() => cargarResumenTurno(turnoActual)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(193,85,58,0.14)', color: 'var(--marca-t)', border: '1px solid rgba(193,85,58,0.35)', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                ↻ Actualizar
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>💵</span>
                  <span style={{ fontSize: 13, color: 'var(--w60)', fontWeight: 600 }}>Efectivo cobrado</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmt(resumenTurno.efectivo)}</div>
              </div>
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>🏦</span>
                  <span style={{ fontSize: 13, color: 'var(--w60)', fontWeight: 600 }}>Transferencia</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--azul)', fontVariantNumeric: 'tabular-nums' }}>{fmt(resumenTurno.transferencia)}</div>
              </div>
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>💳</span>
                  <span style={{ fontSize: 13, color: 'var(--w60)', fontWeight: 600 }}>Terminal</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmt(resumenTurno.terminal)}</div>
              </div>
            </div>

            <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: '6px 20px', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--w06)' }}>
                <span style={{ fontSize: 14, color: 'var(--w60)' }}>Fondo inicial</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(turnoActual?.total_contado)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--w06)' }}>
                <span style={{ fontSize: 14, color: 'var(--w60)' }}>+ Efectivo cobrado</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(resumenTurno.efectivo)}</span>
              </div>
              {resumenTurno.totalRetiros > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--w06)' }}>
                  <span style={{ fontSize: 14, color: 'var(--w60)' }}>− Retiros confirmados</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--rojo-t)', fontVariantNumeric: 'tabular-nums' }}>−{fmt(resumenTurno.totalRetiros)}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0' }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>Debería haber en caja</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--verde)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalEsperadoCorte)}</span>
              </div>
            </div>

            <button onClick={() => {
              setPaso('haciendo_corte')
              setDenominaciones({ b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m50c: 0 })
            }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, padding: 18, fontSize: 17, fontWeight: 900, cursor: 'pointer', ...ctaPrimaria }}>
              🔒 Hacer corte de turno
            </button>
          </div>
        )}

        {/* HACIENDO CORTE — Corte de turno */}
        {paso === 'haciendo_corte' && (
          <div>
            <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: '6px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--w06)' }}>
                <span style={{ fontSize: 14, color: 'var(--w60)' }}>Fondo inicial</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(turnoActual?.total_contado)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--w06)' }}>
                <span style={{ fontSize: 14, color: 'var(--w60)' }}>+ Efectivo cobrado</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(resumenTurno.efectivo)}</span>
              </div>
              {resumenTurno.totalRetiros > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--w06)' }}>
                  <span style={{ fontSize: 14, color: 'var(--w60)' }}>− Retiros confirmados</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--rojo-t)', fontVariantNumeric: 'tabular-nums' }}>−{fmt(resumenTurno.totalRetiros)}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0' }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>Debería haber</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--verde)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalEsperadoCorte)}</span>
              </div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Cuenta el efectivo físico en caja</div>
            <div style={{ fontSize: 13, color: 'var(--w45)', marginBottom: 18 }}>Ingresa cuántas piezas de cada denominación hay en la caja.</div>
            <ConteoEfectivo denominaciones={denominaciones} onChange={setDen} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch', marginBottom: 16 }}>
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w14)', borderRadius: 16, padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--w50)' }}>Contado</div>
                <div style={{ fontSize: 15, color: 'var(--w40)', marginTop: 3 }}>lo que hay físico</div>
                <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalContado)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: 'var(--w30)', fontWeight: 700 }}>vs</div>
              <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 16, padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--verde)' }}>Debería haber</div>
                <div style={{ fontSize: 15, color: 'var(--w40)', marginTop: 3 }}>según el sistema</div>
                <div style={{ fontSize: 32, fontWeight: 900, marginTop: 8, color: 'var(--verde)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalEsperadoCorte)}</div>
              </div>
            </div>

            <div style={{
              background: !hayDiferenciaCorte ? 'rgba(52,211,153,0.1)' : diferenciaCorte > 0 ? 'rgba(250,204,21,0.1)' : 'rgba(239,68,68,0.1)',
              border: `2px solid ${!hayDiferenciaCorte ? 'rgba(52,211,153,0.5)' : diferenciaCorte > 0 ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.55)'}`,
              borderRadius: 16, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'var(--w06)',
                  border: `1px solid ${!hayDiferenciaCorte ? 'rgba(52,211,153,0.5)' : diferenciaCorte > 0 ? 'rgba(250,204,21,0.5)' : 'rgba(239,68,68,0.55)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                }}>
                  {!hayDiferenciaCorte ? '✅' : diferenciaCorte > 0 ? '🟡' : '🔴'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--w55)' }}>
                    {!hayDiferenciaCorte ? 'Caja cuadrada' : diferenciaCorte > 0 ? 'Sobrante en caja' : 'Faltante en caja'}
                  </div>
                  <div style={{
                    fontSize: 26, fontWeight: 900, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums',
                    color: !hayDiferenciaCorte ? 'var(--verde)' : diferenciaCorte > 0 ? 'var(--ambar-t)' : 'var(--rojo-t)',
                  }}>
                    {!hayDiferenciaCorte ? 'Exacto ✓' : diferenciaCorte > 0 ? `+ ${fmt(diferenciaCorte)}` : `− ${fmt(Math.abs(diferenciaCorte))}`}
                  </div>
                </div>
              </div>
              {hayDiferenciaCorte && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--w70)', marginBottom: 6 }}>Justificación obligatoria</div>
                  <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                    placeholder="Explica el motivo de la diferencia…"
                    rows={3}
                    style={{ width: '100%', minHeight: 80, resize: 'vertical', background: 'var(--w25)', border: '1px solid var(--w15)', borderRadius: 10, padding: '12px 14px', color: 'var(--tinta)', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>

            {error && <div style={{ color: 'var(--rojo-t)', fontSize: 12, marginTop: 10 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
              <button
                onClick={registrarCorte}
                disabled={guardando || totalContado === 0 || (hayDiferenciaCorte && !justificacion.trim())}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 900,
                  cursor: guardando || totalContado === 0 || (hayDiferenciaCorte && !justificacion.trim()) ? 'not-allowed' : 'pointer',
                  ...(guardando || totalContado === 0 || (hayDiferenciaCorte && !justificacion.trim()) ? ctaPrimariaDeshabilitada : ctaPrimaria),
                }}>
                {guardando ? 'Registrando...' : '🔒 Registrar corte'}
              </button>
              <button onClick={() => setPaso('turno')}
                style={{ flex: 'none', background: 'transparent', color: 'var(--w60)', border: '1px solid var(--w15)', borderRadius: 14, padding: '16px 26px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* CORTE HECHO */}
        {paso === 'corte_hecho' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>✅</div>
            <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Turno cerrado</div>
            <div style={{ color: 'var(--w45)', fontSize: 13, marginBottom: 24 }}>El siguiente colaborador puede abrir su turno</div>
            <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--w50)', fontSize: 12 }}>Fondo que queda en caja</span>
                <span style={{ color: 'var(--verde)', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(ultimoCorte?.total_contado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--w50)', fontSize: 12 }}>Transferencias del turno</span>
                <span style={{ color: 'var(--tinta)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(ultimoCorte?.total_transferencia)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--w50)', fontSize: 12 }}>Terminal del turno</span>
                <span style={{ color: 'var(--tinta)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(ultimoCorte?.total_terminal)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                setTurnoActual(null)
                setResumenTurno({ efectivo: 0, transferencia: 0, terminal: 0, totalRetiros: 0 })
                cargarUltimoCorteGlobal()
                setPaso('apertura')
              }}
              style={{ background: 'var(--marca)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px 28px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: '12px' }}
            >
              🏪 Abrir nueva caja
            </button>
            <button
              onClick={() => router.push('/admin/inicio')}
              style={{ background: 'rgba(139,124,246,0.12)', border: '1px solid rgba(139,124,246,0.3)', color: '#a89af8', borderRadius: '12px', padding: '12px 28px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: '12px' }}
            >
              ← Volver al menú
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('colaborador')
                router.push('/')
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--w50)', fontSize: '13px', padding: '8px', cursor: 'pointer', marginTop: '8px' }}
            >
              ⎋ Cerrar sesión
            </button>
          </div>
        )}

      </div>
    </div>
  )
}