'use client'
import { useState, useEffect } from 'react'
import { minutosATexto } from '../../../../lib/domicilios/horarios'
import ListaCarga from '../../../components/domicilios/ListaCarga'

const hoyHermosillo = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Hermosillo' }).format(new Date())
const fmt = (n) => `$${(Number(n) || 0).toLocaleString('es-MX')}`

export default function RutaDelDia() {
  const [fecha, setFecha] = useState(hoyHermosillo())
  const [domicilios, setDomicilios] = useState([])
  const [ruta, setRuta] = useState({ paradas: [], sin_ubicar: [], enlaces: [] })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [enlacePin, setEnlacePin] = useState({})   // { [id]: texto }
  const [msg, setMsg] = useState('')
  const [carga, setCarga] = useState({})   // { [domicilio_id]: { items, marcadas } }

  const [recarga, setRecarga] = useState(0)
  const cargar = () => setRecarga((n) => n + 1)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [lista, r, c] = await Promise.all([
        fetch(`/api/domicilios/listar?fecha=${fecha}`).then((x) => x.json()),
        fetch(`/api/domicilios/ruta?fecha=${fecha}`).then((x) => x.json()),
        fetch(`/api/domicilios/carga?fecha=${fecha}`).then((x) => x.json()).catch(() => ({ ok: false })),
      ])
      if (!vivo) return
      if (lista.ok) setDomicilios(lista.domicilios)
      if (r.ok) setRuta(r)
      if (c.ok) setCarga(Object.fromEntries(c.domicilios.map((x) => [x.id, { items: x.items, marcadas: x.marcadas }])))
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [fecha, recarga])

  const porId = Object.fromEntries(domicilios.map((d) => [d.id, d]))
  const nombre = (d) => (d.es_externo ? d.nombre_externo : d.clientes?.nombre) || 'Cliente'
  const cobrar = (d) => {
    if (d.es_externo) return Math.max(0, (d.total || 0) - (d.pago_anticipado_ext || 0))
    const ant = (d.anticipos_detalle || []).reduce((s, a) => s + (a.monto || 0), 0)
    return Math.max(0, (d.total || 0) - ant)
  }

  const guardarOrden = async (ids, auto = false) => {
    setGuardando(true)
    await fetch('/api/domicilios/orden', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, auto }),
    })
    cargar()
    setGuardando(false)
  }

  const mover = (i, delta) => {
    const ids = ruta.paradas.map((p) => p.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    guardarOrden(ids)
  }

  const ubicar = async (id, enlace) => {
    setMsg('')
    const res = await fetch('/api/domicilios/ubicar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enlace: enlace || undefined }),
    }).then((r) => r.json())
    if (!res.ok) setMsg(res.mensaje || 'No se pudo ubicar')
    cargar()
  }

  // Marca o desmarca un producto como cargado: se ve al instante y se guarda en segundo plano.
  const marcarCarga = (id, clave, marcado) => {
    setCarga((prev) => {
      const c = prev[id]
      if (!c) return prev
      const set = new Set(c.marcadas)
      if (marcado) set.add(clave); else set.delete(clave)
      return { ...prev, [id]: { ...c, marcadas: [...set] } }
    })
    fetch('/api/domicilios/carga', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domicilio_id: id, clave, marcado }),
    }).then((r) => r.json()).then((r) => { if (!r.ok) { setMsg(r.mensaje || 'No se pudo guardar la palomita'); cargar() } }).catch(() => { setMsg('No se pudo guardar la palomita'); cargar() })
  }

  const hayManual = ruta.paradas.some((p) => p.manual)
  const inp = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '8px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }
  const btn = { background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '6px 10px', color: 'var(--tinta)', fontSize: 12, cursor: 'pointer' }

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <a href="/admin/domicilios" style={{ color: 'var(--w40)', fontSize: 12, textDecoration: 'none' }}>← Domicilios</a>
        <h1 style={{ margin: 0, fontSize: 20, color: 'var(--tinta)' }}>Ruta del día</h1>
        <input type="date" value={fecha} onChange={(e) => { setCargando(true); setFecha(e.target.value) }} style={{ ...inp, marginLeft: 'auto' }} />
      </div>

      {msg && <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--tinta)', marginBottom: 12 }}>{msg}</div>}

      {cargando ? (
        <div style={{ textAlign: 'center', color: 'var(--w30)', padding: 40 }}>Cargando...</div>
      ) : ruta.paradas.length + ruta.sin_ubicar.length === 0 ? (
        <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>No hay domicilios activos para este día</div>
      ) : (
        <>
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 16, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--tinta)', fontSize: 13 }}>
                Sales de la tienda · {ruta.paradas.length} parada{ruta.paradas.length === 1 ? '' : 's'}
                {ruta.sin_ubicar.length > 0 && <span style={{ color: 'var(--rojo-t)' }}> · {ruta.sin_ubicar.length} sin ubicar</span>}
              </div>
              {hayManual && (
                <button style={btn} disabled={guardando} onClick={() => guardarOrden(ruta.paradas.map((p) => p.id), true)}>Volver al orden automático</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {ruta.enlaces.map((e) => (
                <a key={e.numero} href={e.url} target="_blank" rel="noreferrer"
                  style={{ background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', borderRadius: 10, padding: '9px 14px', color: 'var(--marca)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  Abrir en Google Maps{ruta.enlaces.length > 1 ? ` · tramo ${e.numero} (${e.paradas} paradas)` : ''}
                </a>
              ))}
            </div>
            {ruta.enlaces.length > 1 && <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 8 }}>Google Maps acepta hasta 10 paradas por enlace; abre los tramos en orden.</div>}
          </div>

          <ListaCarga
            paradas={[...ruta.paradas, ...ruta.sin_ubicar.map((id) => ({ id }))]}
            porId={porId} carga={carga} nombre={nombre} onToggle={marcarCarga} />

          {ruta.paradas.map((p, i) => {
            const d = porId[p.id]
            if (!d) return null
            const deber = cobrar(d)
            return (
              <div key={p.id} style={{ display: 'flex', gap: 10, background: 'var(--w03)', border: `1px solid ${p.tarde ? 'rgba(248,113,113,0.35)' : 'var(--w08)'}`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
                <div style={{ flex: 'none', width: 28, height: 28, borderRadius: 14, background: 'rgba(193,85,58,0.18)', color: 'var(--marca)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.orden}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>{nombre(d)} · {d.colonia}</div>
                  <div style={{ color: 'var(--w60)', fontSize: 12, marginTop: 2 }}>
                    {d.direccion}{d.entre_calles ? ` (entre ${d.entre_calles})` : ''}
                  </div>
                  <div style={{ color: p.tarde ? 'var(--rojo-t)' : 'var(--w40)', fontSize: 12, marginTop: 4 }}>
                    {d.hora_exacta ? `Hora exacta ${minutosATexto(parseInt(d.hora_exacta.slice(0, 2), 10) * 60 + parseInt(d.hora_exacta.slice(3, 5), 10))}` : d.horario}
                    {' · '}llegada estimada {minutosATexto(p.llegadaMin)}{p.tarde ? ' · llegarías tarde' : ''}
                  </div>
                  {(d.recibe_nombre || d.instrucciones_acceso) && (
                    <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 3 }}>
                      {d.recibe_nombre ? `Recibe: ${d.recibe_nombre}` : ''}{d.recibe_nombre && d.instrucciones_acceso ? ' · ' : ''}{d.instrucciones_acceso || ''}
                    </div>
                  )}
                  {d.referencias && <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 2 }}>{d.referencias}</div>}
                </div>
                <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, background: deber > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.15)', color: 'var(--tinta)', fontWeight: 600 }}>
                    {d.total == null ? 'Costo sin confirmar' : deber > 0 ? `Cobrar ${fmt(deber)}` : 'Ya pagado'}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={btn} disabled={guardando || i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                    <button style={btn} disabled={guardando || i === ruta.paradas.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar">↓</button>
                  </div>
                </div>
              </div>
            )
          })}

          {ruta.sin_ubicar.map((id) => {
            const d = porId[id]
            if (!d) return null
            return (
              <div key={id} style={{ background: 'var(--w03)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: 14, padding: 12, marginBottom: 8 }}>
                <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>{nombre(d)} · sin ubicar</div>
                <div style={{ color: 'var(--w60)', fontSize: 12, marginTop: 2 }}>{d.direccion}, {d.colonia}</div>
                <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 4 }}>Google no encontró la dirección, así que no entra en la ruta. Reintenta o pega el pin del cliente (enlace de Google Maps).</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button style={btn} onClick={() => ubicar(id)}>Reintentar ubicación</button>
                  <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="Pegar enlace de Google Maps" value={enlacePin[id] || ''} onChange={(e) => setEnlacePin({ ...enlacePin, [id]: e.target.value })} />
                  <button style={btn} onClick={() => ubicar(id, enlacePin[id])}>Usar enlace</button>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
