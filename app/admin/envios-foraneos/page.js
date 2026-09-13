'use client'
import { useState, useEffect, useRef } from 'react'

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
// "21 sept 2026" -- como lo pidió Lalo, en vez de la fecha ISO cruda.
const fechaCorta = (f) => {
  if (!f) return ''
  const d = new Date(String(f).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return f
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}

const ESTADO_LABEL = {
  borrador: { texto: 'Borrador', color: 'var(--w45)' },
  aprobado: { texto: 'Aprobado', color: '#0ea5e9' },
  notificado: { texto: 'Notificado', color: '#10b981' },
  cancelado: { texto: 'Cancelado', color: 'var(--rojo-t)' },
}

const card = { background: 'var(--fondo-card)', border: '1px solid var(--w06)', borderRadius: 14, padding: 16 }
const input = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--w10)', background: 'var(--fondo)', color: 'var(--tinta)', fontSize: 13.5 }
const boton = (bg, color = '#fff') => ({ padding: '9px 14px', borderRadius: 9, border: 'none', background: bg, color, fontSize: 13, fontWeight: 700, cursor: 'pointer' })

export default function EnviosForaneos() {
  const [envios, setEnvios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])

  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [formNuevo, setFormNuevo] = useState({
    cliente_id: '', entrega_ids: [], paqueteria: '', numero_guia: '',
    costo_envio: '', skydropx_shipment_id: '', notas: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null) // { tipo: 'ok'|'error', texto }

  const [editandoId, setEditandoId] = useState(null)
  const [formEdit, setFormEdit] = useState(null)
  const [aprobandoId, setAprobandoId] = useState(null)
  const [reenviandoId, setReenviandoId] = useState(null)

  // Escaneo con cámara del número de guía (código de barras o QR de la
  // etiqueta). La pistola lectora USB del mostrador NO necesita nada de esto
  // -- ya escribe directo en el campo enfocado, como ya se confirmó y se usa
  // en Encargos (ver claude/codigo-recoleccion-qr.md). Este botón es para
  // cuando se captura desde un celular/tablet con cámara.
  // Detección perezosa: en el primer render del servidor no hay `window`,
  // así que arranca en false ahí y se corrige solo en el navegador -- evita
  // el parpadeo de un botón que aparece y desaparece.
  const [soportaCamara, setSoportaCamara] = useState(() =>
    typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia
  )
  const [escaneando, setEscaneando] = useState(null) // null | 'nuevo' | 'edit'
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const detenerEscaneo = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setEscaneando(null)
  }

  const iniciarEscaneo = async (destino) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setEscaneando(destino)
      // El <video> se monta junto con el modal -- se espera un tick a que
      // exista antes de conectarle el stream.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      }, 0)

      const detector = new window.BarcodeDetector({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code'],
      })

      const paso = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codigos = await detector.detect(videoRef.current)
          if (codigos.length > 0) {
            const valor = codigos[0].rawValue
            if (destino === 'nuevo') setFormNuevo(f => ({ ...f, numero_guia: valor }))
            else setFormEdit(f => ({ ...f, numero_guia: valor }))
            detenerEscaneo()
            return
          }
        } catch {
          // Un frame fallido no es motivo para tirar el escaneo completo.
        }
        if (streamRef.current) requestAnimationFrame(paso)
      }
      requestAnimationFrame(paso)
    } catch (err) {
      avisar('error', 'No se pudo abrir la cámara: ' + (err?.message || 'permiso denegado.'))
      detenerEscaneo()
    }
  }

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  useEffect(() => {
    cargar()
    fetch('/api/clientes/listar').then(r => r.json()).then(d => {
      if (d.ok) setClientes(d.clientes.filter(c => c.rol !== 'admin'))
    })
    fetch('/api/entregas').then(r => r.json()).then(d => {
      if (d.ok) setEntregas([...(d.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || '')))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado])

  async function cargar() {
    setCargando(true)
    const qs = filtroEstado ? `?estado=${filtroEstado}` : ''
    const res = await fetch(`/api/envios-foraneos${qs}`)
    const data = await res.json()
    if (data.ok) setEnvios(data.envios)
    setCargando(false)
  }

  const avisar = (tipo, texto) => {
    setAviso({ tipo, texto })
    setTimeout(() => setAviso(null), 6000)
  }

  const crear = async () => {
    if (!formNuevo.cliente_id) return avisar('error', 'Elige un cliente.')
    if (!formNuevo.costo_envio || Number(formNuevo.costo_envio) <= 0) return avisar('error', 'Captura el costo del envío.')
    setGuardando(true)
    const res = await fetch('/api/envios-foraneos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formNuevo),
    })
    const data = await res.json()
    setGuardando(false)
    if (!data.ok) return avisar('error', data.mensaje || 'No se pudo crear.')
    avisar('ok', 'Envío foráneo guardado como borrador.')
    setMostrarNuevo(false)
    setFormNuevo({ cliente_id: '', entrega_ids: [], paqueteria: '', numero_guia: '', costo_envio: '', skydropx_shipment_id: '', notas: '' })
    cargar()
  }

  const iniciarEdicion = (e) => {
    setEditandoId(e.id)
    setFormEdit({
      entrega_ids: e.entrega_ids || [],
      paqueteria: e.paqueteria || '',
      numero_guia: e.numero_guia || '',
      costo_envio: e.costo_envio || '',
      skydropx_shipment_id: e.skydropx_shipment_id || '',
      notas: e.notas || '',
    })
  }

  const guardarEdicion = async (id) => {
    setGuardando(true)
    const res = await fetch(`/api/envios-foraneos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formEdit),
    })
    const data = await res.json()
    setGuardando(false)
    if (!data.ok) return avisar('error', data.mensaje || 'No se pudo guardar.')
    avisar('ok', 'Cambios guardados.')
    setEditandoId(null)
    cargar()
  }

  const cancelarBorrador = async (id) => {
    if (!confirm('¿Cancelar este envío foráneo? Sigue en borrador, no tiene dinero atribuido todavía.')) return
    const res = await fetch(`/api/envios-foraneos/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!data.ok) return avisar('error', data.mensaje || 'No se pudo cancelar.')
    cargar()
  }

  const aprobar = async (e) => {
    if (!e.paqueteria || !e.numero_guia) return avisar('error', 'Falta paquetería o número de guía.')
    if (!confirm(`¿Confirmas el envío de ${e.clientes?.nombre || 'este cliente'} por ${fmt(e.costo_envio)} con ${e.paqueteria}, guía ${e.numero_guia}? Se sumará a su cuenta y se le avisará por WhatsApp.`)) return
    setAprobandoId(e.id)
    const res = await fetch('/api/envios-foraneos/aprobar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id }),
    })
    const data = await res.json()
    setAprobandoId(null)
    if (!data.ok) return avisar('error', data.mensaje || 'No se pudo aprobar.')
    const partes = [`Cubierto con anticipo: ${fmt(data.cubierto)}.`]
    if (data.pendiente > 0) partes.push(`Todavía debe ${fmt(data.pendiente)} de este envío.`)
    partes.push(data.aviso?.ok ? `Aviso enviado (${data.aviso.via}).` : `El aviso de WhatsApp no salió: ${data.aviso?.mensaje || 'error desconocido'}.`)
    avisar(data.aviso?.ok ? 'ok' : 'error', partes.join(' '))
    cargar()
  }

  const reenviarAviso = async (id) => {
    setReenviandoId(id)
    const res = await fetch('/api/envios-foraneos/notificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    setReenviandoId(null)
    avisar(data.ok ? 'ok' : 'error', data.ok ? `Aviso reenviado (${data.via}).` : (data.mensaje || 'No se pudo reenviar.'))
    cargar()
  }

  const toggleEntregaNuevo = (id) => {
    setFormNuevo(f => ({
      ...f,
      entrega_ids: f.entrega_ids.includes(id) ? f.entrega_ids.filter(x => x !== id) : [...f.entrega_ids, id],
    }))
  }
  const toggleEntregaEdit = (id) => {
    setFormEdit(f => ({
      ...f,
      entrega_ids: f.entrega_ids.includes(id) ? f.entrega_ids.filter(x => x !== id) : [...f.entrega_ids, id],
    }))
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--tinta)', margin: 0 }}>📦 Envíos foráneos</h1>
        <button style={boton('var(--marca)')} onClick={() => setMostrarNuevo(v => !v)}>
          {mostrarNuevo ? 'Cancelar' : '+ Nuevo envío'}
        </button>
      </div>

      {aviso && (
        <div style={{ ...card, borderColor: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.3)' : 'rgba(16,185,129,0.3)', background: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.08)' : 'rgba(16,185,129,0.08)', padding: '11px 15px', color: aviso.tipo === 'error' ? 'var(--rojo-t)' : '#10b981', fontSize: 13, marginBottom: 14 }}>
          {aviso.texto}
        </div>
      )}

      {mostrarNuevo && (
        <div style={{ ...card, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>Cliente</label>
            <select style={input} value={formNuevo.cliente_id} onChange={e => setFormNuevo(f => ({ ...f, cliente_id: e.target.value }))}>
              <option value="">Selecciona un cliente...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>
              Entregas que cubre este envío (opcional, puede ser más de una)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto', border: '1px solid var(--w06)', borderRadius: 9, padding: 8 }}>
              {entregas.map(en => (
                <label key={en.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px', borderRadius: 7, background: formNuevo.entrega_ids.includes(en.id) ? 'var(--marca)' : 'var(--w03)', color: formNuevo.entrega_ids.includes(en.id) ? '#fff' : 'var(--tinta)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formNuevo.entrega_ids.includes(en.id)} onChange={() => toggleEntregaNuevo(en.id)} style={{ margin: 0 }} />
                  {fechaCorta(en.fecha_entrega)}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>Costo de envío (MXN)</label>
              <input style={input} type="number" step="0.01" value={formNuevo.costo_envio} onChange={e => setFormNuevo(f => ({ ...f, costo_envio: e.target.value }))} placeholder="0.00" />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>Paquetería</label>
              <input style={input} value={formNuevo.paqueteria} onChange={e => setFormNuevo(f => ({ ...f, paqueteria: e.target.value }))} placeholder="Estafeta, DHL, FedEx..." />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>Número de guía</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* La pistola lectora USB escribe aquí directo con solo tener
                    el foco -- por eso el autoFocus, sin necesitar el botón. */}
                <input style={input} autoFocus value={formNuevo.numero_guia} onChange={e => setFormNuevo(f => ({ ...f, numero_guia: e.target.value }))} />
                {soportaCamara && (
                  <button type="button" style={{ ...boton('var(--w10)', 'var(--tinta)'), padding: '9px 11px' }} onClick={() => iniciarEscaneo('nuevo')} title="Escanear con la cámara">📷</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>
              ID de envío en Skydropx (opcional, para más adelante autollenar guía/paquetería)
            </label>
            <input style={input} value={formNuevo.skydropx_shipment_id} onChange={e => setFormNuevo(f => ({ ...f, skydropx_shipment_id: e.target.value }))} />
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--w45)', display: 'block', marginBottom: 4 }}>Notas (opcional)</label>
            <input style={input} value={formNuevo.notas} onChange={e => setFormNuevo(f => ({ ...f, notas: e.target.value }))} />
          </div>

          <button style={boton('var(--marca)')} disabled={guardando} onClick={crear}>
            {guardando ? 'Guardando...' : 'Guardar borrador'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', 'borrador', 'aprobado', 'notificado', 'cancelado'].map(v => (
          <button key={v || 'todos'} onClick={() => setFiltroEstado(v)}
            style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid var(--w10)', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filtroEstado === v ? 'var(--marca)' : 'var(--fondo-card)', color: filtroEstado === v ? '#fff' : 'var(--tinta)' }}>
            {v ? ESTADO_LABEL[v].texto : 'Todos'}
          </button>
        ))}
      </div>

      {cargando ? (
        <p style={{ color: 'var(--w45)' }}>Cargando...</p>
      ) : envios.length === 0 ? (
        <p style={{ color: 'var(--w45)' }}>No hay envíos foráneos con este filtro.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {envios.map(e => (
            <div key={e.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--tinta)' }}>{e.clientes?.nombre || 'Sin nombre'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--w45)' }}>{new Date(e.creado_en).toLocaleDateString('es-MX')}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_LABEL[e.estado]?.color, background: 'var(--w03)', padding: '4px 10px', borderRadius: 20 }}>
                  {ESTADO_LABEL[e.estado]?.texto || e.estado}
                </span>
              </div>

              {editandoId === e.id ? (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {entregas.map(en => (
                      <label key={en.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 8px', borderRadius: 7, background: formEdit.entrega_ids.includes(en.id) ? 'var(--marca)' : 'var(--w03)', color: formEdit.entrega_ids.includes(en.id) ? '#fff' : 'var(--tinta)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={formEdit.entrega_ids.includes(en.id)} onChange={() => toggleEntregaEdit(en.id)} style={{ margin: 0 }} />
                        {fechaCorta(en.fecha_entrega)}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input style={{ ...input, flex: '1 1 140px' }} type="number" step="0.01" value={formEdit.costo_envio} onChange={ev => setFormEdit(f => ({ ...f, costo_envio: ev.target.value }))} placeholder="Costo de envío" />
                    <input style={{ ...input, flex: '1 1 140px' }} value={formEdit.paqueteria} onChange={ev => setFormEdit(f => ({ ...f, paqueteria: ev.target.value }))} placeholder="Paquetería" />
                    <div style={{ display: 'flex', gap: 6, flex: '1 1 140px' }}>
                      <input style={input} value={formEdit.numero_guia} onChange={ev => setFormEdit(f => ({ ...f, numero_guia: ev.target.value }))} placeholder="Número de guía" />
                      {soportaCamara && (
                        <button type="button" style={{ ...boton('var(--w10)', 'var(--tinta)'), padding: '9px 11px' }} onClick={() => iniciarEscaneo('edit')} title="Escanear con la cámara">📷</button>
                      )}
                    </div>
                  </div>
                  <input style={input} value={formEdit.notas} onChange={ev => setFormEdit(f => ({ ...f, notas: ev.target.value }))} placeholder="Notas" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={boton('var(--marca)')} disabled={guardando} onClick={() => guardarEdicion(e.id)}>Guardar</button>
                    <button style={boton('var(--w10)', 'var(--tinta)')} onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--w45)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div>Costo de envío: <b style={{ color: 'var(--tinta)' }}>{fmt(e.costo_envio)}</b></div>
                  <div>Paquetería: {e.paqueteria || <i>sin capturar</i>} · Guía: {e.numero_guia || <i>sin capturar</i>}</div>
                  {e.entrega_ids?.length > 0 && <div>Entregas: {e.entrega_ids.length}</div>}
                  {e.notas && <div>Notas: {e.notas}</div>}
                </div>
              )}

              {e.estado === 'borrador' && editandoId !== e.id && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={boton('#10b981')} disabled={aprobandoId === e.id} onClick={() => aprobar(e)}>
                    {aprobandoId === e.id ? 'Aprobando...' : '✓ Aprobar y avisar al cliente'}
                  </button>
                  <button style={boton('var(--w10)', 'var(--tinta)')} onClick={() => iniciarEdicion(e)}>Editar</button>
                  <button style={boton('transparent', 'var(--rojo-t)')} onClick={() => cancelarBorrador(e.id)}>Cancelar</button>
                </div>
              )}

              {(e.estado === 'aprobado' || e.estado === 'notificado') && (
                <div style={{ marginTop: 12 }}>
                  <button style={boton('var(--w10)', 'var(--tinta)')} disabled={reenviandoId === e.id} onClick={() => reenviarAviso(e.id)}>
                    {reenviandoId === e.id ? 'Enviando...' : '↻ Reenviar aviso de WhatsApp'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {escaneando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 }}>
          <video ref={videoRef} muted playsInline style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12 }} />
          <p style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>Apunta a la etiqueta con el código de barras o QR de la guía...</p>
          <button style={boton('var(--w10)', 'var(--tinta)')} onClick={detenerEscaneo}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
