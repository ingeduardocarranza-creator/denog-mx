'use client'
import { useState, useEffect, useCallback } from 'react'

// Paquetes que la bodega de Nogales registró. Los que llegaron dañados
// traen de 1 a 3 fotos de evidencia y una nota opcional.
// Solo consulta: no se ligan a pedidos. El admin puede borrar un registro
// equivocado (se borran también sus fotos).

const fechaLocal = (dias = 0) => {
  const d = new Date(Date.now() - 7 * 3600 * 1000 - dias * 86400000)
  return d.toISOString().slice(0, 10)
}
const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })

const inputEstilo = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }
const chip = (activo) => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${activo ? '#466D9B' : 'var(--w10)'}`,
  background: activo ? 'rgba(70,109,155,0.12)' : 'var(--w04)',
  color: activo ? '#466D9B' : 'var(--w50)',
})

export default function PaquetesNogales() {
  const [desde, setDesde] = useState(fechaLocal())
  const [hasta, setHasta] = useState(fechaLocal())
  const [guia, setGuia] = useState('')
  const [paquetes, setPaquetes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [fotoGrande, setFotoGrande] = useState(null)
  const [soloDanados, setSoloDanados] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const qs = guia.trim() ? `guia=${encodeURIComponent(guia.trim())}` : `desde=${desde}&hasta=${hasta}`
    try {
      const r = await fetch(`/api/bodega/paquetes?${qs}`)
      const d = await r.json()
      if (d.ok) setPaquetes(d.paquetes)
      else setError(d.mensaje || 'No se pudo cargar.')
    } catch {
      setError('Sin conexión.')
    }
    setCargando(false)
  }, [desde, hasta, guia])

  useEffect(() => { cargar() }, [desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const rango = (dias) => { setGuia(''); setDesde(fechaLocal(dias)); setHasta(dias === 1 ? fechaLocal(1) : fechaLocal()) }
  const rangoActivo = (dias) => !guia && hasta === (dias === 1 ? fechaLocal(1) : fechaLocal()) && desde === fechaLocal(dias)

  const borrar = async (p) => {
    const nombre = p.numero_guia ? `de la guía ${p.numero_guia}` : `sin guía (${p.tienda || ''})`
    if (!confirm(`¿Borrar el registro ${nombre}? También se borran sus fotos.`)) return
    const r = await fetch(`/api/bodega/paquetes?id=${p.id}`, { method: 'DELETE' })
    const d = await r.json()
    if (d.ok) setPaquetes(ps => ps.filter(x => x.id !== p.id))
    else alert(d.mensaje || 'No se pudo borrar.')
  }

  const danados = paquetes.filter(p => p.danado).length
  const visibles = soloDanados ? paquetes.filter(p => p.danado) : paquetes
  // Sin guía (delivery en bolsa / pickup) se agrupan como "Sin guía".
  const grupo = (p) => p.numero_guia ? (p.paqueteria || 'Otra') : 'Sin guía'
  const porPaqueteria = paquetes.reduce((acc, p) => { acc[grupo(p)] = (acc[grupo(p)] || 0) + 1; return acc }, {})

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Paquetes Nogales</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4 }}>Lo que la bodega escaneó al recibir; los dañados traen foto de evidencia</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <button style={chip(rangoActivo(0))} onClick={() => rango(0)}>Hoy</button>
          <button style={chip(rangoActivo(1))} onClick={() => rango(1)}>Ayer</button>
          <button style={chip(rangoActivo(6))} onClick={() => rango(6)}>7 días</button>
          <button style={chip(rangoActivo(29))} onClick={() => rango(29)}>30 días</button>
          <input type="date" style={inputEstilo} value={desde} onChange={e => { setGuia(''); setDesde(e.target.value) }} />
          <span style={{ color: 'var(--w40)', fontSize: 12 }}>a</span>
          <input type="date" style={inputEstilo} value={hasta} onChange={e => { setGuia(''); setHasta(e.target.value) }} />
          <input
            style={{ ...inputEstilo, flex: 1, minWidth: 180 }} placeholder="Buscar guía (todas las fechas)"
            value={guia} onChange={e => setGuia(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()}
          />
          <button style={chip(false)} onClick={cargar}>Buscar</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: '10px 16px' }}>
            <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 700 }}>TOTAL</div>
            <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{paquetes.length}</div>
          </div>
          <button onClick={() => setSoloDanados(v => !v)} title="Mostrar solo los dañados"
            style={{ background: soloDanados ? 'rgba(185,28,28,0.08)' : 'var(--sup)', border: `1px solid ${soloDanados ? 'rgba(185,28,28,0.4)' : 'var(--w08)'}`, borderRadius: 12, padding: '10px 16px', textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ color: 'var(--rojo)', fontSize: 11, fontWeight: 700 }}>DAÑADOS{soloDanados ? ' · FILTRANDO' : ''}</div>
            <div style={{ color: danados ? 'var(--rojo)' : 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{danados}</div>
          </button>
          {Object.entries(porPaqueteria).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: '10px 16px' }}>
              <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 700 }}>{k.toUpperCase()}</div>
              <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>

        {error && <div style={{ color: 'var(--rojo)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        {cargando ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <div style={{ color: 'var(--w40)', fontSize: 13 }}>{soloDanados ? 'No hay paquetes dañados en este rango.' : 'No hay paquetes registrados en este rango.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibles.map(p => (
              <div key={p.id} style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 12, padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(p.fotos_url || []).map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt="Evidencia" onClick={() => setFotoGrande(u)}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', background: 'var(--w06)' }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {p.numero_guia ? (
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, color: 'var(--tinta)', wordBreak: 'break-all' }}>{p.numero_guia}</div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tinta)' }}>
                      {p.tienda} · {p.tipo === 'pickup' ? 'Pickup en tienda' : 'Delivery (sin guía)'}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--w50)', marginTop: 2 }}>
                    {p.danado && <span style={{ background: 'rgba(185,28,28,0.10)', color: 'var(--rojo)', fontWeight: 800, fontSize: 10.5, borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>DAÑADO</span>}
                    {p.numero_guia
                      ? <span style={{ color: '#466D9B', fontWeight: 700 }}>{p.paqueteria}</span>
                      : <span style={{ background: 'rgba(161,98,7,0.12)', color: 'var(--ambar)', fontWeight: 800, fontSize: 10.5, borderRadius: 5, padding: '1px 6px' }}>SIN GUÍA</span>}
                    {' · '}{fechaHora(p.recibido_en)}{p.recibido_por_nombre ? ` · ${p.recibido_por_nombre}` : ''}
                  </div>
                  {p.notas && <div style={{ fontSize: 12, color: 'var(--ambar)', marginTop: 4 }}>Nota: {p.notas}</div>}
                </div>
                <button onClick={() => borrar(p)} style={{ background: 'none', border: '1px solid var(--w10)', color: 'var(--w45)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {fotoGrande && (
        <div onClick={() => setFotoGrande(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="Evidencia" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>
      )}
    </div>
  )
}
