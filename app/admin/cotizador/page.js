'use client'
import { useState } from 'react'

export default function Cotizador() {
  const [precioUSD, setPrecioUSD] = useState(45.99)
  const [tipoCambio, setTipoCambio] = useState(18.50)
  const [taxTipo, setTaxTipo] = useState('arizona')
  const [taxDenog, setTaxDenog] = useState(10)
  const [ganancia, setGanancia] = useState(30)

  const getTaxPct = () => {
    if (taxTipo === 'arizona') return 8.6
    if (taxTipo === 'california') return 7.75
    return taxDenog
  }

  const getTaxNombre = () => {
    if (taxTipo === 'arizona') return 'Arizona'
    if (taxTipo === 'california') return 'California'
    return 'Tax Denog'
  }

  const taxPct = getTaxPct()
  const taxMonto = precioUSD * (taxPct / 100)
  const costoUSD = precioUSD + taxMonto
  const costoMXN = costoUSD * tipoCambio
  const ganMXN = costoMXN * (ganancia / 100)
  const precioFinal = costoMXN + ganMXN
  const precioRedondeado = Math.ceil(precioFinal / 5) * 5

  const fmt = (n) => `$${(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
  const fmtR = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`

  const taxBtns = [
    { id: 'arizona', label: 'Arizona', pct: '8.6%' },
    { id: 'california', label: 'California', pct: '7.75%' },
    { id: 'denog', label: 'Tax Denog', pct: `${taxDenog}%` },
  ]

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">

        <div style={{ marginBottom: 24 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 700 }}>🧮 Cotizador</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 2 }}>Calcula el precio de venta de tus productos</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

          {/* Precio USD */}
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Precio en dólares</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--w30)', fontSize: 16 }}>$</span>
              <input type="number" value={precioUSD} onChange={e => setPrecioUSD(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--tinta)', fontSize: 22, fontWeight: 700, outline: 'none', width: '100%' }} />
              <span style={{ color: 'var(--w30)', fontSize: 12 }}>USD</span>
            </div>
          </div>

          {/* Tipo de cambio */}
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tipo de cambio</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--w30)', fontSize: 16 }}>$</span>
              <input type="number" value={tipoCambio} onChange={e => setTipoCambio(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--tinta)', fontSize: 22, fontWeight: 700, outline: 'none', width: '100%' }} />
              <span style={{ color: 'var(--w30)', fontSize: 12 }}>MXN</span>
            </div>
          </div>

          {/* Tax */}
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Estado / Tax</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: taxTipo === 'denog' ? 10 : 0 }}>
              {taxBtns.map(btn => {
                const activo = taxTipo === btn.id
                const colorActivo = btn.id === 'denog' ? 'var(--ambar)' : 'var(--marca-t)'
                const bgActivo = btn.id === 'denog' ? 'rgba(245,158,11,0.15)' : 'rgba(193,85,58,0.2)'
                const borderActivo = btn.id === 'denog' ? 'rgba(245,158,11,0.35)' : 'rgba(193,85,58,0.4)'
                return (
                  <button key={btn.id} onClick={() => setTaxTipo(btn.id)}
                    style={{ flex: 1, background: activo ? bgActivo : 'var(--w03)', border: `1px solid ${activo ? borderActivo : 'var(--w08)'}`, borderRadius: 10, padding: '7px 4px', cursor: 'pointer' }}>
                    <div style={{ color: activo ? colorActivo : 'var(--w50)', fontSize: 11, fontWeight: 600 }}>{btn.label}</div>
                    <div style={{ color: activo ? colorActivo : 'var(--w30)', fontSize: 10, opacity: 0.7 }}>{btn.pct}</div>
                  </button>
                )
              })}
            </div>
            {taxTipo === 'denog' && (
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'rgba(245,158,11,0.6)', fontSize: 11 }}>Tax Denog:</span>
                <input type="number" value={taxDenog} min="0" max="50" step="0.1"
                  onChange={e => setTaxDenog(parseFloat(e.target.value) || 0)}
                  style={{ width: 60, background: 'transparent', border: 'none', color: 'var(--ambar)', fontSize: 18, fontWeight: 700, outline: 'none', textAlign: 'center' }} />
                <span style={{ color: 'rgba(245,158,11,0.6)', fontSize: 11 }}>%</span>
              </div>
            )}
          </div>

          {/* Ganancia */}
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Ganancia</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="number" value={ganancia} onChange={e => setGanancia(parseFloat(e.target.value) || 0)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--tinta)', fontSize: 22, fontWeight: 700, outline: 'none', width: '100%' }} />
              <span style={{ color: 'var(--w30)', fontSize: 16 }}>%</span>
            </div>
            <input type="range" min="5" max="80" value={ganancia}
              onChange={e => setGanancia(parseFloat(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: 'var(--marca-t)' }} />
          </div>
        </div>

        {/* Desglose */}
        <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Desglose del precio</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--w50)', fontSize: 13 }}>Precio en USD</span>
            <span style={{ color: 'var(--tinta)', fontSize: 13 }}>{fmt(precioUSD)} USD</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--w50)', fontSize: 13 }}>{getTaxNombre()} ({taxPct}%)</span>
            <span style={{ color: 'var(--w60)', fontSize: 13 }}>+{fmt(taxMonto)} USD</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--w06)' }}>
            <span style={{ color: 'var(--w50)', fontSize: 13 }}>Costo total en MXN</span>
            <span style={{ color: 'var(--w60)', fontSize: 13 }}>{fmt(costoMXN)} MXN</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--w50)', fontSize: 13 }}>Tu ganancia ({ganancia}%)</span>
            <span style={{ color: 'var(--verde)', fontSize: 13 }}>+{fmt(ganMXN)} MXN</span>
          </div>
        </div>

        {/* Precio final */}
        <div style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 18, padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--w50)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Precio de venta al cliente</div>
          <div style={{ color: 'var(--tinta)', fontSize: 56, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
            {`$${precioRedondeado.toLocaleString('es-MX')}`}
          </div>
          <div style={{ color: 'var(--w30)', fontSize: 11, marginTop: 6, marginBottom: 16 }}>MXN · Redondeado al siguiente $5</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--w30)', fontSize: 10, marginBottom: 2 }}>Tu costo</div>
              <div style={{ color: 'var(--w60)', fontSize: 14, fontWeight: 600 }}>{fmtR(costoMXN)} MXN</div>
            </div>
            <div style={{ width: 1, background: 'var(--w10)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--w30)', fontSize: 10, marginBottom: 2 }}>Tu ganancia</div>
              <div style={{ color: 'var(--verde)', fontSize: 14, fontWeight: 600 }}>{fmtR(ganMXN)} MXN</div>
            </div>
            <div style={{ width: 1, background: 'var(--w10)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--w30)', fontSize: 10, marginBottom: 2 }}>Margen</div>
              <div style={{ color: 'var(--marca-t)', fontSize: 14, fontWeight: 600 }}>{ganancia}%</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}