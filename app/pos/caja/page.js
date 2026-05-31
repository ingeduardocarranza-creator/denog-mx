'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

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
  const [resumenTurno, setResumenTurno] = useState({ efectivo: 0, transferencia: 0, terminal: 0 })
  const [justificacion, setJustificacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    const c = JSON.parse(datos)
    setColaborador(c)
    cargarEstado(c.id)
  }, [])

  const cargarEstado = async (colaborador_id) => {
    const ahora = new Date()
const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const res = await fetch(`/api/caja?fecha=${hoy}`)
    const data = await res.json()

    if (data.ok && data.cortes.length > 0) {
      const misCortes = data.cortes.filter(c => c.colaborador_id === colaborador_id)
      const ultimaApertura = misCortes.find(c => c.tipo === 'apertura')
      const ultimoCorteFinal = misCortes.find(c => c.tipo === 'corte')

      if (ultimoCorteFinal) {
        setUltimoCorte(ultimoCorteFinal)
        setPaso('corte_hecho')
      } else if (ultimaApertura) {
        setTurnoActual(ultimaApertura)
        await cargarResumenTurno()
        setPaso('turno')
      } else {
        await cargarUltimoCorteGlobal()
        setPaso('apertura')
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
      setUltimoCorte(data.cortes[0])
    }
  }

  const cargarResumenTurno = async () => {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const res = await fetch(`/api/caja?resumen=true&fecha=${hoy}`)
    const data = await res.json()
    if (data.ok) {
      setResumenTurno({ efectivo: data.efectivo, transferencia: data.transferencia, terminal: data.terminal })
    }
  }

  const calcularTotal = (d) => {
    return (d.b1000 * 1000) + (d.b500 * 500) + (d.b200 * 200) +
      (d.b100 * 100) + (d.b50 * 50) + (d.b20 * 20) +
      (d.m20 * 20) + (d.m10 * 10) + (d.m5 * 5) +
      (d.m2 * 2) + (d.m1 * 1) + (d.m50c * 0.5)
  }

  const totalContado = calcularTotal(denominaciones)
  const fondoEsperado = ultimoCorte?.total_contado || 0
  const diferencia = totalContado - fondoEsperado
  const hayDiferencia = ultimoCorte ? Math.abs(diferencia) > 0.01 : false

  const totalEsperadoCorte = (turnoActual?.total_contado || 0) + resumenTurno.efectivo
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
    if (data.ok) cargarEstado(colaborador.id)
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
        justificacion: hayDiferenciaCorte ? justificacion : null
      })
    })
    const data = await res.json()
    setGuardando(false)
    if (data.ok) cargarEstado(colaborador.id)
    else setError(data.mensaje)
  }

  const setDen = (campo, valor) => {
    setDenominaciones(prev => ({ ...prev, [campo]: parseFloat(valor) || 0 }))
  }

  const DenominacionInput = ({ label, campo, monto }) => {
    const subtotal = (denominaciones[campo] || 0) * monto
    return (
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 12px' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 6 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="0" value={denominaciones[campo]}
            onChange={e => setDen(campo, e.target.value)}
            style={{ width: 60, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 8px', color: 'white', fontSize: 13, textAlign: 'center', outline: 'none' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>= {fmt(subtotal)}</span>
        </div>
      </div>
    )
  }

  const GridDenominaciones = () => (
    <div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Billetes</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        <DenominacionInput label="$1,000" campo="b1000" monto={1000} />
        <DenominacionInput label="$500" campo="b500" monto={500} />
        <DenominacionInput label="$200" campo="b200" monto={200} />
        <DenominacionInput label="$100" campo="b100" monto={100} />
        <DenominacionInput label="$50" campo="b50" monto={50} />
        <DenominacionInput label="$20" campo="b20" monto={20} />
      </div>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Monedas</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
        <DenominacionInput label="$20" campo="m20" monto={20} />
        <DenominacionInput label="$10" campo="m10" monto={10} />
        <DenominacionInput label="$5" campo="m5" monto={5} />
        <DenominacionInput label="$2" campo="m2" monto={2} />
        <DenominacionInput label="$1" campo="m1" monto={1} />
        <DenominacionInput label="$0.50" campo="m50c" monto={0.5} />
      </div>
    </div>
  )

  if (paso === 'cargando') return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'rgba(255,255,255,0.4)' }}>Cargando...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#050508', padding: '24px 16px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.back()}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
            ← Regresar
          </button>
          <div>
            <div style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>
              {paso === 'apertura' ? '🔓 Apertura de turno' : paso === 'turno' ? '💰 Turno activo' : paso === 'corte_hecho' ? '✅ Turno cerrado' : '🔒 Corte de turno'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{colaborador?.nombre}</div>
          </div>
        </div>

        {/* APERTURA */}
        {paso === 'apertura' && (
          <div>
            {ultimoCorte && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Fondo del turno anterior</div>
                <div style={{ color: '#818cf8', fontSize: 24, fontWeight: 800 }}>{fmt(ultimoCorte.total_contado)}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>Corte de {ultimoCorte.clientes?.nombre} — {formatearFecha(ultimoCorte.creado_en)}</div>
              </div>
            )}

            {!ultimoCorte && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ color: '#f59e0b', fontSize: 12 }}>⚠️ Primera apertura del sistema — cuenta el efectivo en caja</div>
              </div>
            )}

            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 10 }}>Cuenta el efectivo en caja</div>

            <GridDenominaciones />

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Total contado</span>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{fmt(totalContado)}</span>
              </div>
              {ultimoCorte && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Fondo esperado</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{fmt(fondoEsperado)}</span>
                </div>
              )}
            </div>

            {ultimoCorte && hayDiferencia && (
              <div style={{ background: diferencia > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${diferencia > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ color: diferencia > 0 ? '#f59e0b' : '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {diferencia > 0 ? `⚠️ Sobrante de ${fmt(diferencia)}` : `🔴 Faltante de ${fmt(Math.abs(diferencia))}`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 6 }}>Justificación obligatoria</div>
                <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                  placeholder="Explica el motivo de la diferencia..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            )}

            {ultimoCorte && !hayDiferencia && totalContado > 0 && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                <span style={{ color: '#10b981', fontSize: 13 }}>✅ Fondo correcto — coincide con el turno anterior</span>
              </div>
            )}

            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <button onClick={registrarApertura} disabled={guardando || totalContado === 0}
              style={{ width: '100%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: 13, color: '#818cf8', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardando || totalContado === 0 ? 0.5 : 1 }}>
              {guardando ? 'Registrando...' : '🔓 Abrir turno'}
            </button>
          </div>
        )}

        {/* TURNO ACTIVO */}
        {paso === 'turno' && (
          <div>
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Fondo inicial de tu turno</div>
              <div style={{ color: '#10b981', fontSize: 24, fontWeight: 800 }}>{fmt(turnoActual?.total_contado)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4 }}>Efectivo cobrado</div>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>{fmt(resumenTurno.efectivo)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4 }}>Transferencia</div>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>{fmt(resumenTurno.transferencia)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginBottom: 4 }}>Terminal</div>
                <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>{fmt(resumenTurno.terminal)}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Debería haber en caja</span>
                <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>{fmt(totalEsperadoCorte)}</span>
              </div>
            </div>

            <button onClick={() => { setPaso('haciendo_corte'); setDenominaciones({ b1000: 0, b500: 0, b200: 0, b100: 0, b50: 0, b20: 0, m20: 0, m10: 0, m5: 0, m2: 0, m1: 0, m50c: 0 }) }}
              style={{ width: '100%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 13, color: '#f59e0b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Hacer corte de turno
            </button>
          </div>
        )}

        {/* HACIENDO CORTE */}
        {paso === 'haciendo_corte' && (
          <div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Fondo inicial</span>
                <span style={{ color: 'white', fontSize: 13 }}>{fmt(turnoActual?.total_contado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>+ Efectivo cobrado</span>
                <span style={{ color: 'white', fontSize: 13 }}>{fmt(resumenTurno.efectivo)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4 }}>
                <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>Debería haber</span>
                <span style={{ color: '#10b981', fontSize: 15, fontWeight: 800 }}>{fmt(totalEsperadoCorte)}</span>
              </div>
            </div>

            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 10 }}>Cuenta el efectivo físico en caja</div>

            <GridDenominaciones />

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Total contado</span>
                <span style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{fmt(totalContado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Debería haber</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{fmt(totalEsperadoCorte)}</span>
              </div>
            </div>

            {hayDiferenciaCorte && (
              <div style={{ background: diferenciaCorte > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${diferenciaCorte > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ color: diferenciaCorte > 0 ? '#f59e0b' : '#f87171', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {diferenciaCorte > 0 ? `⚠️ Sobrante de ${fmt(diferenciaCorte)}` : `🔴 Faltante de ${fmt(Math.abs(diferenciaCorte))}`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 6 }}>Justificación obligatoria</div>
                <textarea value={justificacion} onChange={e => setJustificacion(e.target.value)}
                  placeholder="Explica el motivo de la diferencia..."
                  rows={3}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 12, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
              </div>
            )}

            {!hayDiferenciaCorte && totalContado > 0 && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                <span style={{ color: '#10b981', fontSize: 13 }}>✅ Todo correcto — el efectivo coincide</span>
              </div>
            )}

            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={registrarCorte} disabled={guardando || totalContado === 0}
                style={{ flex: 1, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: 13, color: '#f59e0b', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: guardando || totalContado === 0 ? 0.5 : 1 }}>
                {guardando ? 'Registrando...' : '🔒 Registrar corte'}
              </button>
              <button onClick={() => setPaso('turno')}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '13px 16px', color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* CORTE HECHO */}
        {paso === 'corte_hecho' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>✅</div>
            <div style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Turno cerrado</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 24 }}>El siguiente colaborador puede abrir su turno</div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Fondo que queda en caja</span>
                <span style={{ color: '#10b981', fontSize: 16, fontWeight: 700 }}>{fmt(ultimoCorte?.total_contado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Transferencias del turno</span>
                <span style={{ color: 'white', fontSize: 13 }}>{fmt(ultimoCorte?.total_transferencia)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Terminal del turno</span>
                <span style={{ color: 'white', fontSize: 13 }}>{fmt(ultimoCorte?.total_terminal)}</span>
              </div>
            </div>
            <button onClick={() => router.back()}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
              ← Regresar al punto de venta
            </button>
          </div>
        )}

      </div>
    </div>
  )
}