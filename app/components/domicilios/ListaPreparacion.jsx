'use client'

// Resumen corto de lo que se va a entregar (todas las entregas seleccionadas):
// piezas, frágiles y cuántas faltan por empacar, con aviso en ámbar. El detalle
// por producto vive dentro de cada EntregaCard. Compartido por admin y POS.
const pzs = (n) => `${n} pieza${n === 1 ? '' : 's'}`
const chip = (texto, fondo, color) => (
  <span style={{ background: fondo, color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 8 }}>{texto}</span>
)

export default function ListaPreparacion({ productos }) {
  const filas = (productos || []).filter(Boolean)
  if (filas.length === 0) return null
  const piezas = (p) => p.cantidad || 1
  const total = filas.reduce((s, p) => s + piezas(p), 0)
  const fragiles = filas.filter(p => p.apartado_fragil).reduce((s, p) => s + piezas(p), 0)
  const sinEmpacar = filas.filter(p => String(p.estado || '').toLowerCase() !== 'empacado').reduce((s, p) => s + piezas(p), 0)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>Se entrega</span>
        {chip(pzs(total), 'rgba(74,222,128,0.14)', 'var(--verde)')}
        {fragiles > 0 && chip(`⚠️ ${pzs(fragiles)} frágil${fragiles === 1 ? '' : 'es'}: llevar aparte`, 'rgba(245,158,11,0.16)', 'var(--ambar)')}
      </div>
      {sinEmpacar > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--ambar)', marginTop: 8 }}>
          ⚠️ Falta empacar {pzs(sinEmpacar)}. Empácalas antes de la entrega para no olvidar nada.
        </div>
      )}
    </div>
  )
}
