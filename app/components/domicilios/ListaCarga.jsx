'use client'

// Lista de carga del día (pantalla Ruta del día): por cada parada, los productos
// que hay que subir al carro, con casillas para ir palomeando. Arriba, un
// recordatorio de lo que todavía falta cargar antes de salir a ruta.
//   paradas: [{ id, orden }]   en el orden de la ruta
//   porId:   { [id]: domicilio }
//   carga:   { [id]: { items: [{clave,nombre,cantidad,fragil,empacado,foto}], marcadas: [clave] } }
//   onToggle(domicilioId, clave, marcado)
const pzs = (n) => `${n} pieza${n === 1 ? '' : 's'}`
const chip = (texto, fondo, color) => (
  <span style={{ background: fondo, color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 7 }}>{texto}</span>
)

export default function ListaCarga({ paradas, porId, carga, nombre, onToggle }) {
  const bloques = (paradas || [])
    .map((p, i) => {
      const c = carga?.[p.id]
      if (!c || c.items.length === 0) return null
      const marcadas = new Set(c.marcadas || [])
      const total = c.items.reduce((s, it) => s + it.cantidad, 0)
      const listas = c.items.filter(it => marcadas.has(it.clave)).reduce((s, it) => s + it.cantidad, 0)
      const faltan = c.items.filter(it => !marcadas.has(it.clave))
      return { id: p.id, numero: i + 1, d: porId[p.id], items: c.items, marcadas, total, listas, faltan }
    })
    .filter(Boolean)

  if (bloques.length === 0) return null

  const total = bloques.reduce((s, b) => s + b.total, 0)
  const listas = bloques.reduce((s, b) => s + b.listas, 0)
  const faltanPzs = total - listas
  const faltanFragiles = bloques.reduce((s, b) => s + b.faltan.filter(it => it.fragil).reduce((x, it) => x + it.cantidad, 0), 0)
  const sinEmpacar = bloques.reduce((s, b) => s + b.faltan.filter(it => !it.empacado).reduce((x, it) => x + it.cantidad, 0), 0)
  const pct = total ? Math.round((listas / total) * 100) : 0

  return (
    <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 16, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>Lista de carga</div>
        <div style={{ color: 'var(--w50)', fontSize: 12 }}>{listas} de {total} piezas cargadas</div>
      </div>
      <div style={{ height: 6, background: 'var(--w08)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: faltanPzs === 0 ? 'var(--verde)' : 'var(--ambar)' }} />
      </div>

      {faltanPzs > 0 ? (
        <div style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--ambar)', marginBottom: 10, lineHeight: 1.5 }}>
          ⚠️ Antes de salir: faltan por cargar {pzs(faltanPzs)}
          {faltanFragiles > 0 ? ` (${pzs(faltanFragiles)} frágil${faltanFragiles === 1 ? '' : 'es'}, llévalas aparte)` : ''}.
          {sinEmpacar > 0 ? ` Además ${pzs(sinEmpacar)} todavía sin empacar.` : ''}
          <div style={{ marginTop: 4, color: 'var(--w60)' }}>
            Pendientes: {bloques.filter(b => b.faltan.length > 0).map(b => `${nombre(b.d)} (${pzs(b.total - b.listas)})`).join(', ')}
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--verde)', marginBottom: 10 }}>
          ✓ Todo cargado. Listo para salir a ruta.
        </div>
      )}

      {bloques.map((b) => (
        <details key={b.id} open={b.faltan.length > 0} style={{ border: '1px solid var(--w08)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: '9px 12px', fontSize: 13, color: 'var(--tinta)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{b.numero} · {nombre(b.d)}{b.d?.colonia ? ` · ${b.d.colonia}` : ''}</span>
            <span style={{ color: b.faltan.length === 0 ? 'var(--verde)' : 'var(--w50)' }}>{b.faltan.length === 0 ? '✓ ' : ''}{b.listas}/{b.total}</span>
          </summary>
          {b.items.map((it) => {
            const marcada = b.marcadas.has(it.clave)
            return (
              <label key={it.clave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--w06)', cursor: 'pointer', background: marcada ? 'rgba(74,222,128,0.05)' : 'transparent' }}>
                <input type="checkbox" checked={marcada} onChange={(e) => onToggle(b.id, it.clave, e.target.checked)} style={{ width: 20, height: 20, flex: 'none' }} />
                <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 8, background: 'var(--w05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {it.foto
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : '📦'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 12, fontWeight: 600, textDecoration: marcada ? 'line-through' : 'none', opacity: marcada ? 0.6 : 1 }}>{it.nombre}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {it.fragil && chip('⚠️ Frágil', 'rgba(245,158,11,0.14)', 'var(--ambar)')}
                    {!it.empacado && chip('Sin empacar', 'rgba(245,158,11,0.14)', 'var(--ambar)')}
                  </div>
                </div>
                <div style={{ flex: 'none', background: 'var(--w05)', color: 'var(--tinta)', fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 9 }}>× {it.cantidad}</div>
              </label>
            )
          })}
        </details>
      ))}
    </div>
  )
}
