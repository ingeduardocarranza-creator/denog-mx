'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  TABLAS, OPERACIONES, DINERO, PERSONAS, OCULTOS,
  etiquetaCampo, etiquetaTabla,
} from '../../../lib/bitacora/etiquetas'

// Bitácora: qué cambió, cuándo, y cómo estaba antes.
//
// Desde el 9 de septiembre de 2026 cada renglón trae actor_nombre: quién
// estaba logueado en el POS cuando hizo el cambio, capturado por la propia
// base al momento de guardar. Para renglones de antes de esa fecha, o de
// rutas sin sesión de staff (el webhook de WhatsApp), no hay actor_nombre y
// el responsable se deduce del propio renglón (vendedor_id / colaborador_id /
// resuelto_por…) — por eso ese caso se dice en pantalla "según el registro",
// no "fue fulano".

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const haceDias = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const VISTAS = [
  { id: 'dinero',       label: 'Dinero',       tablas: ['pagos', 'pagos_cancelados', 'ventas_tienda'] },
  { id: 'caja',         label: 'Caja',         tablas: ['cortes_caja', 'retiros_caja'] },
  { id: 'comprobantes', label: 'Comprobantes', tablas: ['pendientes'] },
  { id: 'pedidos',      label: 'Pedidos',      tablas: ['pedidos'] },
]

export default function Bitacora() {
  const [desde, setDesde]         = useState(haceDias(6))
  const [hasta, setHasta]         = useState(hoyISO())
  const [vista, setVista]         = useState('')        // '' = todo
  const [operacion, setOperacion] = useState('')        // '' = todo
  const [buscar, setBuscar]       = useState('')
  const [pagina, setPagina]       = useState(0)
  const [movimientos, setMovs]    = useState([])
  const [nombres, setNombres]     = useState({})
  const [hayMas, setHayMas]       = useState(false)
  const [borrados, setBorrados]   = useState(0)
  const [cargando, setCargando]   = useState(true)
  const [abierto, setAbierto]     = useState(null)

  const cargar = useCallback(async (nuevaPagina) => {
    if (nuevaPagina === 0) setAbierto(null)
    setCargando(true)
    const tablas = VISTAS.find(v => v.id === vista)?.tablas.join(',') || ''
    const p = new URLSearchParams({ desde, hasta, pagina: String(nuevaPagina) })
    if (tablas) p.set('tablas', tablas)
    if (operacion) p.set('operacion', operacion)
    if (buscar.trim()) p.set('buscar', buscar.trim())

    const res = await fetch(`/api/bitacora?${p.toString()}`)
    const data = await res.json()
    setCargando(false)
    if (!data.ok) return
    setMovs(prev => (nuevaPagina === 0 ? data.movimientos : [...prev, ...data.movimientos]))
    setNombres(prev => ({ ...prev, ...data.nombres }))
    setHayMas(data.hayMas)
    setBorrados(data.borrados)
    setPagina(nuevaPagina)
  }, [desde, hasta, vista, operacion, buscar])

  useEffect(() => { cargar(0) }, [cargar])

  // ── Cómo se pinta un valor suelto ──────────────────────────────────────
  const valor = (campo, v) => {
    if (v === null || v === undefined || v === '') return { txt: 'vacío', vacio: true }
    if (DINERO.has(campo)) return { txt: dinero(v) }
    if (typeof v === 'boolean') return { txt: v ? 'Sí' : 'No' }
    if (PERSONAS.has(campo) && ES_UUID.test(String(v))) {
      return { txt: nombres[v] || 'alguien que ya no está en la lista' }
    }
    if (ES_UUID.test(String(v))) return { txt: `…${String(v).slice(-6)}`, tenue: true }
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(String(v))) {
      const d = new Date(String(v).replace(' ', 'T'))
      if (!isNaN(d)) return { txt: d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
    }
    return { txt: String(v) }
  }

  // Los campos que vale la pena leer de un renglón, en orden de importancia.
  const camposVisibles = (fila) => Object.keys(fila || {})
    .filter(k => !OCULTOS.has(k) && fila[k] !== null && fila[k] !== '')
    .sort((a, b) => (DINERO.has(b) ? 1 : 0) - (DINERO.has(a) ? 1 : 0))

  // ── El renglón de una línea ────────────────────────────────────────────
  const resumen = (m) => {
    if (m.operacion === 'UPDATE') {
      const cambios = (m.cambios || []).filter(c => !OCULTOS.has(c))
      if (!cambios.length) return 'Cambio sin detalle'
      return cambios.slice(0, 3).map(c =>
        `${etiquetaCampo(c)}: ${valor(c, m.antes?.[c]).txt} → ${valor(c, m.despues?.[c]).txt}`
      ).join('  ·  ') + (cambios.length > 3 ? `  ·  y ${cambios.length - 3} más` : '')
    }
    const fila = m.despues || m.antes || {}
    const partes = []
    if (fila.monto != null) partes.push(dinero(fila.monto))
    if (fila.precio_venta != null) partes.push(dinero(fila.precio_venta))
    if (fila.total_contado != null) partes.push(`contado ${dinero(fila.total_contado)}`)
    if (fila.tipo) partes.push(String(fila.tipo))
    if (fila.metodo) partes.push(String(fila.metodo))
    if (fila.estado) partes.push(String(fila.estado))
    if (fila.descripcion) partes.push(String(fila.descripcion).slice(0, 44))
    if (fila.nombre_producto) partes.push(String(fila.nombre_producto).slice(0, 44))
    if (fila.cliente_id && nombres[fila.cliente_id]) partes.push(nombres[fila.cliente_id])
    return partes.join('  ·  ') || 'Sin detalle'
  }

  // Quién. Primero el actor real de sesión (confiable); si el renglón es de
  // antes de que existiera esa columna, se deduce del propio renglón.
  const responsable = (m) => {
    if (m.actor_nombre) return { txt: m.actor_nombre, seguro: true }
    const fila = m.despues || m.antes || {}
    for (const c of ['cancelado_por', 'resuelto_por', 'descartado_por', 'vendedor_id', 'colaborador_id', 'admin_id']) {
      if (fila[c] && nombres[fila[c]]) return { txt: nombres[fila[c]], seguro: false }
    }
    return null
  }

  const tonoColor = { verde: 'var(--verde)', ambar: 'var(--ambar)', rojo: 'var(--rojo-t)' }

  const chip = (activo) => ({
    padding: '6px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${activo ? 'transparent' : 'var(--w12)'}`,
    background: activo ? 'var(--tinta)' : 'transparent',
    color: activo ? 'var(--fondo)' : 'var(--w55)',
    fontFamily: 'inherit',
  })
  const campoFecha = {
    background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8,
    padding: '6px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
  }
  const rotulo = { color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }

  const unSoloDia = desde === hasta

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Bitácora</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4, maxWidth: '62ch' }}>
            Cada cambio en el dinero, con cómo estaba antes y cómo quedó. Lo escribe la base de
            datos sola, así que no se le puede olvidar anotar ni se puede editar desde el sistema.
          </div>
        </div>

        {/* ── Filtros ────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, padding: '14px 16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...rotulo, marginRight: 4 }}>Periodo</span>
            <button onClick={() => { setDesde(hoyISO()); setHasta(hoyISO()) }} style={chip(desde === hoyISO() && hasta === hoyISO())}>Hoy</button>
            <button onClick={() => { setDesde(haceDias(6)); setHasta(hoyISO()) }} style={chip(desde === haceDias(6) && hasta === hoyISO())}>7 días</button>
            <button onClick={() => { setDesde(haceDias(29)); setHasta(hoyISO()) }} style={chip(desde === haceDias(29) && hasta === hoyISO())}>30 días</button>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={campoFecha} />
            <span style={{ color: 'var(--w30)', fontSize: 12 }}>a</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={campoFecha} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ ...rotulo, marginRight: 4 }}>Qué</span>
            <button onClick={() => setVista('')} style={chip(vista === '')}>Todo</button>
            {VISTAS.map(v => (
              <button key={v.id} onClick={() => setVista(v.id)} style={chip(vista === v.id)}>{v.label}</button>
            ))}
            <span style={{ width: 12 }} />
            <button onClick={() => setOperacion('')} style={chip(operacion === '')}>Cualquier cambio</button>
            <button onClick={() => setOperacion('DELETE')} style={chip(operacion === 'DELETE')}>Solo borrados</button>
          </div>

          {buscar && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ ...rotulo }}>Siguiendo un registro</span>
              <code style={{ fontSize: 11.5, color: 'var(--w50)' }}>…{buscar.slice(-12)}</code>
              <button onClick={() => setBuscar('')} style={{ ...chip(false), padding: '4px 11px', fontSize: 11.5 }}>Quitar</button>
            </div>
          )}
        </div>

        {/* ── Aviso de borrados ──────────────────────────────────────── */}
        {borrados > 0 && operacion !== 'DELETE' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '11px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>🔴</span>
            <span style={{ color: 'var(--rojo-t)', fontSize: 13, fontWeight: 600 }}>
              {borrados} {borrados === 1 ? 'registro borrado' : 'registros borrados'} en este periodo
            </span>
            <button onClick={() => setOperacion('DELETE')} style={{ ...chip(false), marginLeft: 'auto', padding: '4px 12px', fontSize: 12 }}>Verlos</button>
          </div>
        )}

        {/* ── Lista ──────────────────────────────────────────────────── */}
        {cargando && movimientos.length === 0 ? (
          <div style={{ color: 'var(--w35)', fontSize: 13, padding: '30px 4px' }}>Cargando…</div>
        ) : movimientos.length === 0 ? (
          <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, padding: '34px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🗒️</div>
            <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 600 }}>Ningún cambio en este periodo</div>
            <div style={{ color: 'var(--w40)', fontSize: 12.5, marginTop: 5, maxWidth: '46ch', margin: '5px auto 0' }}>
              La bitácora empezó a grabar el 8 de septiembre de 2026. Lo anterior a esa
              fecha no quedó registrado.
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
            {movimientos.map((m, i) => {
              const t = etiquetaTabla(m.tabla)
              const op = OPERACIONES[m.operacion] || { nombre: m.operacion, tono: 'ambar' }
              const abierta = abierto === m.id
              const quien = responsable(m)
              const cuando = new Date(String(m.ocurrio_en).replace(' ', 'T'))
              const cambios = (m.cambios || []).filter(c => !OCULTOS.has(c))

              return (
                <div key={m.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--w05)' }}>
                  <div onClick={() => setAbierto(abierta ? null : m.id)}
                    style={{ display: 'flex', gap: 12, padding: '12px 16px', cursor: 'pointer', alignItems: 'flex-start', background: abierta ? 'var(--w03)' : 'transparent' }}>
                    <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>{t.icono}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ color: tonoColor[op.tono], fontSize: 13, fontWeight: 700 }}>{op.nombre}</span>
                        <span style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{t.nombre.toLowerCase()}</span>
                        {quien && (
                          <span style={{ color: 'var(--w35)', fontSize: 11.5 }}>
                            · {quien.seguro ? `hecho por ${quien.txt}` : `según el registro, ${quien.txt}`}
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--w45)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {resumen(m)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ color: 'var(--w45)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
                        {cuando.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {!unSoloDia && (
                        <div style={{ color: 'var(--w30)', fontSize: 10.5 }}>
                          {cuando.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                  </div>

                  {abierta && (
                    <div style={{ padding: '0 16px 16px 44px' }}>
                      {m.operacion === 'UPDATE' ? (
                        <div style={{ border: '1px solid var(--w07)', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, background: 'var(--w03)', padding: '7px 12px' }}>
                            <span style={rotulo}>Campo</span><span style={rotulo}>Antes</span><span style={rotulo}>Después</span>
                          </div>
                          {cambios.map(c => {
                            const a = valor(c, m.antes?.[c])
                            const d = valor(c, m.despues?.[c])
                            return (
                              <div key={c} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, padding: '8px 12px', borderTop: '1px solid var(--w05)', fontSize: 12.5 }}>
                                <span style={{ color: 'var(--w50)' }}>{etiquetaCampo(c)}</span>
                                <span style={{ color: a.vacio ? 'var(--w28)' : 'var(--w60)', textDecoration: a.vacio ? 'none' : 'line-through', textDecorationColor: 'var(--w20)' }}>{a.txt}</span>
                                <span style={{ color: 'var(--tinta)', fontWeight: 600 }}>{d.txt}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ border: '1px solid var(--w07)', borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ background: 'var(--w03)', padding: '7px 12px' }}>
                            <span style={rotulo}>{m.operacion === 'DELETE' ? 'Cómo estaba antes de borrarse' : 'Con qué se creó'}</span>
                          </div>
                          {camposVisibles(m.despues || m.antes).map(c => {
                            const v = valor(c, (m.despues || m.antes)[c])
                            return (
                              <div key={c} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 0, padding: '7px 12px', borderTop: '1px solid var(--w05)', fontSize: 12.5 }}>
                                <span style={{ color: 'var(--w50)' }}>{etiquetaCampo(c)}</span>
                                <span style={{ color: v.vacio || v.tenue ? 'var(--w30)' : 'var(--tinta)', fontWeight: v.vacio || v.tenue ? 400 : 600 }}>{v.txt}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {m.registro_id && buscar !== m.registro_id && (
                        <button onClick={() => setBuscar(m.registro_id)}
                          style={{ ...chip(false), marginTop: 10, padding: '5px 13px', fontSize: 12 }}>
                          Ver toda la historia de este {t.nombre.toLowerCase()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {hayMas && (
          <button onClick={() => cargar(pagina + 1)} disabled={cargando}
            style={{ ...chip(false), marginTop: 14, width: '100%', padding: '11px', fontSize: 13, borderRadius: 12 }}>
            {cargando ? 'Cargando…' : 'Ver más'}
          </button>
        )}
      </div>
    </div>
  )
}
