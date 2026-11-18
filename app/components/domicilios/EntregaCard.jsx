'use client'

// Una tarjeta por entrega (estado de cuenta): arriba la fecha, el total y cuánto
// debe; al seleccionarla se abre la lista de preparación SOLO de esa entrega,
// con los frágiles primero (llevar aparte) y el resto abajo. Así nada se mezcla
// entre entregas. Compartida por admin y POS.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fecha = (f) => { if (!f) return ''; const d = new Date(f + 'T12:00:00'); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` }
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const pzs = (n) => `${n} pieza${n === 1 ? '' : 's'}`
const piezas = (p) => p.cantidad || 1
const empacado = (p) => String(p.estado || '').toLowerCase() === 'empacado'

const chip = (texto, fondo, color) => (
  <span style={{ background: fondo, color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 7, whiteSpace: 'nowrap' }}>{texto}</span>
)
const AMBAR = ['rgba(245,158,11,0.16)', 'var(--ambar)']
const VERDE = ['rgba(74,222,128,0.14)', 'var(--verde)']

function Fila({ p }) {
  const falta = !empacado(p)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: '1px solid var(--w06)', background: falta ? 'rgba(245,158,11,0.07)' : 'transparent' }}>
      <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 8, background: 'var(--w05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
        {p.imagen_url_firmada
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imagen_url_firmada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : '📦'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.descripcion}</div>
        {falta && <div style={{ marginTop: 3 }}>{chip('Falta empacar', ...AMBAR)}</div>}
      </div>
      <div style={{ flex: 'none', background: 'var(--w05)', color: 'var(--tinta)', fontSize: 13, fontWeight: 700, padding: '3px 9px', borderRadius: 8 }}>× {piezas(p)}</div>
    </div>
  )
}

export default function EntregaCard({ entrega, esPrimera, seleccionada, bloqueada, anticipos, onToggle }) {
  const productos = entrega.productos || []
  const total = productos.reduce((s, p) => s + piezas(p), 0)
  const fragiles = productos.filter(p => p.apartado_fragil)
  const resto = productos.filter(p => !p.apartado_fragil)
  const piezasFragiles = fragiles.reduce((s, p) => s + piezas(p), 0)
  const sinEmpacar = productos.filter(p => !empacado(p)).reduce((s, p) => s + piezas(p), 0)
  const pagado = (anticipos || []).reduce((s, a) => s + (a.monto || 0), 0)
  const debe = Math.max(0, entrega.total - pagado)

  const borde = seleccionada ? 'rgba(245,158,11,0.5)' : 'var(--w08)'
  return (
    <div style={{ border: `1.5px solid ${borde}`, borderRadius: 14, marginBottom: 8, overflow: 'hidden', background: seleccionada ? 'rgba(245,158,11,0.04)' : 'var(--w03)', opacity: bloqueada ? 0.55 : 1 }}>
      <div onClick={() => !bloqueada && onToggle()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: bloqueada ? 'not-allowed' : 'pointer' }}>
        <div style={{ width: 22, height: 22, flex: 'none', borderRadius: 7, border: `2px solid ${seleccionada ? 'var(--ambar)' : 'var(--w20)'}`, background: seleccionada ? 'rgba(245,158,11,0.18)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ambar)', fontSize: 13, fontWeight: 700 }}>
          {seleccionada ? '✓' : bloqueada ? '🔒' : ''}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 700 }}>Entrega del {fecha(entrega.fecha)}</span>
            {esPrimera && chip('Más antigua', 'rgba(239,68,68,0.12)', 'var(--rojo-t)')}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
            {chip(pzs(total), 'var(--w05)', 'var(--w60)')}
            {piezasFragiles > 0 && chip(`⚠️ ${pzs(piezasFragiles)} frágil${piezasFragiles === 1 ? '' : 'es'}`, ...AMBAR)}
            {sinEmpacar > 0 ? chip(`${sinEmpacar} sin empacar`, ...AMBAR) : chip('✓ Todo empacado', ...VERDE)}
          </div>
        </div>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ color: 'var(--w50)', fontSize: 11 }}>Total {fmt(entrega.total)}</div>
          <div style={{ marginTop: 3 }}>{debe > 0 ? chip(`Debe ${fmt(debe)}`, 'rgba(239,68,68,0.12)', 'var(--rojo-t)') : chip('Pagada', ...VERDE)}</div>
        </div>
      </div>

      {bloqueada && <div style={{ padding: '0 12px 10px 44px', color: 'var(--w40)', fontSize: 11 }}>🔒 Selecciona primero la entrega anterior</div>}

      {seleccionada && (
        <div>
          {anticipos?.length > 0 && (
            <details style={{ padding: '0 12px 8px 44px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--verde)', fontSize: 11 }}>Anticipos: −{fmt(pagado)} ({anticipos.length})</summary>
              {anticipos.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--w50)', padding: '2px 0', maxWidth: 260 }}>
                  <span>{a.creado_en ? fecha(String(a.creado_en).slice(0, 10)) : ''}</span><span style={{ color: 'var(--verde)' }}>−{fmt(a.monto)}</span>
                </div>
              ))}
            </details>
          )}
          {fragiles.length > 0 && (
            <>
              <div style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--ambar)', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderTop: '1px solid var(--w06)' }}>⚠️ Frágiles: llevar aparte</div>
              {fragiles.map((p, i) => <Fila key={p.id ?? `f${i}`} p={p} />)}
            </>
          )}
          {resto.length > 0 && (
            <>
              {fragiles.length > 0 && <div style={{ background: 'var(--w04)', color: 'var(--w50)', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderTop: '1px solid var(--w06)' }}>Resto de la entrega</div>}
              {resto.map((p, i) => <Fila key={p.id ?? `r${i}`} p={p} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
