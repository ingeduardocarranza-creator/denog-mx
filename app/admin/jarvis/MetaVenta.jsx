'use client'

const VERDE = '#58a700', NARANJA = '#ff9600', AZUL = '#1cb0f6'
const peso = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

// Lo primero que se ve: cuánto lleva vendido la tienda hoy contra la meta del día.
export default function MetaVenta({ venta, esAdmin, irAPlan }) {
  if (!venta) return null
  const { meta, hoy, mia } = venta
  if (!meta) {
    // Sin meta: al colaborador solo se le muestra lo vendido; al admin, cómo fijarla.
    return (
      <div style={{ border: '2px solid rgba(42,33,24,0.10)', borderRadius: 20, padding: 14, marginBottom: 14, background: 'var(--sup, #fff)' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>💰 VENTA DE TIENDA HOY</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: VERDE }}>{peso(hoy)}</div>
        {esAdmin && <button onClick={irAPlan} style={{ border: 0, background: 'transparent', color: AZUL, fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: 0 }}>Fija la meta del día en 🗓️ Plan</button>}
      </div>
    )
  }
  const pct = Math.min(100, Math.round((hoy / meta) * 100))
  const falta = Math.max(0, meta - hoy)
  const lograda = hoy >= meta
  const color = lograda ? VERDE : pct >= 60 ? NARANJA : AZUL
  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: 20, padding: 14, marginBottom: 14, background: 'var(--sup, #fff)', boxShadow: `0 4px 0 ${color}33` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .6 }}>💰 META DE VENTA DE HOY</div>
        <div style={{ fontSize: 13, fontWeight: 900, color }}>{pct}%</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, margin: '2px 0 8px' }}>
        {peso(hoy)} <span style={{ fontSize: 15, opacity: .55 }}>de {peso(meta)}</span>
      </div>
      <div style={{ height: 14, borderRadius: 7, background: 'rgba(42,33,24,0.10)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: 14, background: color, transition: 'width .6s' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, opacity: .8 }}>
        {lograda ? '¡Meta lograda! 🎉 Todo lo que sigue es ganancia extra.' : `Faltan ${peso(falta)}. ¡Cada venta cuenta!`}
        {!esAdmin && mia > 0 ? ` · Tú llevas ${peso(mia)}` : ''}
      </div>
    </div>
  )
}
