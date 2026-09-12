'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// Fase 6 del control interno: conteo físico de inventario contra el stock del
// sistema, por categoría. Ver claude/inventario-conteo-fisico.md en el
// proyecto para el porqué de cada decisión.

const fmtFecha = (f) => {
  if (!f) return ''
  const d = new Date(String(f).replace(' ', 'T'))
  if (isNaN(d)) return ''
  return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const rotulo = { color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }
const tarjeta = { background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 14 }

export default function Inventario() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('cargando') // cargando · lista · contando
  const [categorias, setCategorias] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [cargandoLista, setCargandoLista] = useState(true)

  const [sesionActiva, setSesionActiva] = useState(null)
  const [items, setItems] = useState([])
  const [cargandoSesion, setCargandoSesion] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (!datos) { router.push('/'); return }
    setUsuario(JSON.parse(datos))
    cargarLista()
  }, [])

  const cargarLista = useCallback(async () => {
    setCargandoLista(true)
    const [resCat, resSes] = await Promise.all([
      fetch('/api/inventario?resumen=categorias').then(r => r.json()),
      fetch('/api/inventario').then(r => r.json()),
    ])
    if (resCat.ok) setCategorias(resCat.categorias)
    if (resSes.ok) setSesiones(resSes.sesiones)
    setCargandoLista(false)
    setVista('lista')
  }, [])

  const cargarSesion = useCallback(async (id) => {
    setCargandoSesion(true)
    setError('')
    const res = await fetch(`/api/inventario?id=${id}`).then(r => r.json())
    setCargandoSesion(false)
    if (!res.ok) { setError(res.mensaje); return }
    setSesionActiva(res.sesion)
    setItems(res.items)
    setBusqueda('')
    setVista('contando')
  }, [])

  const iniciarConteo = async (categoria) => {
    setError('')
    const res = await fetch('/api/inventario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria }),
    }).then(r => r.json())
    if (!res.ok) { setError(res.mensaje); return }
    await cargarSesion(res.sesion.id)
  }

  const guardarConteo = async (producto_id, cantidad_contada, justificacion) => {
    const res = await fetch('/api/inventario', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteo_id: sesionActiva.id, producto_id, cantidad_contada, justificacion: justificacion || null }),
    }).then(r => r.json())
    if (!res.ok) return { ok: false, mensaje: res.mensaje }
    await cargarSesion(sesionActiva.id)
    return { ok: true }
  }

  const cerrarConteo = async () => {
    const res = await fetch('/api/inventario', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sesionActiva.id }),
    }).then(r => r.json())
    if (!res.ok) { setError(res.mensaje); return }
    setSesionActiva(null)
    setItems([])
    await cargarLista()
  }

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return items
    return items.filter(it =>
      it.nombre?.toLowerCase().includes(q) || it.codigo_barras?.toLowerCase().includes(q)
    )
  }, [items, busqueda])

  const contados = items.filter(it => it.conteo).length
  const conDiferencia = items.filter(it => it.conteo && it.conteo.diferencia !== 0).length
  const sinContar = items.length - contados

  if (vista === 'cargando') {
    return (
      <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--w40)' }}>Cargando…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: 'var(--tinta)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {vista === 'lista' && (
          <VistaLista
            categorias={categorias}
            sesiones={sesiones}
            cargando={cargandoLista}
            error={error}
            onIniciar={iniciarConteo}
            onAbrir={cargarSesion}
          />
        )}

        {vista === 'contando' && sesionActiva && (
          <VistaContando
            sesion={sesionActiva}
            items={itemsFiltrados}
            totalItems={items.length}
            contados={contados}
            conDiferencia={conDiferencia}
            sinContar={sinContar}
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            cargando={cargandoSesion}
            error={error}
            onGuardar={guardarConteo}
            onCerrar={cerrarConteo}
            onSalir={() => { setSesionActiva(null); setItems([]); cargarLista() }}
          />
        )}
      </div>
    </div>
  )
}

// ── Lista: categorías para iniciar + historial ──────────────────────────
function VistaLista({ categorias, sesiones, cargando, error, onIniciar, onAbrir }) {
  const abiertas = sesiones.filter(s => s.estado === 'abierto')
  const cerradas = sesiones.filter(s => s.estado === 'cerrado')

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Inventario</div>
        <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 4, maxWidth: '62ch' }}>
          Conteo físico contra el stock del sistema, por categoría. Cuenta lo que hay en el
          anaquel, y si no coincide con lo que dice el catálogo, el sistema pide el motivo y
          ajusta el stock al momento — igual que el corte de caja.
        </div>
      </div>

      {error && <div style={{ color: 'var(--rojo-t)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

      {abiertas.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ ...rotulo, marginBottom: 8 }}>Conteos en curso</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {abiertas.map(s => (
              <div key={s.id} onClick={() => onAbrir(s.id)}
                style={{ ...tarjeta, padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{s.categoria}</div>
                  <div style={{ fontSize: 12, color: 'var(--w45)', marginTop: 2 }}>
                    Iniciado por {s.iniciador?.nombre || 'alguien'} · {fmtFecha(s.iniciado_en)}
                    {s.con_diferencia > 0 && <span style={{ color: 'var(--ambar-t)' }}> · {s.con_diferencia} con diferencia</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--marca-t)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.contados}/{s.total_productos}
                  </span>
                  <span style={{ color: 'var(--w35)' }}>Continuar →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <div style={{ ...rotulo, marginBottom: 8 }}>Iniciar un conteo</div>
        {cargando ? (
          <div style={{ color: 'var(--w35)', fontSize: 13 }}>Cargando categorías…</div>
        ) : categorias.length === 0 ? (
          <div style={{ color: 'var(--w35)', fontSize: 13 }}>No hay productos activos en el catálogo.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {categorias.map(c => (
              <div key={c.categoria} style={{ ...tarjeta, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.categoria}</div>
                <div style={{ fontSize: 12, color: 'var(--w45)', marginBottom: 10 }}>{c.total_productos} productos activos</div>
                {c.sesion_abierta_id ? (
                  <button onClick={() => onAbrir(c.sesion_abierta_id)}
                    style={{ width: '100%', background: 'rgba(193,85,58,0.12)', color: 'var(--marca-t)', border: '1px solid rgba(193,85,58,0.35)', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Ya en curso — continuar
                  </button>
                ) : (
                  <button onClick={() => onIniciar(c.categoria)}
                    style={{ width: '100%', background: 'var(--tinta)', color: 'var(--fondo)', border: 'none', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Iniciar conteo
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {cerradas.length > 0 && (
        <div>
          <div style={{ ...rotulo, marginBottom: 8 }}>Historial</div>
          <div style={{ ...tarjeta, overflow: 'hidden' }}>
            {cerradas.map((s, i) => (
              <div key={s.id} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--w05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.categoria}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--w40)', marginTop: 2 }}>
                    {s.iniciador?.nombre || 'alguien'} inició · {s.cerrador?.nombre || 'alguien'} cerró el {fmtFecha(s.cerrado_en)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--w45)' }}>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>{s.contados}/{s.total_productos} contados</div>
                  {s.con_diferencia > 0 && <div style={{ color: 'var(--ambar-t)', fontWeight: 600 }}>{s.con_diferencia} con diferencia</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contando: progreso + búsqueda + lista de productos ───────────────────
function VistaContando({ sesion, items, totalItems, contados, conDiferencia, sinContar, busqueda, setBusqueda, cargando, error, onGuardar, onCerrar, onSalir }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <button onClick={onSalir}
          style={{ background: 'var(--w06)', color: 'var(--w70)', border: '1px solid var(--w14)', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ← Salir
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{sesion.categoria}</div>
          <div style={{ fontSize: 12.5, color: 'var(--w45)', marginTop: 2 }}>
            {contados} de {totalItems} contados{conDiferencia > 0 && ` · ${conDiferencia} con diferencia`}
          </div>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o código de barras… (aquí también sirve un lector de código de barras)"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '11px 14px', color: 'var(--tinta)', fontSize: 13.5, outline: 'none', marginBottom: 14 }}
      />

      {error && <div style={{ color: 'var(--rojo-t)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {cargando ? (
        <div style={{ color: 'var(--w35)', fontSize: 13 }}>Actualizando…</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'var(--w35)', fontSize: 13, padding: '20px 4px' }}>Sin resultados para esa búsqueda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {items.map(it => (
            <RenglonProducto key={it.id} item={it} onGuardar={onGuardar} />
          ))}
        </div>
      )}

      <div style={{ ...tarjeta, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, position: 'sticky', bottom: 14 }}>
        <div style={{ fontSize: 12.5, color: 'var(--w45)' }}>
          {sinContar > 0 ? `Faltan ${sinContar} productos por contar.` : 'Todo contado.'}
        </div>
        <button onClick={onCerrar}
          style={{ background: 'var(--tinta)', color: 'var(--fondo)', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          🔒 Cerrar conteo{sinContar > 0 ? ` (faltan ${sinContar})` : ''}
        </button>
      </div>
    </div>
  )
}

// ── Un producto: contado (resumido) o pendiente (con su input) ─────────
function RenglonProducto({ item, onGuardar }) {
  const yaContado = !!item.conteo
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(yaContado ? String(item.conteo.cantidad_contada) : '')
  const [justificacion, setJustificacion] = useState(yaContado ? (item.conteo.justificacion || '') : '')
  const [guardando, setGuardando] = useState(false)
  const [errorLocal, setErrorLocal] = useState('')

  const cantidad = valor === '' ? null : Number(valor)
  const diferenciaPreview = cantidad === null ? null : cantidad - item.stock
  const necesitaJustificacion = diferenciaPreview !== null && diferenciaPreview !== 0

  const guardar = async () => {
    if (cantidad === null || cantidad < 0 || !Number.isInteger(cantidad)) {
      setErrorLocal('Escribe una cantidad válida'); return
    }
    if (necesitaJustificacion && !justificacion.trim()) {
      setErrorLocal('Hay una diferencia — explica qué pasó'); return
    }
    setGuardando(true)
    setErrorLocal('')
    const r = await onGuardar(item.id, cantidad, justificacion.trim() || null)
    setGuardando(false)
    if (!r.ok) setErrorLocal(r.mensaje)
    else setEditando(false)
  }

  // Ya contado y no se está editando: renglón resumido, plegado. Lo pendiente
  // es lo que pesa en pantalla; lo terminado se resume.
  if (yaContado && !editando) {
    const dif = item.conteo.diferencia
    return (
      <div style={{ ...tarjeta, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 15 }}>{dif === 0 ? '✅' : dif > 0 ? '🟡' : '🔴'}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nombre}</div>
            <div style={{ fontSize: 11.5, color: 'var(--w40)' }}>
              Contado: {item.conteo.cantidad_contada}
              {dif !== 0 && ` · ${dif > 0 ? '+' : ''}${dif} vs sistema · ${item.conteo.contador?.nombre || 'alguien'}`}
            </div>
          </div>
        </div>
        <button onClick={() => setEditando(true)}
          style={{ flexShrink: 0, background: 'transparent', color: 'var(--w45)', border: '1px solid var(--w14)', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
          Editar
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...tarjeta, padding: '13px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item.nombre}</div>
          <div style={{ fontSize: 11.5, color: 'var(--w40)' }}>{item.codigo_barras || 'sin código'} · sistema: {item.stock}</div>
        </div>
        {yaContado && (
          <button onClick={() => setEditando(false)} style={{ background: 'transparent', color: 'var(--w40)', border: 'none', fontSize: 11.5, cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="number"
          inputMode="numeric"
          value={valor}
          onChange={e => setValor(e.target.value)}
          placeholder="Contado"
          style={{ width: 100, background: 'var(--w05)', border: '1px solid var(--w14)', borderRadius: 8, padding: '8px 10px', color: 'var(--tinta)', fontSize: 14, outline: 'none', fontVariantNumeric: 'tabular-nums' }}
        />
        {necesitaJustificacion && (
          <input
            value={justificacion}
            onChange={e => setJustificacion(e.target.value)}
            placeholder={`Diferencia de ${diferenciaPreview > 0 ? '+' : ''}${diferenciaPreview} — explica qué pasó`}
            style={{ flex: 1, minWidth: 220, background: 'var(--w05)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '8px 10px', color: 'var(--tinta)', fontSize: 13, outline: 'none' }}
          />
        )}
        <button onClick={guardar} disabled={guardando}
          style={{ background: 'var(--tinta)', color: 'var(--fondo)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {errorLocal && <div style={{ color: 'var(--rojo-t)', fontSize: 11.5, marginTop: 8 }}>{errorLocal}</div>}
    </div>
  )
}
