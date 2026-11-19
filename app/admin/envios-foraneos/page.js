'use client'
import { useState, useEffect, useMemo, useRef } from 'react'

// ---------------------------------------------------------------------------
// Envíos foráneos — captura guiada en 4 pasos.
//
//   1. Cliente      → lista de clientes con piezas empacadas pendientes de enviar
//   2. Piezas       → se revisa una por una que todo vaya en la caja (como en
//                     el punto de venta); no se avanza con faltantes
//   3. Guía y costo → paquetería de una lista, número de guía (escrito, pistola
//                     USB o cámara) y costo manual
//   4. Confirmar    → guardar borrador, o (admin) aprobar: el costo se suma a
//                     Anticipos y se avisa por WhatsApp
//
// El dinero no cambia respecto al diseño original (ver
// claude/envios-foraneos-plan.md): al aprobar se atribuyen anticipos del
// cliente, nunca se borra nada.
// ---------------------------------------------------------------------------

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const fechaCorta = (f) => {
  if (!f) return ''
  const d = new Date(String(f).slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return f
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}
const iniciales = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

const PAQUETERIAS = ['PaqueteExpress', 'DHL', 'Estafeta', 'FedEx', 'Tufesa']
const PASOS = ['Cliente', 'Piezas', 'Guía y costo', 'Confirmar']

const ESTADO_LABEL = {
  borrador: { texto: 'Borrador', color: 'var(--w45)' },
  aprobado: { texto: 'Aprobado', color: '#0ea5e9' },
  notificado: { texto: 'Notificado', color: '#10b981' },
  cancelado: { texto: 'Cancelado', color: 'var(--rojo-t)' },
}

const card = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
const input = { background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 9, padding: '10px 12px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', width: '100%' }
const tenue = 'var(--w38)'
const FORM_VACIO = { paqueteria: '', otra: '', numero_guia: '', costo_envio: '', notas: '' }

// Selector de paquetería: chips con las que normalmente se envían + "Otra".
function SelectorPaqueteria({ valor, otra, onValor, onOtra }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {[...PAQUETERIAS, 'Otra'].map(p => {
          const activa = valor === p
          return (
            <button key={p} type="button" className="chip" onClick={() => onValor(p)}
              style={{ border: `1px solid ${activa ? 'rgba(193,85,58,0.65)' : 'var(--w10)'}`, background: activa ? 'rgba(193,85,58,0.2)' : 'var(--w025)', color: activa ? 'var(--marca-t)' : 'var(--w60)', fontWeight: activa ? 700 : 500 }}>
              {p}
            </button>
          )
        })}
      </div>
      {valor === 'Otra' && <input style={{ ...input, marginTop: 8 }} placeholder="Nombre de la paquetería" value={otra} onChange={e => onOtra(e.target.value)} />}
    </div>
  )
}

// Campo de guía: la pistola USB escribe aquí directo con solo tener el foco;
// el botón de cámara es para celular/tablet.
function CampoGuia({ valor, onChange, onCamara, soportaCamara, autoFocus }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input style={input} autoFocus={autoFocus} placeholder="Escribe, escanea con pistola o cámara" value={valor} onChange={e => onChange(e.target.value)} />
      {soportaCamara && <button type="button" className="btn btn-neutro" onClick={onCamara} title="Escanear con la cámara">📷</button>}
    </div>
  )
}

const Etiqueta = ({ t }) => <div style={{ fontSize: 11.5, color: tenue, marginBottom: 6, fontWeight: 600, letterSpacing: 0.3 }}>{t}</div>

export default function EnviosForaneos() {
  const [esAdmin, setEsAdmin] = useState(false)
  const [aviso, setAviso] = useState(null)

  // Captura guiada
  const [paso, setPaso] = useState(1)
  const [pendientes, setPendientes] = useState([])
  const [cargandoPend, setCargandoPend] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [clienteSel, setClienteSel] = useState(null)
  const [marcadas, setMarcadas] = useState(() => new Set())
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState(null)

  // Historial
  const [envios, setEnvios] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('')
  const [cargandoHist, setCargandoHist] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [formEdit, setFormEdit] = useState(null)
  const [aprobandoId, setAprobandoId] = useState(null)
  const [reenviandoId, setReenviandoId] = useState(null)

  // Escaneo de guía con cámara (ZXing: funciona igual en Safari y Chrome).
  const [soportaCamara] = useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
  const [escaneando, setEscaneando] = useState(null) // null | 'nuevo' | 'edit'
  const videoRef = useRef(null)
  const lectorRef = useRef(null)
  const controlesRef = useRef(null)

  const avisar = (tipo, texto) => { setAviso({ tipo, texto }); setTimeout(() => setAviso(null), 6000) }

  const detenerEscaneo = () => { controlesRef.current?.stop(); controlesRef.current = null; setEscaneando(null) }
  const iniciarEscaneo = async (destino) => {
    setEscaneando(destino)
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (!lectorRef.current) lectorRef.current = new BrowserMultiFormatReader()
      await new Promise((r) => setTimeout(r, 0))
      const controles = await lectorRef.current.decodeFromConstraints(
        { video: { facingMode: 'environment' } }, videoRef.current,
        (res) => {
          if (!res) return
          const valor = res.getText()
          if (destino === 'nuevo') setForm(f => ({ ...f, numero_guia: valor }))
          else setFormEdit(f => ({ ...f, numero_guia: valor }))
          detenerEscaneo()
        }
      )
      controlesRef.current = controles
    } catch (err) {
      avisar('error', 'No se pudo abrir la cámara: ' + (err?.message || 'permiso denegado.'))
      setEscaneando(null)
    }
  }
  useEffect(() => () => { controlesRef.current?.stop() }, [])

  useEffect(() => {
    fetch('/api/auth/sesion').then(r => r.json()).then(d => setEsAdmin(d?.sesion?.rol === 'admin')).catch(() => {})
  }, [])

  const cargarPendientes = async () => {
    setCargandoPend(true)
    const d = await fetch('/api/envios-foraneos/pendientes').then(r => r.json()).catch(() => null)
    if (d?.ok) setPendientes(d.clientes)
    else avisar('error', d?.mensaje || 'No se pudo cargar la lista de clientes.')
    setCargandoPend(false)
  }
  const cargarHistorial = async () => {
    setCargandoHist(true)
    const qs = filtroEstado ? `?estado=${filtroEstado}` : ''
    const d = await fetch(`/api/envios-foraneos${qs}`).then(r => r.json()).catch(() => null)
    if (d?.ok) setEnvios(d.envios)
    setCargandoHist(false)
  }
  // Carga inicial y al cambiar el filtro (mismo patrón ya tolerado en el proyecto).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarPendientes() }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { cargarHistorial() }, [filtroEstado])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return []
    return pendientes.filter(c => {
      return String(c.nombre || '').toLowerCase().includes(q) || String(c.telefono || '').includes(q)
    })
  }, [pendientes, busqueda])

  const piezas = clienteSel?.piezas || []
  const todasMarcadas = piezas.length > 0 && marcadas.size === piezas.length
  const paqueteriaFinal = form.paqueteria === 'Otra' ? form.otra.trim() : form.paqueteria
  const guiaOk = !!paqueteriaFinal && !!form.numero_guia.trim() && Number(form.costo_envio) > 0

  const elegirCliente = (c) => { setClienteSel(c); setMarcadas(new Set()); setForm(FORM_VACIO); setPaso(2) }
  const alternarPieza = (id) => setMarcadas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const reiniciar = () => { setPaso(1); setClienteSel(null); setMarcadas(new Set()); setForm(FORM_VACIO); setResultado(null); cargarPendientes(); cargarHistorial() }

  const crearBorrador = () => fetch('/api/envios-foraneos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente_id: clienteSel.id,
      pedido_ids: piezas.map(p => p.id),
      paqueteria: paqueteriaFinal,
      numero_guia: form.numero_guia.trim(),
      costo_envio: form.costo_envio,
      notas: form.notas,
    }),
  }).then(r => r.json())

  const guardarBorrador = async () => {
    setGuardando(true)
    const res = await crearBorrador()
    setGuardando(false)
    if (!res.ok) return avisar('error', res.mensaje || 'No se pudo guardar.')
    setResultado({ tipo: 'borrador', cliente: clienteSel.nombre })
  }

  const aprobarDirecto = async () => {
    setGuardando(true)
    const res = await crearBorrador()
    if (!res.ok) { setGuardando(false); return avisar('error', res.mensaje || 'No se pudo guardar.') }
    const ap = await fetch('/api/envios-foraneos/aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: res.envio.id }) }).then(r => r.json())
    setGuardando(false)
    if (!ap.ok) { avisar('error', (ap.mensaje || 'No se pudo aprobar.') + ' Quedó guardado como borrador.'); return setResultado({ tipo: 'borrador', cliente: clienteSel.nombre }) }
    setResultado({ tipo: 'aprobado', cliente: clienteSel.nombre, cubierto: ap.cubierto, pendiente: ap.pendiente, aviso: ap.aviso })
  }

  // ── Historial: acciones ────────────────────────────────────────────────
  const iniciarEdicion = (e) => {
    setEditandoId(e.id)
    const conocida = PAQUETERIAS.includes(e.paqueteria)
    setFormEdit({ paqueteria: conocida ? e.paqueteria : (e.paqueteria ? 'Otra' : ''), otra: conocida ? '' : (e.paqueteria || ''), numero_guia: e.numero_guia || '', costo_envio: e.costo_envio || '', notas: e.notas || '' })
  }
  const guardarEdicion = async (id) => {
    const paq = formEdit.paqueteria === 'Otra' ? formEdit.otra.trim() : formEdit.paqueteria
    setGuardando(true)
    const res = await fetch(`/api/envios-foraneos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paqueteria: paq, numero_guia: formEdit.numero_guia, costo_envio: formEdit.costo_envio, notas: formEdit.notas }) }).then(r => r.json())
    setGuardando(false)
    if (!res.ok) return avisar('error', res.mensaje || 'No se pudo guardar.')
    avisar('ok', 'Cambios guardados.'); setEditandoId(null); cargarHistorial()
  }
  const cancelarBorrador = async (id) => {
    if (!confirm('¿Cancelar este envío? Sigue en borrador, no tiene dinero atribuido. Sus piezas vuelven a la lista de pendientes.')) return
    const res = await fetch(`/api/envios-foraneos/${id}`, { method: 'DELETE' }).then(r => r.json())
    if (!res.ok) return avisar('error', res.mensaje || 'No se pudo cancelar.')
    cargarHistorial(); cargarPendientes()
  }
  const cancelarAprobado = async (id) => {
    if (!confirm('¿Cancelar este envío ya aprobado? El costo deja de cobrarse y el dinero atribuido vuelve a ser anticipo general del cliente. Solo un administrador puede hacerlo.')) return
    const res = await fetch(`/api/envios-foraneos/${id}`, { method: 'DELETE' }).then(r => r.json())
    if (!res.ok) return avisar('error', res.mensaje || 'No se pudo cancelar.')
    avisar('ok', 'Envío cancelado. El dinero vuelve a ser anticipo general del cliente.'); cargarHistorial(); cargarPendientes()
  }
  const aprobar = async (e) => {
    if (!e.paqueteria || !e.numero_guia) return avisar('error', 'Falta paquetería o número de guía.')
    if (!confirm(`¿Confirmas el envío de ${e.clientes?.nombre || 'este cliente'} por ${fmt(e.costo_envio)} con ${e.paqueteria}, guía ${e.numero_guia}? Se sumará a su cuenta y se le avisará por WhatsApp.`)) return
    setAprobandoId(e.id)
    const res = await fetch('/api/envios-foraneos/aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) }).then(r => r.json())
    setAprobandoId(null)
    if (!res.ok) return avisar('error', res.mensaje || 'No se pudo aprobar.')
    const partes = [`Cubierto con anticipo: ${fmt(res.cubierto)}.`]
    if (res.pendiente > 0) partes.push(`Todavía debe ${fmt(res.pendiente)} de este envío.`)
    partes.push(res.aviso?.ok ? `Aviso enviado (${res.aviso.via}).` : `El aviso de WhatsApp no salió: ${res.aviso?.mensaje || 'error desconocido'}.`)
    avisar(res.aviso?.ok ? 'ok' : 'error', partes.join(' ')); cargarHistorial()
  }
  const reenviarAviso = async (id) => {
    setReenviandoId(id)
    const res = await fetch('/api/envios-foraneos/notificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then(r => r.json())
    setReenviandoId(null)
    avisar(res.ok ? 'ok' : 'error', res.ok ? `Aviso reenviado (${res.via}).` : (res.mensaje || 'No se pudo reenviar.')); cargarHistorial()
  }

  return (
    <div className="envf" style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <style>{`
        .envf input:focus { border-color: rgba(193,85,58,0.65) !important; box-shadow: 0 0 0 3px rgba(193,85,58,0.13); }
        .envf input[type=number]::-webkit-outer-spin-button, .envf input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .envf input[type=number] { -moz-appearance: textfield; font-variant-numeric: tabular-nums; }
        .envf .btn { border-radius: 9px; padding: 10px 16px; font-size: 12.5px; font-weight: 700; letter-spacing: .2px; cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: filter .15s, background .15s; }
        .envf .btn:hover:not(:disabled) { filter: brightness(1.12); }
        .envf .btn:disabled { opacity: .45; cursor: not-allowed; }
        .envf .btn-marca { background: #c1553a; color: #fff; }
        .envf .btn-verde { background: #0f9e72; color: #fff; }
        .envf .btn-neutro { background: transparent; border-color: var(--w13); color: var(--w50); }
        .envf .btn-neutro:hover:not(:disabled) { background: var(--w05); }
        .envf .btn-peligro { background: transparent; border-color: rgba(var(--rojo-rgb),0.28); color: #f87171; }
        .envf .chip { padding: 9px 15px; border-radius: 11px; font-size: 12.5px; cursor: pointer; transition: all .15s; }
        .envf .fila { transition: border-color .15s, background .15s; }
        .envf .fila:hover { border-color: var(--w14) !important; }
        @keyframes envf-vuela { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(2deg); } }
        .envf .vuela { animation: envf-vuela 2.6s ease-in-out infinite; }
        .envf .cuerpo { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 980px) { .envf .cuerpo { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Envíos foráneos</div>
          <div style={{ color: tenue, fontSize: 13, marginTop: 3 }}>Elige al cliente, revisa sus piezas y captura la guía</div>
        </div>

        {aviso && (
          <div style={{ ...card, borderColor: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.3)' : 'rgba(16,185,129,0.3)', background: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.08)' : 'rgba(16,185,129,0.08)', padding: '11px 15px', color: aviso.tipo === 'error' ? 'var(--rojo-t)' : '#10b981', fontSize: 13, marginBottom: 14 }}>
            {aviso.texto}
          </div>
        )}

        {/* ── Barra de pasos ───────────────────────────────────────────── */}
        {!resultado && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {PASOS.map((t, i) => {
              const n = i + 1
              const activo = paso === n
              const hecho = paso > n
              return (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 11, border: `1px solid ${activo ? 'rgba(193,85,58,0.65)' : 'var(--w09)'}`, background: activo ? 'rgba(193,85,58,0.18)' : 'var(--w025)', color: activo ? 'var(--marca-t)' : hecho ? 'var(--verde)' : 'var(--w45)', fontSize: 12.5, fontWeight: activo ? 700 : 500 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: hecho ? 'var(--verde-suave)' : activo ? 'rgba(193,85,58,0.3)' : 'var(--w06)' }}>{hecho ? '✓' : n}</span>
                  {t}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Pantalla final ───────────────────────────────────────────── */}
        {resultado && (
          <div style={{ ...card, padding: '34px 24px', textAlign: 'center', marginBottom: 24 }}>
            {resultado.tipo === 'aprobado' && (
              <video className="vuela" src="/assets/mascota/saludar.webm" autoPlay loop muted playsInline style={{ width: 150, height: 150, objectFit: 'contain', margin: '0 auto 6px', display: 'block' }} />
            )}
            <div style={{ color: 'var(--tinta)', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              {resultado.tipo === 'aprobado' ? '¡Envío en camino!' : 'Borrador guardado'}
            </div>
            <div style={{ color: tenue, fontSize: 13.5, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 18px' }}>
              {resultado.tipo === 'aprobado' ? (
                <>
                  El envío de <b style={{ color: 'var(--tinta)' }}>{resultado.cliente}</b> quedó aprobado. Cubierto con anticipo: {fmt(resultado.cubierto)}.
                  {resultado.pendiente > 0 && <> Todavía debe {fmt(resultado.pendiente)} de este envío.</>}
                  <br />
                  {resultado.aviso?.ok ? `Aviso de WhatsApp enviado (${resultado.aviso.via}).` : `El aviso de WhatsApp no salió: ${resultado.aviso?.mensaje || 'error desconocido'}. Puedes reenviarlo desde el historial.`}
                </>
              ) : (
                <>El envío de <b style={{ color: 'var(--tinta)' }}>{resultado.cliente}</b> quedó como borrador. Un administrador lo aprueba desde el historial y ahí se suma a Anticipos y se avisa al cliente.</>
              )}
            </div>
            <button className="btn btn-marca" onClick={reiniciar}>Registrar otro envío</button>
          </div>
        )}

        {/* ── Paso 1: cliente ──────────────────────────────────────────── */}
        {!resultado && paso === 1 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', gap: 7, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--w25)', fontSize: 13 }}>⌕</span>
                <input placeholder="Buscar cliente por nombre o teléfono…" value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ ...input, paddingLeft: 30 }} autoFocus />
              </div>
            </div>

            {cargandoPend ? (
              <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>Cargando…</div>
            ) : !busqueda.trim() ? (
              <div style={{ ...card, padding: 34, textAlign: 'center', color: tenue, fontSize: 13.5 }}>
                {pendientes.length === 0
                  ? 'No hay clientes con piezas empacadas pendientes de enviar.'
                  : `Escribe el nombre o teléfono del cliente. Hay ${pendientes.length} clientes con piezas listas para enviar.`}
              </div>
            ) : visibles.length === 0 ? (
              <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w28)', fontSize: 13 }}>
                Nadie con piezas listas coincide con esa búsqueda.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 10 }}>
                {visibles.map(c => (
                  <button key={c.id} className="fila" onClick={() => elegirCliente(c)}
                    style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--w06)', color: 'var(--w60)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{iniciales(c.nombre)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', color: 'var(--tinta)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
                      {c.faltan > 0 && <span style={{ display: 'block', color: 'var(--ambar)', fontSize: 11.5, marginTop: 2 }}>Faltan {c.faltan} por llegar a tienda</span>}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--verde-suave)', color: 'var(--verde)', whiteSpace: 'nowrap' }}>{c.listas} {c.listas === 1 ? 'pieza lista' : 'piezas listas'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pasos 2 a 4 ──────────────────────────────────────────────── */}
        {!resultado && paso > 1 && clienteSel && (
          <div className="cuerpo" style={{ marginBottom: 28 }}>
            <div style={{ ...card, padding: 18 }}>
              {paso === 2 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                    <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 16 }}>Revisa que todo vaya en la caja</div>
                    <div style={{ color: todasMarcadas ? 'var(--verde)' : 'var(--ambar)', fontSize: 12.5, fontWeight: 700 }}>{marcadas.size} de {piezas.length} revisadas</div>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--w06)', marginBottom: 14, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${piezas.length ? (marcadas.size / piezas.length) * 100 : 0}%`, background: todasMarcadas ? 'var(--verde)' : 'var(--ambar)', transition: 'width .2s' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {piezas.map(p => {
                      const ok = marcadas.has(p.id)
                      return (
                        <button key={p.id} className="fila" onClick={() => alternarPieza(p.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', border: `1px solid ${ok ? 'var(--verde-borde)' : 'var(--w09)'}`, background: ok ? 'var(--verde-suave)' : 'var(--w025)' }}>
                          <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, border: `2px solid ${ok ? 'var(--verde)' : 'var(--w25)'}`, background: ok ? 'var(--verde)' : 'transparent', color: '#fff' }}>{ok ? '✓' : ''}</span>
                          {p.foto
                            ? <img src={p.foto} alt="" style={{ width: 46, height: 46, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                            : <span style={{ width: 46, height: 46, borderRadius: 9, background: 'var(--w06)', flexShrink: 0 }} />}
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', color: 'var(--tinta)', fontSize: 13.5, fontWeight: 600 }}>{p.nombre}</span>
                            <span style={{ display: 'block', color: tenue, fontSize: 11.5, marginTop: 2 }}>
                              Entrega {fechaCorta(p.entrega_fecha)}{p.fragil && <b style={{ color: 'var(--ambar)', marginLeft: 8 }}>Frágil</b>}
                            </span>
                          </span>
                          <span style={{ color: 'var(--w60)', fontSize: 14, fontWeight: 700 }}>x{p.cantidad}</span>
                        </button>
                      )
                    })}
                  </div>
                  {clienteSel.faltan > 0 && (
                    <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, background: 'var(--ambar-suave)', color: 'var(--ambar)', fontSize: 12.5 }}>
                      Este cliente tiene {clienteSel.faltan} {clienteSel.faltan === 1 ? 'pieza' : 'piezas'} más que todavía no {clienteSel.faltan === 1 ? 'llega' : 'llegan'} a tienda. No van en este envío.
                    </div>
                  )}
                  {!todasMarcadas && <div style={{ marginTop: 12, color: tenue, fontSize: 12 }}>Marca todas las piezas para continuar. Si falta una, no se puede enviar.</div>}
                </>
              )}

              {paso === 3 && (
                <>
                  <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Guía y costo</div>
                  <Etiqueta t="PAQUETERÍA" />
                  <SelectorPaqueteria valor={form.paqueteria} otra={form.otra} onValor={v => setForm(f => ({ ...f, paqueteria: v }))} onOtra={v => setForm(f => ({ ...f, otra: v }))} />
                  <div style={{ height: 14 }} />
                  <Etiqueta t="NÚMERO DE GUÍA" />
                  <CampoGuia valor={form.numero_guia} onChange={v => setForm(f => ({ ...f, numero_guia: v }))} onCamara={() => iniciarEscaneo('nuevo')} soportaCamara={soportaCamara} autoFocus />
                  <div style={{ height: 14 }} />
                  <Etiqueta t="COSTO DEL ENVÍO (MXN)" />
                  <input style={{ ...input, maxWidth: 200 }} type="number" step="0.01" placeholder="0.00" value={form.costo_envio} onChange={e => setForm(f => ({ ...f, costo_envio: e.target.value }))} />
                  <div style={{ color: tenue, fontSize: 12, marginTop: 6 }}>Incluye el empaque. Se suma al estado de cuenta de {clienteSel.nombre} en Anticipos.</div>
                  <div style={{ height: 14 }} />
                  <Etiqueta t="NOTAS (OPCIONAL)" />
                  <input style={input} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
                </>
              )}

              {paso === 4 && (
                <>
                  <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Confirmar y avisar</div>
                  {[['Cliente', clienteSel.nombre], ['Piezas verificadas', `${piezas.length} de ${piezas.length}`], ['Paquetería', paqueteriaFinal], ['Número de guía', form.numero_guia], ['Costo de envío', fmt(form.costo_envio)]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--w06)', fontSize: 13.5 }}>
                      <span style={{ color: tenue }}>{k}</span><span style={{ color: 'var(--tinta)', fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--w06)', paddingTop: 12, color: tenue, fontSize: 12.5, lineHeight: 1.6 }}>
                    {esAdmin
                      ? 'Al aprobar, el costo se toma de los anticipos del cliente (se suma en Anticipos) y se le avisa por WhatsApp con paquetería y guía.'
                      : 'Se guarda como borrador. Un administrador lo aprueba; ahí se suma a Anticipos y se avisa al cliente.'}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                <button className="btn btn-neutro" onClick={() => paso === 2 ? reiniciar() : setPaso(paso - 1)}>{paso === 2 ? 'Cambiar cliente' : 'Atrás'}</button>
                {paso === 2 && <button className="btn btn-marca" disabled={!todasMarcadas} onClick={() => setPaso(3)}>Continuar</button>}
                {paso === 3 && <button className="btn btn-marca" disabled={!guiaOk} onClick={() => setPaso(4)}>Continuar</button>}
                {paso === 4 && (
                  <>
                    {esAdmin && <button className="btn btn-verde" disabled={guardando} onClick={aprobarDirecto}>{guardando ? 'Guardando…' : 'Aprobar y avisar por WhatsApp'}</button>}
                    <button className={esAdmin ? 'btn btn-neutro' : 'btn btn-marca'} disabled={guardando} onClick={guardarBorrador}>Guardar borrador</button>
                  </>
                )}
              </div>
            </div>

            {/* Resumen fijo del cliente */}
            <div style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--w06)', color: 'var(--w60)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{iniciales(clienteSel.nombre)}</span>
                <div>
                  <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 15 }}>{clienteSel.nombre}</div>
                  <div style={{ color: tenue, fontSize: 12 }}>{piezas.length} {piezas.length === 1 ? 'pieza' : 'piezas'} para enviar</div>
                </div>
              </div>
              {paso >= 3 && (
                <div style={{ borderTop: '1px solid var(--w06)', paddingTop: 10, fontSize: 12.5, color: tenue, lineHeight: 1.7 }}>
                  {paqueteriaFinal && <div>Paquetería: <b style={{ color: 'var(--tinta)' }}>{paqueteriaFinal}</b></div>}
                  {form.numero_guia && <div>Guía: <b style={{ color: 'var(--tinta)' }}>{form.numero_guia}</b></div>}
                  {Number(form.costo_envio) > 0 && <div>Costo: <b style={{ color: 'var(--tinta)' }}>{fmt(form.costo_envio)}</b></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Historial ────────────────────────────────────────────────── */}
        <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800, margin: '8px 0 12px' }}>Envíos registrados</div>
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          {['', 'borrador', 'aprobado', 'notificado', 'cancelado'].map(v => (
            <button key={v || 'todos'} className="chip" onClick={() => setFiltroEstado(v)}
              style={{ border: `1px solid ${filtroEstado === v ? 'rgba(193,85,58,0.5)' : 'var(--w09)'}`, background: filtroEstado === v ? 'rgba(193,85,58,0.16)' : 'var(--w025)', color: filtroEstado === v ? 'var(--marca-t)' : 'var(--w45)', padding: '7px 13px' }}>
              {v ? ESTADO_LABEL[v].texto : 'Todos'}
            </button>
          ))}
        </div>

        {cargandoHist ? (
          <p style={{ color: tenue }}>Cargando…</p>
        ) : envios.length === 0 ? (
          <p style={{ color: tenue }}>No hay envíos foráneos con este filtro.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
            {envios.map(e => (
              <div key={e.id} style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--tinta)' }}>{e.clientes?.nombre || 'Sin nombre'}</div>
                    <div style={{ fontSize: 11.5, color: tenue }}>{new Date(e.creado_en).toLocaleDateString('es-MX')}{e.pedido_ids?.length > 0 && ` · ${e.pedido_ids.length} ${e.pedido_ids.length === 1 ? 'pieza' : 'piezas'}`}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_LABEL[e.estado]?.color, background: 'var(--w05)', padding: '4px 10px', borderRadius: 20 }}>{ESTADO_LABEL[e.estado]?.texto || e.estado}</span>
                </div>

                {editandoId === e.id ? (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <SelectorPaqueteria valor={formEdit.paqueteria} otra={formEdit.otra} onValor={v => setFormEdit(f => ({ ...f, paqueteria: v }))} onOtra={v => setFormEdit(f => ({ ...f, otra: v }))} />
                    <CampoGuia valor={formEdit.numero_guia} onChange={v => setFormEdit(f => ({ ...f, numero_guia: v }))} onCamara={() => iniciarEscaneo('edit')} soportaCamara={soportaCamara} />
                    <input style={{ ...input, maxWidth: 180 }} type="number" step="0.01" placeholder="Costo de envío" value={formEdit.costo_envio} onChange={ev => setFormEdit(f => ({ ...f, costo_envio: ev.target.value }))} />
                    <input style={input} placeholder="Notas" value={formEdit.notas} onChange={ev => setFormEdit(f => ({ ...f, notas: ev.target.value }))} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-marca" disabled={guardando} onClick={() => guardarEdicion(e.id)}>Guardar</button>
                      <button className="btn btn-neutro" onClick={() => setEditandoId(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 13, color: tenue, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div>Costo de envío: <b style={{ color: 'var(--tinta)' }}>{fmt(e.costo_envio)}</b></div>
                    <div>{e.paqueteria || <i>sin paquetería</i>} · Guía: {e.numero_guia || <i>sin capturar</i>}</div>
                    {e.notas && <div>Notas: {e.notas}</div>}
                  </div>
                )}

                {e.estado === 'borrador' && editandoId !== e.id && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {esAdmin && <button className="btn btn-verde" disabled={aprobandoId === e.id} onClick={() => aprobar(e)}>{aprobandoId === e.id ? 'Aprobando…' : 'Aprobar y avisar'}</button>}
                    <button className="btn btn-neutro" onClick={() => iniciarEdicion(e)}>Editar</button>
                    <button className="btn btn-peligro" onClick={() => cancelarBorrador(e.id)}>Cancelar</button>
                  </div>
                )}
                {(e.estado === 'aprobado' || e.estado === 'notificado') && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-neutro" disabled={reenviandoId === e.id} onClick={() => reenviarAviso(e.id)}>{reenviandoId === e.id ? 'Enviando…' : '↻ Reenviar aviso de WhatsApp'}</button>
                    {esAdmin && <button className="btn btn-peligro" onClick={() => cancelarAprobado(e.id)}>Cancelar envío</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {escaneando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 }}>
          <video ref={videoRef} muted playsInline style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12 }} />
          <p style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>Apunta a la etiqueta con el código de barras o QR de la guía…</p>
          <button className="btn btn-neutro" style={{ color: '#fff' }} onClick={detenerEscaneo}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
