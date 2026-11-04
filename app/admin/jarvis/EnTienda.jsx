'use client'

import { useState, useEffect, useCallback } from 'react'
import FotoPedido from '../../components/FotoPedido'

// Pedidos "empacados" que el sistema cree en tienda: el colaborador confirma
// (con foto) y el admin avisa a los clientes con el estado de cuenta.

const NARANJA = '#ff9600'
const VERDE = '#58a700', AZUL = '#1cb0f6', GRIS = 'rgba(42,33,24,0.55)', ROJO = '#b91c1c'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (f) => {
  if (!f) return ''
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number)
  return `${d} ${MESES[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`
}
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLarga = (f) => {
  if (!f) return ''
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number)
  return `${d} de ${MESES_L[m - 1]} ${y}`
}
const dinero = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX')
const nom = (n) => String(n || '').split(' ').slice(0, 2).join(' ')

export async function subirFoto(file) {
  const res = await fetch('/api/catalogo/subir-imagen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: file.type, carpeta: 'confirmaciones' }),
  }).then(r => r.json())
  if (!res.ok) throw new Error(res.mensaje || 'No se pudo preparar la subida')
  const fd = new FormData()
  fd.append('', file, file.name)
  const sube = await fetch(res.signedUrl, { method: 'PUT', body: fd })
  if (!sube.ok) throw new Error('No se pudo subir la foto')
  return res.publicUrl
}

const OPCIONES = [
  { v: 'en_tienda', icono: '✅', t: 'Sigue en tienda', sub: 'Ahí está la bolsa', color: VERDE },
  { v: 'no_esta', icono: '❌', t: 'No está', sub: 'Ya se la llevaron', color: '#dc2626' },
]

// ── Colaborador: una tarjeta por cliente ─────────────────────────────────
export function PanelConfirmar({ seguim, tarjeta, alTerminar }) {
  const cliente = seguim?.clientes?.[0]
  const [dec, setDec] = useState({})
  const [foto, setFoto] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [ampliada, setAmpliada] = useState('')
  const [error, setError] = useState('')
  const clienteId = cliente?.cliente_id

  if (!cliente) return null
  const hayEnTienda = Object.values(dec).includes('en_tienda')
  const completo = cliente.entregas.every(e => dec[e.entrega_id]) && (!hayEnTienda || !!foto)

  const onFoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setSubiendo(true); setError('')
    try { setFoto(await subirFoto(f)) } catch (err) { setError(err.message) } finally { setSubiendo(false) }
  }
  const confirmar = async () => {
    setEnviando(true); setError('')
    try {
      const res = await fetch('/api/jarvis/seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: cliente.cliente_id, foto_url: hayEnTienda ? foto : null,
          decisiones: cliente.entregas.map(e => ({ entrega_id: e.entrega_id, resultado: dec[e.entrega_id] })),
        }),
      }).then(r => r.json())
      if (!res.ok) setError(res.mensaje || 'No se pudo guardar')
      else await alTerminar()
    } catch { setError('No se pudo guardar') } finally { setEnviando(false) }
  }

  return (
    <div style={{ ...tarjeta, marginBottom: 14 }}>
      <Ampliada url={ampliada} cerrar={() => setAmpliada('')} />
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>📦 CONFIRMA PEDIDOS EN TIENDA</div>
      <div style={{ fontSize: 13, fontWeight: 700, opacity: .7, margin: '4px 0 12px' }}>
        Faltan {seguim.total_esperando} {seguim.total_esperando === 1 ? 'cliente' : 'clientes'}. Ve a la tienda y revisa si su bolsa sigue ahí.
      </div>

      <div style={{ border: '2px solid rgba(42,33,24,0.10)', borderRadius: 16, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>🧑 {nom(cliente.nombre)}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: cliente.dias > 60 ? ROJO : '#b45309' }}>hace {cliente.dias} días</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          {cliente.entregas.map(e => {
            const sel = dec[e.entrega_id]
            return (
              <div key={e.entrega_id} style={{ border: '2px solid rgba(42,33,24,0.12)', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
                <div style={{ background: 'rgba(28,176,246,0.12)', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, opacity: .6 }}>ENTREGA DEL</div>
                    <div style={{ fontSize: 17, fontWeight: 900 }}>🗓️ {fechaLarga(e.fecha)}</div>
                  </div>
                  <div style={{ background: AZUL, color: '#fff', borderRadius: 12, padding: '6px 12px', fontWeight: 900, fontSize: 14, whiteSpace: 'nowrap' }}>
                    {e.piezas} {e.piezas === 1 ? 'pieza' : 'piezas'}
                  </div>
                </div>

                <div style={{ padding: '4px 12px' }}>
                  {e.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid rgba(42,33,24,0.08)' : 0 }}>
                      <FotoPedido url={it.imagen} descripcion={it.descripcion} tam={52} onAmpliar={it.imagen ? () => setAmpliada(it.imagen) : undefined} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{it.descripcion}</div>
                      <div style={{ flex: 'none', minWidth: 38, textAlign: 'center', background: it.cantidad > 1 ? NARANJA : 'rgba(42,33,24,0.08)', color: it.cantidad > 1 ? '#fff' : 'inherit', borderRadius: 10, padding: '5px 8px', fontWeight: 900, fontSize: 15 }}>
                        ×{it.cantidad}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, padding: 12, paddingTop: 6 }}>
                  {OPCIONES.map(o => {
                    const act = sel === o.v
                    return (
                      <button key={o.v} type="button" onClick={() => setDec(d => ({ ...d, [e.entrega_id]: o.v }))}
                        style={{ flex: 1, minWidth: 0, padding: '12px 6px', borderRadius: 14, cursor: 'pointer', fontWeight: 900, fontSize: 14,
                          border: `3px solid ${o.color}`, background: act ? o.color : '#fff', color: act ? '#fff' : o.color,
                          boxShadow: act ? 'none' : `0 3px 0 ${o.color}55` }}>
                        <div style={{ fontSize: 24 }}>{o.icono}</div>{o.t}
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: .85 }}>{o.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {hayEnTienda && (
          <div style={{ marginTop: 12, border: `2px dashed ${foto ? VERDE : AZUL}`, borderRadius: 14, padding: 12, textAlign: 'center' }}>
            {foto ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt="Foto de la bolsa" onClick={() => setAmpliada(foto)} style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10, cursor: 'zoom-in' }} />
                <div style={{ fontSize: 12, fontWeight: 800, color: VERDE, marginTop: 4 }}>✓ Foto lista</div>
              </>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800 }}>📸 Toma 1 foto de la bolsa de {cliente.nombre.split(' ')[0]}</div>
            )}
            <label style={{ display: 'inline-block', marginTop: 8, background: AZUL, color: '#fff', borderRadius: 10, padding: '9px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
              {subiendo ? 'Subiendo…' : foto ? 'Cambiar foto' : 'Abrir cámara'}
              <input type="file" accept="image/*" capture="environment" onChange={onFoto} disabled={subiendo} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {error && <div style={{ color: ROJO, fontWeight: 800, fontSize: 13, marginTop: 8 }}>{error}</div>}

        <button type="button" disabled={!completo || enviando} onClick={confirmar}
          style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 14, padding: 14, fontWeight: 900, fontSize: 15, color: '#fff',
            background: completo ? VERDE : 'rgba(42,33,24,0.25)', cursor: completo ? 'pointer' : 'not-allowed', boxShadow: completo ? '0 4px 0 #3f7a00' : 'none' }}>
          {enviando ? 'Guardando…' : 'Confirmar y seguir ➜'}
        </button>
      </div>
    </div>
  )
}

function Ampliada({ url, cerrar }) {
  if (!url) return null
  return (
    <div onClick={cerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto ampliada" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
      <div style={{ position: 'absolute', top: 14, right: 18, color: '#fff', fontSize: 28, fontWeight: 900 }}>✕</div>
    </div>
  )
}

function Titulo({ icono, t, n, sub }) {
  return (
    <div style={{ margin: '16px 0 8px' }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .6 }}>{icono} {t} · {n}</div>
      {sub && <div style={{ fontSize: 12, opacity: .6, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Admin: pestaña "En tienda" ───────────────────────────────────────────
export function VistaEnTienda({ tarjeta, alCambiar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [seguro, setSeguro] = useState('')
  const [foto, setFoto] = useState('')

  const cargar = useCallback(async () => {
    const res = await fetch('/api/jarvis/en-tienda').then(r => r.json()).catch(() => null)
    if (res?.ok) { setDatos(res); alCambiar?.(res.por_avisar.length) } else setError(res?.mensaje || 'No se pudo cargar')
  }, [alCambiar])
  useEffect(() => { cargar() }, [cargar])

  const accion = async (a, id) => {
    setOcupado(id + a); setError(''); setSeguro('')
    try {
      const res = await fetch('/api/jarvis/en-tienda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: a, id }) }).then(r => r.json())
      if (!res.ok) setError(res.mensaje || 'No se pudo')
      await cargar()
    } finally { setOcupado('') }
  }

  if (!datos) return <div style={{ ...tarjeta, textAlign: 'center' }}>{error || 'Cargando…'}</div>
  const btn = (color, lleno) => ({ flex: 1, minWidth: 110, borderRadius: 10, padding: '9px 8px', fontWeight: 900, fontSize: 12, cursor: 'pointer',
    border: lleno ? 0 : `2px solid ${color}`, background: lleno ? color : 'transparent', color: lleno ? '#fff' : color })
  return (
    <div>
      {error && <div style={{ color: ROJO, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <Ampliada url={foto} cerrar={() => setFoto('')} />

      <Titulo icono="📲" t="POR AVISAR" n={datos.por_avisar.length} sub="Su bolsa sigue en la tienda. Envíales su estado de cuenta." />
      {datos.por_avisar.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7, fontWeight: 700 }}>Nadie por avisar por ahora 🎉</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {datos.por_avisar.map(c => (
          <div key={c.cliente_id} style={tarjeta}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>🧑 {nom(c.nombre)}</div>
            {!c.tiene_telefono && <div style={{ fontSize: 12, color: ROJO, fontWeight: 800 }}>Sin teléfono guardado</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {c.entregas.map(e => (
                <div key={e.id} style={{ background: 'rgba(42,33,24,0.04)', borderRadius: 12, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {e.foto_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.foto_url} alt="Bolsa" onClick={() => setFoto(e.foto_url)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in' }} />
                    )}
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <div style={{ fontWeight: 900 }}>🗓️ Entrega del {fechaLarga(e.fecha_entrega)}</div>
                      <div style={{ opacity: .7, fontWeight: 700 }}>{e.piezas} {e.piezas === 1 ? 'pieza' : 'piezas'} · mercancía {dinero(e.monto)}{e.confirmo ? ` · confirmó ${e.confirmo}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {seguro === e.id ? (
                      <button disabled={!!ocupado} onClick={() => accion('avisar', e.id)} style={btn(VERDE, true)}>
                        {ocupado === e.id + 'avisar' ? 'Enviando…' : '¿Seguro? Enviar ahora'}
                      </button>
                    ) : (
                      <button disabled={!!ocupado || !c.tiene_telefono} onClick={() => setSeguro(e.id)} style={{ ...btn(VERDE, true), opacity: c.tiene_telefono ? 1 : .4 }}>📲 Enviar estado de cuenta</button>
                    )}
                    <button disabled={!!ocupado} onClick={() => accion('ya_avise', e.id)} style={btn(AZUL, false)}>Ya le avisé yo</button>
                    <button disabled={!!ocupado} onClick={() => accion('reabrir', e.id)} style={btn('#6b7280', false)}>Volver a revisar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Titulo icono="✔️" t="CERRADOS: NO ESTABAN EN TIENDA" n={datos.cerrados.length}
        sub="El colaborador dijo que ya no estaban; se cerraron como Entregado, sin cobro ni aviso. Si alguno no es correcto, ábrelo de nuevo." />
      {datos.cerrados.length === 0 && <div style={{ ...tarjeta, textAlign: 'center', opacity: .7, fontWeight: 700 }}>Todavía no hay</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {datos.cerrados.map(c => (
          <div key={c.cliente_id} style={tarjeta}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>🧑 {nom(c.nombre)}</div>
            {c.entregas.map(e => (
              <div key={e.id} style={{ background: 'rgba(42,33,24,0.04)', borderRadius: 12, padding: 10, marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 800 }}>
                  🗓️ Entrega del {fechaLarga(e.fecha_entrega)} · {e.piezas} {e.piezas === 1 ? 'pieza' : 'piezas'}{e.confirmo ? ` · lo marcó ${e.confirmo}` : ''}
                </div>
                <button disabled={!!ocupado} onClick={() => accion('reabrir', e.id)} style={btn('#6b7280', false)}>↩️ Abrir de nuevo</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ ...tarjeta, marginTop: 16, fontWeight: 800, fontSize: 13 }}>📊 En total, {datos.regularizados} pedidos se han cerrado así por falta de marcarlos como entregados.</div>
      {datos.avisados.length > 0 && (
        <>
          <Titulo icono="📨" t="YA AVISADOS" n={datos.avisados.length} />
          <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
            {datos.avisados.map(e => <div key={e.id}>✓ {nom(e.nombre)} · entrega {fechaCorta(e.fecha_entrega)} · {e.piezas} pzas</div>)}
          </div>
        </>
      )}
    </div>
  )
}
