'use client'
import { useState, useEffect, useMemo } from 'react'

// ---------------------------------------------------------------------------
// Cobranza — quién tiene mercancía en tienda sin pagar.
//
// Organizada por CLIENTE (Anticipos va por estado de cuenta). Junta todas
// sus entregas pasadas con saldo; la entrega futura no cuenta. El cálculo y
// las reglas de qué aviso le toca a cada quien viven en lib/cobranza/calcular.js.
//
// Solo admin. Cinco herramientas:
//  1. Pausar recordatorios (el cliente avisó que no puede venir).
//  2. Promesa de pago ("paso el viernes"); si no cumple, se marca.
//  3. Ver si contestó después del último recordatorio.
//  4. Recordar a todos los del filtro con una sola confirmación.
//  5. Fuera del horario de tienda no sale nada.
// ---------------------------------------------------------------------------

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
const fechaCorta = (f) => { if (!f) return ''; const d = new Date(String(f).slice(0, 10) + 'T12:00:00'); return `${d.getDate()} ${MESES[d.getMonth()]}` }
const horaCorta = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })
const hace = (f, hoy) => {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date(f))
  if (dia === hoy) return `hoy ${horaCorta(f)}`
  const dias = Math.round((new Date(hoy + 'T12:00:00') - new Date(dia + 'T12:00:00')) / 86400000)
  return dias === 1 ? `ayer ${horaCorta(f)}` : `${fechaCorta(dia)}`
}
const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const card = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
const input = { background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 9, padding: '8px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const tenue = 'var(--w38)'

const TONO = {
  rojo:  { c: 'var(--rojo-t)', bg: 'rgba(var(--rojo-rgb),0.10)', b: 'rgba(var(--rojo-rgb),0.28)' },
  ambar: { c: 'var(--ambar-t)', bg: 'var(--ambar-suave)', b: 'var(--ambar-borde)' },
  verde: { c: 'var(--verde-t)', bg: 'var(--verde-suave)', b: 'var(--verde-borde)' },
  azul:  { c: 'var(--azul-t)', bg: 'var(--azul-suave)', b: 'var(--azul-borde)' },
  gris:  { c: 'var(--gris-t)', bg: 'var(--gris-suave)', b: 'var(--gris-borde)' },
}

function estadoAviso(c) {
  const d = c.diasAviso
  if (c.aviso === 'vencido') return { tono: 'rojo', texto: d === -1 ? 'Venció ayer' : `Vencido hace ${Math.abs(d)} días` }
  if (d == null) return { tono: 'gris', texto: 'Sin fecha límite' }
  if (d === 0) return { tono: 'ambar', texto: 'Vence hoy' }
  if (d === 1) return { tono: 'ambar', texto: 'Vence mañana' }
  if (d <= 2) return { tono: 'ambar', texto: `Vence en ${d} días` }
  return { tono: 'verde', texto: `En plazo · ${d} días` }
}

// ¿Se le puede mandar recordatorio ahora? Devuelve null si sí, o el motivo.
function motivoNoEnviar(c) {
  if (c.pausa) return `En pausa hasta el ${fechaCorta(c.pausa.hasta)}`
  if (c.recordatorios.enviadoHoy) return 'Enviado hoy'
  if (!c.telefono) return 'Sin teléfono'
  if (!c.fechaAviso) return 'Sin fecha límite'
  return null
}

function Pastilla({ tono, children }) {
  const t = TONO[tono]
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 7, color: t.c, background: t.bg, border: `1px solid ${t.b}`, whiteSpace: 'nowrap' }}>{children}</span>
}

function Cifra({ etiqueta, valor, tono }) {
  return (
    <div>
      <div style={{ color: tenue, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{etiqueta}</div>
      <div className="cifra-valor" style={{ color: tono || 'var(--tinta)', fontSize: 22, fontWeight: 800, marginTop: 4, letterSpacing: -0.4 }}>{valor}</div>
    </div>
  )
}

export default function Cobranza() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState(null)
  const [confirmar, setConfirmar] = useState(null)   // { clientes: [...] }
  const [enviando, setEnviando] = useState(null)     // { hechos, total, fallas: [] }
  const [editando, setEditando] = useState(null)     // { clienteId, tipo: 'pausar'|'promesa', fecha, nota }

  const notificar = (tipo, texto) => { setAviso({ tipo, texto }); setTimeout(() => setAviso(null), 6000) }

  const cargar = async () => {
    try {
      const r = await fetch('/api/cobranza', { cache: 'no-store' }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje || 'No se pudo cargar')
      setDatos(r); setError(null)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])

  const clientes = useMemo(() => datos?.clientes || [], [datos])
  const conteo = useMemo(() => ({
    todos: clientes.length,
    por_vencer: clientes.filter(c => !c.pausa && c.aviso === 'por_vencer').length,
    vencido: clientes.filter(c => !c.pausa && c.aviso === 'vencido').length,
    promesas: clientes.filter(c => c.promesa).length,
    incumplidas: clientes.filter(c => c.promesa?.incumplida).length,
    respondieron: clientes.filter(c => c.respondioEn).length,
    pausa: clientes.filter(c => c.pausa).length,
  }), [clientes])
  const saldoTotal = clientes.reduce((s, c) => s + c.saldo, 0)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter(c => {
      if (q && !c.nombre.toLowerCase().includes(q)) return false
      if (filtro === 'por_vencer') return !c.pausa && c.aviso === 'por_vencer'
      if (filtro === 'vencido') return !c.pausa && c.aviso === 'vencido'
      if (filtro === 'promesas') return !!c.promesa
      if (filtro === 'respondieron') return !!c.respondioEn
      if (filtro === 'pausa') return !!c.pausa
      return true
    })
  }, [clientes, filtro, busqueda])
  const enviables = visibles.filter(c => !motivoNoEnviar(c))

  const mandar = async (lista) => {
    setConfirmar(null)
    setEnviando({ hechos: 0, total: lista.length, fallas: [] })
    const fallas = []
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i]
      try {
        const r = await fetch('/api/cobranza/recordar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: c.clienteId }),
        }).then(r => r.json())
        if (!r.ok) fallas.push(`${c.nombre}: ${r.mensaje}`)
      } catch (e) { fallas.push(`${c.nombre}: ${e.message}`) }
      setEnviando({ hechos: i + 1, total: lista.length, fallas: [...fallas] })
    }
    await cargar()
    setEnviando(null)
    const bien = lista.length - fallas.length
    if (fallas.length === 0) notificar('ok', bien === 1 ? `Recordatorio enviado a ${lista[0].nombre}` : `${bien} recordatorios enviados`)
    else notificar('error', `${bien} enviados, ${fallas.length} con error — ${fallas.join(' · ')}`)
  }

  const guardarSeguimiento = async (body) => {
    const r = await fetch('/api/cobranza/seguimiento', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(e => ({ ok: false, mensaje: e.message }))
    if (!r.ok) { notificar('error', r.mensaje || 'No se pudo guardar'); return false }
    await cargar()
    return true
  }

  const FILTROS = [
    ['todos', `Todos (${conteo.todos})`],
    ['vencido', `Vencidos (${conteo.vencido})`],
    ['por_vencer', `Por vencer (${conteo.por_vencer})`],
    ['promesas', `Promesas (${conteo.promesas})`],
    ['respondieron', `Respondieron (${conteo.respondieron})`],
    ['pausa', `En pausa (${conteo.pausa})`],
  ]

  return (
    <div className="cobranza" style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <style>{`
        .cifra-valor, .monto { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
        .cifras { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; }
        .cifras > div { padding: 16px 18px; border-right: 1px solid var(--w05); }
        .cifras > div:last-child { border-right: none; }
        @media (max-width: 900px) { .cifras { grid-template-columns: repeat(2, 1fr); } .cifras > div { border-bottom: 1px solid var(--w05); } }
        .btn { border-radius: 9px; padding: 9px 15px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: filter .15s, background .15s; }
        .btn:hover:not(:disabled) { filter: brightness(1.12); }
        .btn:disabled { opacity: .45; cursor: not-allowed; }
        .btn-wa { background: #c1553a; color: #fff; }
        .btn-neutro { background: transparent; border-color: var(--w13); color: var(--w55); }
        .btn-neutro:hover { background: var(--w05); }
        .link { background: none; border: none; padding: 0; color: var(--w45); font-size: 11.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
        .link:hover { color: var(--tinta); }
        .cobranza input:focus { border-color: rgba(193,85,58,0.65) !important; box-shadow: 0 0 0 3px rgba(193,85,58,0.13); }
        .fila:hover { border-color: var(--w14) !important; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* ── Encabezado ── */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Cobranza</div>
            <div style={{ color: tenue, fontSize: 13, marginTop: 3 }}>
              Clientes con saldo en entregas que ya están en tienda · la entrega futura no cuenta
            </div>
          </div>
          <button className="btn btn-neutro" onClick={cargar}>↻ Actualizar</button>
        </div>

        {datos && !datos.dentroHorario && (
          <div style={{ ...card, padding: '11px 15px', marginBottom: 14, fontSize: 13, color: 'var(--ambar-t)', background: 'var(--ambar-suave)', borderColor: 'var(--ambar-borde)' }}>
            🕘 Fuera del horario de tienda: los recordatorios solo salen {datos.horario}.
          </div>
        )}

        {aviso && (
          <div style={{ ...card, padding: '11px 15px', marginBottom: 14, fontSize: 13, lineHeight: 1.5,
            color: aviso.tipo === 'error' ? 'var(--rojo-t)' : 'var(--verde-t)',
            background: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.08)' : 'var(--verde-suave)',
            borderColor: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.3)' : 'var(--verde-borde)' }}>
            {aviso.texto}
          </div>
        )}

        {error && <div style={{ ...card, padding: 24, color: 'var(--rojo-t)', fontSize: 13 }}>{error}</div>}
        {!datos && !error && <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>Cargando…</div>}

        {datos && (
          <>
            {/* ── Cifras ── */}
            <div className="cifras" style={{ ...card, padding: 0, marginBottom: 16, overflow: 'hidden' }}>
              <Cifra etiqueta="Por cobrar" valor={`${conteo.todos} clientes`} />
              <Cifra etiqueta="Saldo pendiente" valor={fmt(saldoTotal)} tono="var(--marca-t)" />
              <Cifra etiqueta="Vencidos" valor={conteo.vencido} tono={conteo.vencido ? 'var(--rojo-t)' : undefined} />
              <Cifra etiqueta="Por vencer" valor={conteo.por_vencer} tono={conteo.por_vencer ? 'var(--ambar-t)' : undefined} />
              <Cifra etiqueta="Promesas incumplidas" valor={conteo.incumplidas} tono={conteo.incumplidas ? 'var(--rojo-t)' : undefined} />
            </div>

            {/* ── Filtros, búsqueda y envío por lote ── */}
            <div style={{ display: 'flex', gap: 7, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {FILTROS.map(([v, t]) => (
                <button key={v} onClick={() => setFiltro(v)}
                  style={{ padding: '8px 12px', borderRadius: 9, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${filtro === v ? 'rgba(193,85,58,0.5)' : 'var(--w09)'}`,
                    background: filtro === v ? 'rgba(193,85,58,0.16)' : 'var(--w025)',
                    color: filtro === v ? 'var(--marca-t)' : 'var(--w45)', fontWeight: filtro === v ? 700 : 500 }}>{t}</button>
              ))}
              <input placeholder="Buscar por nombre…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                style={{ ...input, flex: 1, minWidth: 160 }} />
              <button className="btn btn-wa" disabled={!datos.dentroHorario || enviables.length === 0 || !!enviando}
                onClick={() => setConfirmar({ clientes: enviables })}
                title={!datos.dentroHorario ? 'Fuera de horario' : enviables.length === 0 ? 'No hay a quién mandar en este filtro' : ''}>
                Recordar a {enviables.length}
              </button>
            </div>

            {enviando && (
              <div style={{ ...card, padding: '12px 15px', marginBottom: 12, fontSize: 13 }}>
                Mandando recordatorios… {enviando.hechos} de {enviando.total}
                <div style={{ height: 6, background: 'var(--w06)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(enviando.hechos / enviando.total) * 100}%`, height: '100%', background: 'var(--marca)', transition: 'width .3s' }} />
                </div>
              </div>
            )}

            {/* ── Lista ── */}
            {visibles.length === 0 && (
              <div style={{ ...card, padding: 44, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>
                {clientes.length === 0 ? 'Nadie debe en entregas pasadas. Todo cobrado.' : 'Nadie coincide con este filtro'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibles.map(c => {
                const est = estadoAviso(c)
                const motivo = motivoNoEnviar(c)
                const editandoEste = editando?.clienteId === c.clienteId
                return (
                  <div key={c.clienteId} className="fila" style={{ ...card, padding: 0, overflow: 'hidden', opacity: c.pausa ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--tinta)', fontWeight: 700, fontSize: 15 }}>{c.nombre}</span>
                          {c.pausa ? <Pastilla tono="gris">⏸ En pausa hasta {fechaCorta(c.pausa.hasta)}</Pastilla> : <Pastilla tono={est.tono}>{est.texto}</Pastilla>}
                          {c.promesa && (c.promesa.incumplida
                            ? <Pastilla tono="rojo">Promesa incumplida · {fechaCorta(c.promesa.fecha)}</Pastilla>
                            : <Pastilla tono="azul">Prometió pasar el {fechaCorta(c.promesa.fecha)}</Pastilla>)}
                          {c.respondioEn && <Pastilla tono="verde">💬 Respondió {hace(c.respondioEn, datos.hoy)}</Pastilla>}
                        </div>
                        <div style={{ color: 'var(--w50)', fontSize: 12.5, marginTop: 4 }}>
                          {c.grupos.length} {c.grupos.length === 1 ? 'entrega' : 'entregas'} · {c.pedidosEnTienda} {c.pedidosEnTienda === 1 ? 'pedido' : 'pedidos'} en tienda
                          {c.aviso === 'por_vencer' && c.entregasVencidas > 0 && <> · <span style={{ color: 'var(--rojo-t)' }}>{c.entregasVencidas} ya vencida{c.entregasVencidas > 1 ? 's' : ''}</span></>}
                          {!c.telefono && <> · <span style={{ color: 'var(--rojo-t)' }}>sin teléfono</span></>}
                        </div>
                        <div style={{ color: c.recordatorios.enviadoHoy ? 'var(--verde-t)' : tenue, fontSize: 11.5, marginTop: 3 }}>
                          {c.recordatorios.total === 0
                            ? 'Sin recordatorios'
                            : <>{c.recordatorios.enviadoHoy ? '✓ ' : ''}Último recordatorio: {hace(c.recordatorios.ultimoEn, datos.hoy)}{c.recordatorios.ultimoPor ? ` por ${c.recordatorios.ultimoPor}` : ''}{c.recordatorios.total > 1 ? ` · ${c.recordatorios.total} en total` : ''}</>}
                          {(c.pausa?.nota || c.promesa?.nota) && <span style={{ color: 'var(--w45)' }}> · “{c.pausa?.nota || c.promesa?.nota}”</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                          {c.pausa
                            ? <button className="link" onClick={() => guardarSeguimiento({ cliente_id: c.clienteId, accion: 'quitar_pausa' })}>Quitar pausa</button>
                            : <button className="link" onClick={() => setEditando({ clienteId: c.clienteId, tipo: 'pausar', fecha: sumarDias(datos.hoy, 7), nota: '' })}>Pausar</button>}
                          {c.promesa
                            ? <button className="link" onClick={() => guardarSeguimiento({ cliente_id: c.clienteId, accion: 'quitar_promesa' })}>Quitar promesa</button>
                            : <button className="link" onClick={() => setEditando({ clienteId: c.clienteId, tipo: 'promesa', fecha: sumarDias(datos.hoy, 1), nota: '' })}>Anotar promesa</button>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ color: tenue, fontSize: 11.5 }}>Saldo</div>
                        <div className="monto" style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 18 }}>{fmt(c.saldo)}</div>
                      </div>
                      <div style={{ minWidth: 170, textAlign: 'center' }}>
                        {motivo
                          ? <span style={{ color: tenue, fontSize: 12 }}>{motivo === 'Enviado hoy' ? '✓ Enviado hoy' : motivo}</span>
                          : <button className="btn btn-wa" style={{ width: '100%' }} disabled={!datos.dentroHorario || !!enviando}
                              onClick={() => setConfirmar({ clientes: [c] })}>
                              Recordar · {c.aviso === 'vencido' ? 'vencido' : 'por vencer'}
                            </button>}
                      </div>
                    </div>

                    {editandoEste && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', borderTop: '1px solid var(--w06)', background: 'var(--w02)' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--w60)', fontWeight: 600 }}>
                          {editando.tipo === 'pausar' ? 'No recordar hasta el' : 'Prometió pasar el'}
                        </span>
                        <input type="date" value={editando.fecha} min={datos.hoy} onChange={e => setEditando({ ...editando, fecha: e.target.value })} style={input} />
                        <input placeholder={editando.tipo === 'pausar' ? 'Fuera de la ciudad, pasa su hermana…' : 'Dijo que pasa en la tarde…'}
                          value={editando.nota} onChange={e => setEditando({ ...editando, nota: e.target.value })} style={{ ...input, flex: 1, minWidth: 200 }} />
                        <button className="btn btn-wa" onClick={async () => {
                          if (await guardarSeguimiento({ cliente_id: c.clienteId, accion: editando.tipo, fecha: editando.fecha, nota: editando.nota })) setEditando(null)
                        }}>Guardar</button>
                        <button className="btn btn-neutro" onClick={() => setEditando(null)}>Cancelar</button>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--w06)', background: 'var(--w02)', padding: '6px 16px 8px' }}>
                      {c.grupos.map(g => (
                        <div key={g.entregaId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, padding: '4px 0', color: 'var(--w60)' }}>
                          <span>Entrega {fechaCorta(g.fechaEntrega)} · límite {fechaCorta(g.fechaLimite)}{g.limiteEstimado ? ' (estimada)' : ''} · {g.pedidosEnTienda} en tienda</span>
                          <span style={{ display: 'flex', gap: 14 }}>
                            <span style={{ color: g.vencida ? 'var(--rojo-t)' : g.diasRestantes <= 2 ? 'var(--ambar-t)' : 'var(--verde-t)', fontSize: 11.5, fontWeight: 600 }}>
                              {g.vencida ? 'Vencida' : g.diasRestantes === 0 ? 'Vence hoy' : g.diasRestantes === 1 ? 'Vence mañana' : 'En plazo'}
                            </span>
                            <span className="monto" style={{ color: 'var(--tinta)', fontWeight: 700, minWidth: 70, textAlign: 'right' }}>{fmt(g.saldo)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ color: tenue, fontSize: 11.5, marginTop: 12 }}>
              No aparecen: quien ya pagó todo aunque no haya recogido, y quien solo debe en la entrega futura.
            </div>
          </>
        )}
      </div>

      {/* ── Confirmación ── */}
      {confirmar && (() => {
        const lista = confirmar.clientes
        const uno = lista.length === 1 ? lista[0] : null
        const nVenc = lista.filter(c => c.aviso === 'vencido').length
        return (
          <div onClick={() => setConfirmar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, background: 'var(--sup-modal, var(--sup))', padding: 22, width: '100%', maxWidth: 420 }}>
              <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 17 }}>
                {uno ? 'Mandar recordatorio' : `Mandar ${lista.length} recordatorios`}
              </div>
              <div style={{ color: 'var(--w50)', fontSize: 13, marginTop: 4, marginBottom: 14 }}>
                {uno ? `A ${uno.nombre} por WhatsApp, desde el número del negocio.` : 'Por WhatsApp, desde el número del negocio. Uno por cliente.'}
              </div>
              <div style={{ background: 'var(--w03)', border: '1px solid var(--w06)', borderRadius: 10, padding: '10px 12px', fontSize: 13, display: 'grid', gap: 6 }}>
                {uno ? (
                  <>
                    <Linea k="Aviso" v={uno.aviso === 'vencido' ? 'Vencido (recordatorio_pedido_vencido)' : 'Por vencer (recordatorio_pedido_tienda)'} />
                    <Linea k="Saldo" v={fmt(uno.saldo)} />
                    <Linea k={uno.aviso === 'vencido' ? 'Venció el' : 'Recoger antes del'} v={fechaCorta(uno.fechaAviso)} />
                    <Linea k="Imagen" v="Estado de cuenta (solo entregas pasadas)" />
                  </>
                ) : (
                  <>
                    <Linea k="Aviso por vencer" v={`${lista.length - nVenc} clientes`} />
                    <Linea k="Aviso vencido" v={`${nVenc} clientes`} />
                    <Linea k="Saldo total" v={fmt(lista.reduce((s, c) => s + c.saldo, 0))} />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-neutro" onClick={() => setConfirmar(null)}>Cancelar</button>
                <button className="btn btn-wa" onClick={() => mandar(lista)}>Mandar</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Linea({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--w45)' }}>{k}</span>
      <span style={{ color: 'var(--tinta)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
