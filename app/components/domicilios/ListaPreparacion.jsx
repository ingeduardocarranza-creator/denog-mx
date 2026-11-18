'use client'

// Lista de preparación del pedido: una fila por producto con foto, nombre,
// cantidad, marca de frágil y estado de empaque. Sirve para no olvidar nada
// antes de ir a dejarle el pedido al cliente (volver a llevarlo es costoso).
// Compartido por admin y POS. `productos` son filas de /api/cliente/pedidos
// (traen imagen_url_firmada, descripcion, cantidad, apartado_fragil y estado).
const fmtPiezas = (n) => `${n} pieza${n === 1 ? '' : 's'}`

export default function ListaPreparacion({ productos }) {
  const filas = (productos || []).filter(Boolean)
  if (filas.length === 0) return null

  const piezas = (p) => p.cantidad || 1
  const empacado = (p) => String(p.estado || '').toLowerCase() === 'empacado'
  const total = filas.reduce((s, p) => s + piezas(p), 0)
  const fragiles = filas.filter(p => p.apartado_fragil).reduce((s, p) => s + piezas(p), 0)
  const faltan = filas.filter(p => !empacado(p))
  const piezasFaltan = faltan.reduce((s, p) => s + piezas(p), 0)

  const chip = (texto, fondo, color) => (
    <span style={{ background: fondo, color, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 8 }}>{texto}</span>
  )

  return (
    <div style={{ marginTop: 10, marginBottom: 6 }}>
      <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Lista de preparación</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {chip(fmtPiezas(total) + ' en total', 'rgba(74,222,128,0.12)', 'var(--verde)')}
        {fragiles > 0 && chip(`⚠️ ${fmtPiezas(fragiles)} frágil${fragiles === 1 ? '' : 'es'}: llevar aparte`, 'rgba(245,158,11,0.14)', 'var(--ambar)')}
        {piezasFaltan > 0 && chip(`${fmtPiezas(piezasFaltan)} sin empacar`, 'rgba(245,158,11,0.14)', 'var(--ambar)')}
      </div>

      {faltan.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--ambar)', marginBottom: 8 }}>
          ⚠️ Falta empacar {faltan.length === 1 ? 'este producto' : `${faltan.length} productos`}. Empácalo antes de la entrega para no olvidarlo.
        </div>
      )}

      <div style={{ border: '1px solid var(--w08)', borderRadius: 12, overflow: 'hidden' }}>
        {filas.map((p, i) => {
          const falta = !empacado(p)
          return (
            <div key={p.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--w06)', background: falta ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
              <div style={{ width: 56, height: 56, flex: 'none', borderRadius: 10, background: 'var(--w05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w30)', fontSize: 22 }}>
                {p.imagen_url_firmada
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imagen_url_firmada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '📦'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{p.descripcion}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {p.apartado_fragil && chip('⚠️ Frágil', 'rgba(245,158,11,0.14)', 'var(--ambar)')}
                  {falta
                    ? chip('Falta empacar', 'rgba(245,158,11,0.14)', 'var(--ambar)')
                    : chip('Empacado', 'rgba(74,222,128,0.12)', 'var(--verde)')}
                </div>
              </div>
              <div style={{ flex: 'none', background: 'var(--w05)', color: 'var(--tinta)', fontSize: 14, fontWeight: 700, padding: '5px 11px', borderRadius: 10 }}>× {piezas(p)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
