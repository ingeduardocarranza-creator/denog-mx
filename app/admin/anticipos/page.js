'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { paraWaMe } from '@/lib/whatsapp/telefono'

// ---------------------------------------------------------------------------
// Anticipos — sesión de captura por entrega.
//
// El trabajo real es: se elige una entrega y se recorre en orden alfabético a
// quienes compraron en ella, abonando uno por uno. La pantalla es esa lista,
// no un formulario suelto. Al lado va la bandeja de comprobantes que llegaron
// por WhatsApp, para aplicarlos sin volver a teclear el monto.
//
// Reglas de la sección (es dinero, solo admin la ve):
//  · aplicar un comprobante crea el pago y cierra el comprobante en un paso;
//  · un anticipo no se borra, se cancela con motivo (queda en bitácora);
//  · un abono repetido el mismo día pide confirmación antes de guardarse.
//
// Sobre el color: verde / ámbar / gris son estados, no series. Cada segmento
// del gráfico lleva su etiqueta y su conteo — el color nunca carga el dato solo.
// ---------------------------------------------------------------------------

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
const fmtCorto = (n) => { const v = Number(n || 0); return v >= 1000 ? `$${(v / 1000).toFixed(1).replace('.0','')}k` : `$${v.toLocaleString('es-MX')}` }
const fechaEntrega = (f) => { if (!f) return ''; const d = new Date(f + 'T12:00:00'); return `${d.getDate()} ${MESES[d.getMonth()]}` }
const fechaCorta = (f) => { if (!f) return ''; const d = new Date(f); return `${d.getDate()} ${MESES[d.getMonth()].slice(0,3).toLowerCase()}` }
const hoyISO = () => { const h = new Date(); return new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().split('T')[0] }
const iniciales = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

// Paleta de estado, validada contra la superficie oscura: separación para
// daltonismo ΔE 10 entre verde y ámbar y contraste ≥ 3:1 en los tres.
// tono = relleno (barras, puntos); tinta = texto. Se separan porque en el
// tema claro el gris que funciona como relleno no tiene contraste para leerse.
const ESTADO = {
  liquidado:    { tono: 'var(--verde)', tinta: 'var(--verde)',  suave: 'var(--verde-suave)', borde: 'var(--verde-borde)', et: 'Liquidado' },
  parcial:      { tono: 'var(--ambar)', tinta: 'var(--ambar)',  suave: 'var(--ambar-suave)', borde: 'var(--ambar-borde)', et: 'Parcial' },
  a_favor:      { tono: 'var(--azul)',  tinta: 'var(--azul)',   suave: 'var(--azul-suave)',  borde: 'var(--azul-borde)',  et: 'A favor' },
  sin_anticipo: { tono: 'var(--gris)',  tinta: 'var(--gris-t)', suave: 'var(--gris-suave)',  borde: 'var(--gris-borde)',  et: 'Sin anticipo' },
}
const MARCA = 'var(--marca)'

const card = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
const input = { background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 9, padding: '9px 11px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const tenue = 'var(--w38)'

export default function Anticipos() {
  const [entregas, setEntregas] = useState([])
  const [entregaId, setEntregaId] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [filtroBandeja, setFiltroBandeja] = useState('todos')
  // Con 159 comprobantes sin aplicar, los filtros por estado no alcanzan:
  // cuando buscas UNA transferencia de alguien, buscas por su nombre.
  const [busquedaBandeja, setBusquedaBandeja] = useState('')

  useEffect(() => {
    fetch('/api/entregas').then(r => r.json()).then(d => {
      const lista = (d.entregas || []).slice().sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || ''))
      setEntregas(lista)
      if (lista[0] && !entregaId) setEntregaId(lista[0].id)
    })
  }, [])

  useEffect(() => { if (entregaId) cargar() }, [entregaId])

  const cargar = async () => {
    setCargando(true)
    const r = await fetch(`/api/anticipos/entrega?entrega_id=${entregaId}`).then(r => r.json())
    setCargando(false)
    if (r.ok) setDatos(r)
    else notificar('error', r.mensaje || 'No se pudo cargar la entrega')
  }

  const notificar = (tipo, texto) => { setAviso({ tipo, texto }); setTimeout(() => setAviso(null), 4000) }

  const guardar = async (cuerpo, { confirmar = false } = {}) => {
    const res = await fetch('/api/anticipos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cuerpo, confirmar_duplicado: confirmar }),
    }).then(r => r.json())

    if (res.requiere_confirmacion) { setConfirmando({ cuerpo, mensaje: res.mensaje }); return false }
    if (!res.ok) { notificar('error', res.mensaje || 'No se pudo registrar'); return false }
    setConfirmando(null)
    await cargar()
    return true
  }

  const cancelar = async () => {
    if (!motivo.trim()) return
    const res = await fetch('/api/anticipos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cancelando.id, motivo }),
    }).then(r => r.json())
    if (!res.ok) { notificar('error', res.mensaje); return }
    setCancelando(null); setMotivo('')
    notificar('exito', 'Anticipo cancelado — quedó registrado en la bitácora')
    cargar()
  }

  const descartarComprobante = async (id) => {
    const razon = prompt('¿Por qué no era un comprobante?')
    if (razon === null) return
    await fetch('/api/pendientes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'descartar', motivo: razon }),
    })
    cargar()
  }

  const roster = datos?.roster || []
  const visibles = useMemo(() => roster.filter(r => {
    if (busqueda && !r.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (filtro === 'liquidados') return r.estado === 'liquidado' || r.estado === 'a_favor'
    if (filtro === 'parcial') return r.estado === 'parcial'
    if (filtro === 'sin_anticipo') return r.estado === 'sin_anticipo'
    if (filtro === 'con_saldo') return r.saldo > 0.5
    return true
  }), [roster, busqueda, filtro])

  const c = datos?.cuadre
  const conteos = useMemo(() => ({
    liquidado: roster.filter(r => r.estado === 'liquidado' || r.estado === 'a_favor').length,
    parcial: roster.filter(r => r.estado === 'parcial').length,
    sin_anticipo: roster.filter(r => r.estado === 'sin_anticipo').length,
  }), [roster])

  const bandeja = datos?.bandeja || []
  const bandejaVisible = useMemo(() => {
    const q = busquedaBandeja.trim().toLowerCase()
    return bandeja.filter(b => {
      if (filtroBandeja === 'huerfanos' && !b.huerfano_resuelto) return false
      if (filtroBandeja === 'entrega' && !b.en_esta_entrega) return false
      if (!q) return true
      // Se busca por el cliente que el sistema sugirió, por el nombre con el
      // que aparece en WhatsApp (que a veces es el único dato) y por teléfono.
      const nombre = (b.cliente_sugerido?.nombre || '').toLowerCase()
      const wa = (b.nombre_whatsapp || '').toLowerCase()
      const tel = String(b.telefono_whatsapp || '')
      return nombre.includes(q) || wa.includes(q) || tel.includes(q)
    })
  }, [bandeja, filtroBandeja, busquedaBandeja])

  const entregaActual = entregas.find(e => e.id === entregaId)

  return (
    <div className="anticipos" style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <style>{`
        /* La tipografía la pone el panel entero (globals.css). Aquí sólo
           las cifras, que van con tabular-nums para alinearse en columna. */
        .cifra-valor, .monto, .anticipos input[type=number] { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }

        .cifras { display: grid; grid-template-columns: repeat(6, 1fr); }
        .cifras > div { padding: 16px 18px; border-right: 1px solid var(--w05); }
        .cifras > div:nth-child(6n) { border-right: none; }
        .graficos { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
        @media (max-width: 1240px) {
          .cifras { grid-template-columns: repeat(3, 1fr); }
          .cifras > div:nth-child(3n) { border-right: none; }
          .cifras > div:nth-child(-n+3) { border-bottom: 1px solid var(--w05); }
          .graficos { grid-template-columns: 1fr; gap: 20px; }
        }

        /* Botones: cada acción con su propio color, para que nunca se confunda
           abonar una parte con liquidar todo, ni aplicar con descartar. */
        .btn {
          border-radius: 9px; padding: 9px 16px; font-size: 12px; font-weight: 700;
          letter-spacing: 0.2px; cursor: pointer; border: 1px solid transparent;
          white-space: nowrap; transition: filter .15s, background .15s, border-color .15s;
        }
        .btn:hover:not(:disabled) { filter: brightness(1.14); }
        .btn:active:not(:disabled) { transform: translateY(1px); }
        .btn:disabled { opacity: .45; cursor: not-allowed; filter: none; }

        .btn-abono    { background: #c1553a; color: #fff; }
        .btn-liquidar { background: #0f9e72; color: #fff; }
        .btn-aplicar  { background: #c1553a; color: #fff; }
        .btn-neutro   { background: transparent; border-color: var(--w13); color: var(--w50); }
        .btn-neutro:hover { background: var(--w05); color: var(--w75); }
        .btn-cancelar {
          background: transparent; border-color: rgba(var(--rojo-rgb),0.28); color: #f87171;
          padding: 4px 11px; font-size: 10.5px; border-radius: 7px;
        }
        .btn-cancelar:hover { background: rgba(var(--rojo-rgb),0.12); border-color: rgba(var(--rojo-rgb),0.5); }

        /* Foco visible: es una pantalla que se opera a teclado. */
        .anticipos input:focus, .anticipos select:focus {
          border-color: rgba(193,85,58,0.65) !important;
          box-shadow: 0 0 0 3px rgba(193,85,58,0.13);
        }
        .anticipos input[type=number]::-webkit-outer-spin-button,
        .anticipos input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .anticipos input[type=number] { -moz-appearance: textfield; }

        .fila:hover { border-color: var(--w14) !important; }
      `}</style>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>

        {/* ── Encabezado ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Anticipos</div>
            <div style={{ color: tenue, fontSize: 13, marginTop: 3 }}>
              Elige la entrega y ve abonando en orden alfabético
            </div>
          </div>
          {entregaActual && (
            <div style={{ color: tenue, fontSize: 12 }}>
              Entrega <span style={{ color: 'var(--marca-t)', fontWeight: 700 }}>{fechaEntrega(entregaActual.fecha_entrega)}</span>
            </div>
          )}
        </div>

        {/* ── Selector de entrega ────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
          {entregas.map(e => {
            const activa = entregaId === e.id
            return (
              <button key={e.id} onClick={() => { setEntregaId(e.id); setAbierto(null); setFiltro('todos'); setBusqueda('') }}
                style={{
                  padding: '9px 15px', borderRadius: 11, cursor: 'pointer', fontSize: 12,
                  fontWeight: activa ? 700 : 500, letterSpacing: 0.2, transition: 'all .15s',
                  border: `1px solid ${activa ? 'rgba(193,85,58,0.65)' : 'var(--w09)'}`,
                  background: activa ? 'rgba(193,85,58,0.22)' : 'var(--w025)',
                  color: activa ? 'var(--marca-t)' : 'var(--w50)',
                  boxShadow: activa ? '0 0 0 3px rgba(193,85,58,0.10)' : 'none',
                }}>
                {fechaEntrega(e.fecha_entrega)}
              </button>
            )
          })}
        </div>

        {aviso && (
          <div style={{ ...card, borderColor: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.3)' : 'rgba(16,185,129,0.3)', background: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.08)' : 'rgba(16,185,129,0.08)', padding: '11px 15px', color: aviso.tipo === 'error' ? 'var(--rojo-t)' : '#10b981', fontSize: 13, marginBottom: 14 }}>
            {aviso.texto}
          </div>
        )}

        {/* ── Panel de cuadre ────────────────────────────────────────── */}
        {c && (
          <div style={{ ...card, padding: 0, marginBottom: 16, overflow: 'hidden' }}>

            <div className="cifras">
              <Cifra etiqueta="Clientes" valor={c.clientes} />
              <Cifra etiqueta="Vendido" valor={fmt(c.vendido)} />
              <Cifra etiqueta="Cobrado" valor={fmt(c.cobrado)} tono={ESTADO.liquidado.tono} />
              <Cifra etiqueta="Por cobrar" valor={fmt(c.saldo)} tono={c.saldo > 0 ? ESTADO.parcial.tono : ESTADO.liquidado.tono} />
              <Cifra etiqueta="Liquidados" valor={`${c.liquidados} / ${c.clientes}`} />
              <Cifra etiqueta="Sin aplicar" valor={c.comprobantes_sin_aplicar}
                tono={c.comprobantes_sin_aplicar > 0 ? MARCA : ESTADO.liquidado.tono} />
            </div>

            <div className="graficos" style={{ padding: '20px 22px 22px', borderTop: '1px solid var(--w06)' }}>
              <BarraDinero cobrado={c.cobrado} porCobrar={c.saldo} />
              <BarraEstados conteos={conteos} total={c.clientes} filtro={filtro} onFiltrar={setFiltro} />
            </div>

            {c.huerfanos > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(var(--rojo-rgb),0.07)', borderTop: '1px solid rgba(var(--rojo-rgb),0.2)', padding: '12px 22px', color: 'var(--rojo-t)', fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>
                  {c.huerfanos === 1
                    ? 'Un comprobante quedó marcado como atendido pero nunca generó pago. Está en la bandeja, marcado en rojo — aplícalo para recuperar ese dinero.'
                    : `${c.huerfanos} comprobantes quedaron marcados como atendidos pero nunca generaron pago. Están en la bandeja, marcados en rojo — aplícalos para recuperar ese dinero.`}
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── Lista alfabética ─────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 12, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--w25)', fontSize: 13 }}>⌕</span>
                <input placeholder="Buscar por nombre…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                  style={{ ...input, width: '100%', paddingLeft: 30 }} />
              </div>
              {[['todos','Todos'],['con_saldo','Con saldo'],['liquidados','Liquidados']].map(([v, t]) => (
                <button key={v} onClick={() => setFiltro(v)}
                  style={{ padding: '9px 13px', borderRadius: 9, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${filtro === v ? 'rgba(193,85,58,0.5)' : 'var(--w09)'}`,
                    background: filtro === v ? 'rgba(193,85,58,0.16)' : 'var(--w025)',
                    color: filtro === v ? 'var(--marca-t)' : 'var(--w45)' }}>{t}</button>
              ))}
            </div>

            {['parcial','sin_anticipo'].includes(filtro) && (
              <div style={{ marginBottom: 10, fontSize: 12, color: tenue }}>
                Filtrando por <b style={{ color: ESTADO[filtro].tono }}>{ESTADO[filtro].et}</b>{' · '}
                <span onClick={() => setFiltro('todos')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>quitar</span>
              </div>
            )}

            {cargando && <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>Cargando…</div>}

            {!cargando && visibles.length === 0 && (
              <div style={{ ...card, padding: 44, textAlign: 'center', color: 'var(--w28)', fontSize: 13 }}>
                {roster.length === 0 ? 'Nadie compró en esta entrega todavía' : 'Nadie coincide con este filtro'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {visibles.map(r => (
                <Renglon key={r.cliente_id} r={r} entregaId={entregaId}
                  abierto={abierto === r.cliente_id}
                  onAbrir={() => setAbierto(abierto === r.cliente_id ? null : r.cliente_id)}
                  onGuardar={guardar}
                  onCancelar={p => { setCancelando(p); setMotivo('') }}
                  onDescartar={descartarComprobante}
                  roster={roster}
                  comprobantes={bandeja.filter(b => b.cliente_sugerido?.id === r.cliente_id)} />
              ))}
            </div>
          </div>

          {/* ── Bandeja de comprobantes ──────────────────────────────── */}
          <div style={{ ...card, padding: 16, position: 'sticky', top: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 700 }}>Comprobantes de WhatsApp</div>
              {bandeja.length > 0 && (
                <span style={{ background: 'rgba(193,85,58,0.2)', color: 'var(--marca-t)', fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20 }}>
                  {bandeja.length}
                </span>
              )}
            </div>
            <div style={{ color: tenue, fontSize: 11, marginBottom: 11, lineHeight: 1.45 }}>
              Sin aplicar, ordenados por urgencia. Al aceptarlos se crea el anticipo aquí.
            </div>

            <input
              value={busquedaBandeja}
              onChange={e => setBusquedaBandeja(e.target.value)}
              placeholder="Buscar transferencia por nombre o teléfono…"
              style={{ ...input, width: '100%', marginBottom: 8, fontSize: 12 }}
            />

            {/* Filtros: con 119 sin aplicar, poder aislar los 22 que urgen es
                la diferencia entre una lista que se usa y una que se abandona. */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
              {[
                ['todos', 'Todos', bandeja.length, 'var(--w50)'],
                ['huerfanos', 'Sin pago', c?.huerfanos || 0, 'var(--rojo-t)'],
                ['entrega', 'De esta entrega', c?.comprobantes_de_esta_entrega || 0, ESTADO.liquidado.tono],
              ].map(([v, t, n, tono]) => {
                const on = filtroBandeja === v
                return (
                  <button key={v} onClick={() => setFiltroBandeja(v)} disabled={n === 0 && v !== 'todos'}
                    style={{
                      flex: 1, padding: '7px 6px', borderRadius: 8, fontSize: 10.5, cursor: n === 0 && v !== 'todos' ? 'default' : 'pointer',
                      border: `1px solid ${on ? 'var(--w22)' : 'var(--w07)'}`,
                      background: on ? 'var(--w07)' : 'transparent',
                      color: on ? 'var(--tinta)' : 'var(--w40)', fontWeight: on ? 700 : 500,
                      opacity: n === 0 && v !== 'todos' ? 0.35 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}>
                    {t}
                    <span style={{ color: tono, fontWeight: 800 }}>{n}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 4, marginRight: -4 }}>
              {bandejaVisible.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--w25)', fontSize: 12 }}>
                  {bandeja.length === 0 ? 'Todo aplicado ✓'
                    : busquedaBandeja.trim() ? `Ninguna transferencia coincide con “${busquedaBandeja.trim()}”`
                    : 'Nada con este filtro'}
                </div>
              )}
              {bandejaVisible.map(b => (
                <Comprobante key={b.id} b={b} entregaId={entregaId} roster={roster}
                  onGuardar={guardar} onDescartar={() => descartarComprobante(b.id)} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {confirmando && (
        <Modal titulo="⚠️ Posible duplicado" onCerrar={() => setConfirmando(null)}>
          <div style={{ color: 'var(--w70)', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>{confirmando.mensaje}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmando(null)} style={{ flex: 1, ...input, cursor: 'pointer', textAlign: 'center', color: 'var(--w60)' }}>No, cancelar</button>
            <button onClick={() => guardar(confirmando.cuerpo, { confirmar: true })}
              style={{ flex: 1, background: MARCA, border: 'none', borderRadius: 9, padding: '10px', color: 'var(--tinta)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Sí, son dos abonos
            </button>
          </div>
        </Modal>
      )}

      {cancelando && (
        <Modal titulo="Cancelar anticipo" onCerrar={() => setCancelando(null)}>
          <div style={{ color: 'var(--w60)', fontSize: 13, marginBottom: 13, lineHeight: 1.5 }}>
            {fmt(cancelando.monto)} · {cancelando.metodo}. No se borra: queda en la bitácora con tu motivo.
          </div>
          <input autoFocus placeholder="Motivo (ej. capturado dos veces)" value={motivo}
            onChange={e => setMotivo(e.target.value)} style={{ ...input, width: '100%', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setCancelando(null)} style={{ flex: 1, ...input, cursor: 'pointer', textAlign: 'center', color: 'var(--w60)' }}>Volver</button>
            <button onClick={cancelar} disabled={!motivo.trim()}
              style={{ flex: 1, background: motivo.trim() ? 'var(--rojo)' : 'var(--w06)', border: 'none', borderRadius: 9, padding: '10px', color: 'var(--tinta)', fontSize: 13, fontWeight: 700, cursor: motivo.trim() ? 'pointer' : 'not-allowed' }}>
              Cancelar anticipo
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══ Piezas ═══════════════════════════════════════════════════════════════

function Cifra({ etiqueta, valor, tono }) {
  return (
    <div>
      <div style={{ color: 'var(--w34)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>{etiqueta}</div>
      <div className="cifra-valor" style={{ color: tono || 'var(--tinta)', fontSize: 22, fontWeight: 800, marginTop: 5, letterSpacing: -0.6 }}>{valor}</div>
    </div>
  )
}

// Cuánto del dinero de esta entrega ya entró. Una barra, dos segmentos con
// separador de 2px, cada uno con su etiqueta y su cifra abajo.
function BarraDinero({ cobrado, porCobrar }) {
  const total = Math.max(cobrado + porCobrar, 0.01)
  const pct = Math.max(0, Math.min(100, (cobrado / total) * 100))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <span style={{ color: 'var(--w55)', fontSize: 11.5, fontWeight: 600 }}>Dinero de la entrega</span>
        <span style={{ color: ESTADO.liquidado.tono, fontSize: 12, fontWeight: 800 }}>{pct.toFixed(1)}% cobrado</span>
      </div>
      <div style={{ display: 'flex', gap: 2, height: 12 }}>
        <div style={{ width: `${pct}%`, background: ESTADO.liquidado.tono, borderRadius: '6px 2px 2px 6px', minWidth: pct > 0 ? 4 : 0, transition: 'width .35s' }} />
        <div style={{ flex: 1, background: 'rgba(234,179,8,0.35)', borderRadius: '2px 6px 6px 2px' }} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
        <Leyenda tono={ESTADO.liquidado.tono} texto="Cobrado" valor={fmtCorto(cobrado)} />
        <Leyenda tono="rgba(234,179,8,0.55)" texto="Por cobrar" valor={fmtCorto(porCobrar)} />
      </div>
    </div>
  )
}

// Cómo va la captura, por persona. Cada segmento y cada leyenda filtran la
// lista al hacer clic — el gráfico no solo informa, también navega.
function BarraEstados({ conteos, total, filtro, onFiltrar }) {
  const t = Math.max(total, 1)
  const segs = [
    ['liquidado', conteos.liquidado],
    ['parcial', conteos.parcial],
    ['sin_anticipo', conteos.sin_anticipo],
  ].filter(([, n]) => n > 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <span style={{ color: 'var(--w55)', fontSize: 11.5, fontWeight: 600 }}>Avance de captura</span>
        <span style={{ color: 'var(--w40)', fontSize: 11.5 }}>{conteos.liquidado} de {total} listos</span>
      </div>
      <div style={{ display: 'flex', gap: 2, height: 12 }}>
        {segs.length === 0 && <div style={{ flex: 1, background: 'var(--w05)', borderRadius: 6 }} />}
        {segs.map(([k, n], i) => (
          <div key={k} onClick={() => onFiltrar(filtro === k ? 'todos' : k)} title={`${ESTADO[k].et}: ${n}`}
            style={{
              width: `${(n / t) * 100}%`, background: ESTADO[k].tono, cursor: 'pointer',
              borderTopLeftRadius: i === 0 ? 6 : 2, borderBottomLeftRadius: i === 0 ? 6 : 2,
              borderTopRightRadius: i === segs.length - 1 ? 6 : 2, borderBottomRightRadius: i === segs.length - 1 ? 6 : 2,
              opacity: filtro === 'todos' || filtro === k ? 1 : 0.35, transition: 'opacity .15s',
            }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        {['liquidado','parcial','sin_anticipo'].map(k => (
          <div key={k} onClick={() => onFiltrar(filtro === k ? 'todos' : k)} style={{ cursor: 'pointer' }}>
            <Leyenda tono={ESTADO[k].tono} texto={ESTADO[k].et} valor={conteos[k]} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Leyenda({ tono, texto, valor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: tono, flexShrink: 0 }} />
      <span style={{ color: 'var(--w42)', fontSize: 11 }}>{texto}</span>
      <span style={{ color: 'var(--w80)', fontSize: 11.5, fontWeight: 700 }}>{valor}</span>
    </div>
  )
}

function Modal({ titulo, children, onCerrar }) {
  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, background: 'var(--sup-modal)', padding: 22, width: '100%', maxWidth: 430, boxShadow: 'var(--sombra)' }}>
        <div style={{ color: 'var(--tinta)', fontSize: 15, fontWeight: 700, marginBottom: 13 }}>{titulo}</div>
        {children}
      </div>
    </div>
  )
}

// Renglón de una persona. Cerrado es un resumen con su barra de avance;
// abierto es el capturador, con el saldo ya escrito.
function Renglon({ r, entregaId, abierto, onAbrir, onGuardar, onCancelar, onDescartar, roster, comprobantes }) {
  const est = ESTADO[r.estado]
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Transferencia')
  const [fecha, setFecha] = useState(hoyISO())
  const [guardando, setGuardando] = useState(false)
  const ref = useRef(null)

  // Arranca vacío a propósito: lo normal es teclear una cantidad distinta al
  // saldo. Para el caso de liquidar completo está el botón verde, que no pide
  // teclear nada.
  useEffect(() => { if (abierto) { setMonto(''); setTimeout(() => ref.current?.focus(), 50) } }, [abierto])

  const registrar = async (importe) => {
    const valor = Number(importe ?? monto)
    if (!valor || valor <= 0) return
    setGuardando(true)
    const ok = await onGuardar({
      cliente_id: r.cliente_id, entrega_id: entregaId, monto: valor, metodo,
      creado_en: `${fecha}T${new Date().toLocaleTimeString('es-MX', { hour12: false })}.000Z`,
    })
    setGuardando(false)
    if (ok) setMonto('')
  }

  const pct = r.total > 0 ? Math.max(0, Math.min(100, (r.pagado / r.total) * 100)) : 0

  return (
    <div style={{
      ...card,
      borderColor: abierto ? 'rgba(193,85,58,0.45)' : 'var(--w06)',
      background: abierto ? 'var(--sup-activa)' : 'var(--sup)',
      overflow: 'hidden', transition: 'border-color .15s',
    }} className="fila">
      <div onClick={onAbrir} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', cursor: 'pointer' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: est.suave, border: `1px solid ${est.borde}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: est.tinta, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.3,
        }}>{iniciales(r.nombre)}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</span>
            {comprobantes.length > 0 && (
              <span style={{ background: 'rgba(193,85,58,0.22)', color: 'var(--marca-t)', fontSize: 9, padding: '2px 6px', borderRadius: 5, fontWeight: 800, flexShrink: 0 }}>
                {comprobantes.length} comprobante{comprobantes.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ color: 'var(--w30)', fontSize: 11, marginTop: 3 }}>
            {r.articulos} artículo{r.articulos !== 1 ? 's' : ''} · {fmt(r.total)} · abonado {fmt(r.pagado)}
            {r.entregado_en && (
              <span style={{ color: 'var(--verde)', fontWeight: 600 }}> · recogió {fechaCorta(r.entregado_en)}</span>
            )}
          </div>
          <div style={{ height: 3, background: 'var(--w06)', borderRadius: 2, marginTop: 7, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: est.tono, borderRadius: 2, transition: 'width .3s' }} />
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="monto" style={{ color: est.tinta, fontSize: 16.5, fontWeight: 800, letterSpacing: -0.3 }}>{fmt(Math.abs(r.saldo))}</div>
          <div style={{ color: est.tinta, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.75, fontWeight: 700, marginTop: 1 }}>{est.et}</div>
        </div>
      </div>

      {abierto && (
        <div style={{ padding: '13px 15px 15px', borderTop: '1px solid var(--w06)', background: 'var(--hueco)' }}>
          {/* Dos renglones a propósito: arriba los datos, abajo las acciones.
              Antes se envolvían solos y el botón verde quedaba huérfano. */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 132 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: monto ? '#10b981' : 'var(--w30)', fontSize: 14, fontWeight: 700, pointerEvents: 'none' }}>$</span>
              <input ref={ref} type="number" placeholder="0.00" value={monto}
                onChange={e => setMonto(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && registrar()}
                style={{ ...input, width: '100%', paddingLeft: 24, fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
            </div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...input, width: 145 }} />
            <div style={{ display: 'flex', gap: 3, background: 'var(--w03)', padding: 3, borderRadius: 10 }}>
              {['Efectivo','Transferencia','Terminal'].map(m => (
                <button key={m} onClick={() => setMetodo(m)}
                  style={{ padding: '6px 11px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: 'none',
                    background: metodo === m ? 'rgba(193,85,58,0.28)' : 'transparent',
                    color: metodo === m ? 'var(--marca-t)' : 'var(--w40)',
                    fontWeight: metodo === m ? 700 : 500 }}>{m}</button>
              ))}
            </div>
          </div>

          {/* Naranja = abonar lo que tecleaste. Verde = liquidar todo el saldo,
              sin teclear. Colores distintos para que no se confundan. */}
          <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
            <button className="btn btn-abono" onClick={() => registrar()} disabled={guardando || !Number(monto)}>
              {guardando ? '…' : (Number(monto) ? `Abonar ${fmt(monto)}` : 'Abonar')}
            </button>
            {r.saldo > 0 && (
              <button className="btn btn-liquidar" onClick={() => registrar(r.saldo)} disabled={guardando}>
                Liquidar todo · {fmt(r.saldo)}
              </button>
            )}
          </div>

          {/* Los comprobantes que apuntan a esta persona, con la MISMA tarjeta
              de la bandeja de la derecha: si vas a abonarle, lo primero que
              quieres ver es la transferencia que mandó. Antes aquí sólo decía
              "2 comprobantes" y había que ir a buscarlos a la otra columna.

              No hay que sincronizar nada entre las dos listas: aplicar o
              descartar recarga los datos de la pantalla, así que el
              comprobante desaparece de los dos lados solo. */}
          {comprobantes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                {comprobantes.length === 1
                  ? 'Transferencia que mandó'
                  : `${comprobantes.length} transferencias que mandó`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {comprobantes.map(b => (
                  <Comprobante key={b.id} b={b} entregaId={entregaId} roster={roster} dentroDeCliente
                    onGuardar={onGuardar} onDescartar={() => onDescartar(b.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Anticipos y cobro final van separados: al consultar una cuenta lo
              que se pregunta es "cuanto habia abonado" y "cuanto pago al
              recoger", y en una sola lista revuelta eso no se ve. */}
          {r.pagos.length > 0 && (
            <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { et: 'Anticipos', lista: r.pagos.filter(p => p.tipo === 'Anticipo'), suma: r.anticipos },
                { et: 'Cobro final al recoger', lista: r.pagos.filter(p => p.tipo !== 'Anticipo'), suma: r.cobro_final },
              ].filter(g => g.lista.length > 0).map(g => (
                <div key={g.et}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ color: 'var(--w28)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: 600 }}>{g.et}</span>
                    <span className="monto" style={{ color: 'var(--w33)', fontSize: 11, fontWeight: 700 }}>{fmt(g.suma)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {g.lista.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--w03)', border: '1px solid var(--w04)', borderRadius: 9, padding: '8px 11px' }}>
                        <span className="monto" style={{ color: ESTADO.liquidado.tono, fontSize: 12.5, fontWeight: 800, width: 82 }}>{fmt(p.monto)}</span>
                        <span style={{ color: 'var(--w33)', fontSize: 11, flex: 1 }}>
                          {fechaCorta(p.creado_en)} · {p.metodo}{p.pendiente_id ? ' · desde comprobante' : ''}
                        </span>
                        <button className="btn btn-cancelar" onClick={() => onCancelar(p)}>Cancelar</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {r.entregado_en && (
                <div style={{ color: 'var(--w28)', fontSize: 10.5 }}>
                  Mercancía entregada el <span style={{ color: 'var(--verde)', fontWeight: 700 }}>{fechaCorta(r.entregado_en)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Tarjeta de comprobante. Un clic hace las dos cosas que antes eran dos:
// crear el pago y cerrar el comprobante. El botón verde abre la conversación
// de WhatsApp de donde salió, para verificarlo contra lo que escribió.
// `dentroDeCliente` es true cuando la tarjeta se pinta DENTRO del renglón de
// una persona. Ahí el selector de "aplicar a" sobra —ya sabemos de quién es—
// y además es peligroso: desde el renglón de Abigail se podría aplicar la
// transferencia a otra persona sin darse cuenta.
function Comprobante({ b, entregaId, roster, onGuardar, onDescartar, dentroDeCliente = false }) {
  const [monto, setMonto] = useState(b.monto ? String(b.monto) : '')
  const [cliente, setCliente] = useState(b.cliente_sugerido?.id || '')
  const [guardando, setGuardando] = useState(false)

  const aplicar = async () => {
    if (!cliente || !Number(monto)) return
    setGuardando(true)
    await onGuardar({
      cliente_id: cliente, entrega_id: entregaId, monto: Number(monto),
      metodo: 'Transferencia', pendiente_id: b.id, creado_en: b.creado_en,
    })
    setGuardando(false)
  }

  const wa = b.telefono_whatsapp ? `https://wa.me/${paraWaMe(b.telefono_whatsapp)}` : null
  const alerta = b.huerfano_resuelto
  const listo = !!cliente && !!Number(monto)
  const borde = alerta ? 'rgba(var(--rojo-rgb),0.4)' : b.posible_duplicado ? 'rgba(234,179,8,0.4)' : 'var(--w07)'

  return (
    // flexShrink:0 es obligatorio: la bandeja es un contenedor flex con altura
    // maxima, y sin esto cada tarjeta se comprime y se le corta el contenido.
    <div className="tarjeta" style={{ ...card, padding: 0, borderColor: borde, overflow: 'hidden', flexShrink: 0 }}>
      {(alerta || b.posible_duplicado) && (
        <div style={{
          padding: '7px 12px', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, lineHeight: 1.3,
          background: alerta ? 'rgba(var(--rojo-rgb),0.12)' : 'rgba(234,179,8,0.12)',
          color: alerta ? 'var(--rojo-t)' : '#eab308',
        }}>
          {alerta ? '⚠ ATENDIDO SIN PAGO REGISTRADO' : '⚠ YA HAY UN PAGO IGUAL EN ESTOS DÍAS'}
        </div>
      )}

      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 11 }}>
          {b.imagen_url && (
            <a href={b.imagen_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }} title="Ver el comprobante completo">
              <img src={b.imagen_url} alt="comprobante"
                style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--w10)', display: 'block' }} />
            </a>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {b.cliente_sugerido?.nombre || b.nombre_whatsapp || 'Desconocido'}
              </span>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" title="Abrir la conversación de WhatsApp"
                  style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.35)',
                    borderRadius: 6, padding: '2px 7px', color: 'var(--wa)', fontSize: 10,
                    fontWeight: 700, textDecoration: 'none',
                  }}>
                  <IconoWhatsApp /> Chat
                </a>
              )}
            </div>
            <div style={{ color: 'var(--w32)', fontSize: 10.5, marginTop: 3, lineHeight: 1.45 }}>
              {fechaCorta(b.creado_en)} · {b.resumen?.slice(0, 74)}
            </div>
            {b.en_esta_entrega && b.saldo_en_esta_entrega != null && (
              <div style={{ color: ESTADO.liquidado.tono, fontSize: 10.5, marginTop: 4, fontWeight: 600 }}>
                Debe {fmt(b.saldo_en_esta_entrega)} en esta entrega
              </div>
            )}
            {!b.cliente_sugerido && (
              <div style={{ color: ESTADO.parcial.tono, fontSize: 10.5, marginTop: 4 }}>Sin cliente ligado — elígelo abajo</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
          <div style={{ width: 96, flexShrink: 0 }}>
            <Micro>Monto</Micro>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)}
              style={{ ...input, width: '100%', height: 33, fontSize: 12.5, fontWeight: 700, padding: '0 9px' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Micro>Aplicar a</Micro>
            {dentroDeCliente ? (
              <div style={{ ...input, height: 33, fontSize: 11.5, padding: '0 9px', display: 'flex', alignItems: 'center',
                            color: 'var(--w60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.cliente_sugerido?.nombre || 'esta persona'}
              </div>
            ) : (
              <select value={cliente} onChange={e => setCliente(e.target.value)}
                style={{ ...input, width: '100%', maxWidth: '100%', height: 33, fontSize: 11.5, padding: '0 7px' }}>
                <option value="">-- elige cliente --</option>
                {roster.map(r => <option key={r.cliente_id} value={r.cliente_id}>{r.nombre}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-aplicar" onClick={aplicar} disabled={guardando || !listo} style={{ flex: 1 }}>
            {guardando ? '…' : 'Aplicar a esta entrega'}
          </button>
          <button className="btn btn-neutro" onClick={onDescartar} title="La IA no debió generar esto">No era</button>
        </div>
      </div>
    </div>
  )
}

function IconoWhatsApp() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2z"/>
    </svg>
  )
}


function Micro({ children }) {
  return (
    <div style={{ color: 'var(--w30)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 3 }}>
      {children}
    </div>
  )
}
