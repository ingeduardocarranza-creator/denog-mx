'use client'
import { useEffect, useState } from 'react'

// Resumen del domicilio que se está agendando: distancia desde la tienda,
// envío ($50 hasta 5 km, $70 de ahí en adelante), cuánto queda por pagar de los
// productos y cuánto cobrar al entregar. Compartido por admin y POS.
// `entregas` son las entregas seleccionadas ({ entrega_id, total }) y
// `anticipos` los anticipos del cliente ({ entrega_id, monto }).
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const fila = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '5px 0' }

export default function ResumenDomicilio({ direccion, colonia, entregas, anticipos }) {
  const [res, setRes] = useState(null)   // { clave, datos }
  const clave = `${direccion || ''}|${colonia || ''}`
  const listo = (direccion || '').trim().length >= 4 && (colonia || '').trim().length >= 2

  useEffect(() => {
    if (!listo) return
    const t = setTimeout(async () => {
      try {
        const d = await fetch('/api/domicilios/distancia', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direccion, colonia }),
        }).then(r => r.json())
        setRes({ clave, datos: d })
      } catch {}
    }, 900)
    return () => clearTimeout(t)
  }, [clave, listo, direccion, colonia])

  const dist = listo && res?.clave === clave ? res.datos : null
  const ids = new Set((entregas || []).map(e => e.entrega_id))
  const subtotal = (entregas || []).reduce((s, e) => s + (e.total || 0), 0)
  const pagado = (anticipos || []).filter(a => ids.has(a.entrega_id)).reduce((s, a) => s + (a.monto || 0), 0)
  const porPagar = Math.max(0, subtotal - pagado)
  const envio = dist?.ok && dist.dentroCobertura ? dist.costoEnvio : null

  let textoDist = '—'
  if (listo && !dist) textoDist = 'calculando…'
  else if (dist && !dist.ok) textoDist = 'sin calcular'
  else if (dist?.ok) textoDist = `${dist.distanciaKm} km`

  return (
    <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Resumen</div>
      <div style={fila}><span style={{ color: 'var(--w50)' }}>Distancia desde la tienda</span><span style={{ color: 'var(--tinta)' }}>{textoDist}</span></div>
      <div style={fila}><span style={{ color: 'var(--w50)' }}>Envío</span><span style={{ color: 'var(--tinta)' }}>{envio != null ? fmt(envio) : '—'}</span></div>
      <div style={fila}><span style={{ color: 'var(--w50)' }}>Productos por pagar</span><span style={{ color: 'var(--tinta)' }}>{fmt(porPagar)}</span></div>
      <div style={{ ...fila, borderTop: '1px solid var(--w08)', marginTop: 4, paddingTop: 8, fontWeight: 700 }}>
        <span style={{ color: 'var(--tinta)' }}>Cobrar al entregar</span>
        <span style={{ color: 'var(--ambar)' }}>{envio != null ? fmt(porPagar + envio) : fmt(porPagar)}</span>
      </div>
      {dist?.ok && !dist.dentroCobertura && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--rojo-t)' }}>Queda fuera de la zona de cobertura (más de 15 km).</div>
      )}
      {envio == null && listo && dist?.ok === false && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ambar)' }}>No se pudo calcular el envío; se confirma al revisar el domicilio.</div>
      )}
    </div>
  )
}
