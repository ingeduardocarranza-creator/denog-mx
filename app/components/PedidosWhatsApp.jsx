'use client'
import { useState, useEffect, useCallback } from 'react'
import { paraWaMe } from '@/lib/whatsapp/telefono'

// Pedidos específicos que llegan por WhatsApp. Vive como pestaña dentro de
// Encargos > Pedidos (1 sep 2026) y también en /admin/pendientes, que es la
// ruta que sigue usando el menú de colaboradores.
// Los comprobantes se atienden en Anticipos, donde aplicarlos crea el pago;
// el tipo "sin responder" se eliminó porque no funcionaba en la práctica.
const TIPO = 'pedido_especifico'

function haceCuanto(fecha) {
  const ms = Date.now() - new Date(fecha).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'justo ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function colorUrgencia(fecha) {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min >= 60) return 'var(--rojo-t)'
  if (min >= 15) return 'var(--ambar)'
  return 'var(--w40)'
}

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX')}`

// El bucket guarda tanto fotos como PDFs de comprobante bajo la misma
// columna imagen_url. Un <img> no puede mostrar un PDF — se detecta por la
// extensión (antes del ?token de la URL firmada) y se muestra como enlace.
function esPdf(url) {
  return (url || '').split('?')[0].toLowerCase().endsWith('.pdf')
}

function fechaLocalHoy() {
  const hoy = new Date()
  return new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}


export default function PedidosWhatsApp({ embebido = false }) {
  const [vista, setVista] = useState('activos') // 'activos' | 'resueltos'
  const [pendientes, setPendientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [form, setForm] = useState({
    tipo: TIPO, telefono_whatsapp: '', nombre_whatsapp: '',
    resumen: '',
  })

  const [clientes, setClientes] = useState([])
  const [descarteReciente, setDescarteReciente] = useState(null) // { id, resumen } para el "Deshacer"

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/pendientes?vista=${vista}`)
    const data = await res.json()
    if (data.ok) setPendientes(data.pendientes)
    setCargando(false)
  }, [vista])

  useEffect(() => {
    cargar()
    const intervalo = setInterval(cargar, 20000)
    return () => clearInterval(intervalo)
  }, [cargar])

  // El aviso de "Deshacer" se va solo a los 8 segundos.
  useEffect(() => {
    if (!descarteReciente) return
    const t = setTimeout(() => setDescarteReciente(null), 8000)
    return () => clearTimeout(t)
  }, [descarteReciente])

  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => setClientes(d.clientes || []))
  }, [])

  const accion = async (id, accion) => {
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    })
    cargar()
  }

  // "Esto no era": saca el pendiente de la lista de un solo clic, sin
  // confirmación previa, y ofrece deshacer unos segundos. Se prefirió esto a
  // la doble confirmación porque el descarte va a ser frecuente (el
  // clasificador genera de más a propósito) y confirmar cada vez estorba;
  // el deshacer solo aparece cuando hizo falta. No borra: ver
  // docs/PENDIENTES.md §7.
  const descartar = async (id) => {
    const previo = pendientes.find(p => p.id === id)
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'descartar' }),
    })
    setDescarteReciente({ id, resumen: previo?.resumen || '' })
    cargar()
  }

  const deshacerDescarte = async () => {
    if (!descarteReciente) return
    await fetch('/api/pendientes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: descarteReciente.id, accion: 'restaurar' }),
    })
    setDescarteReciente(null)
    cargar()
  }

  const agregarAMano = async () => {
    if (!form.telefono_whatsapp || !form.resumen) {
      setMensaje('Falta teléfono o resumen'); return
    }
    setGuardando(true)
    const res = await fetch('/api/pendientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
      }),
    })
    const data = await res.json()
    setGuardando(false)
    if (!data.ok) { setMensaje(data.mensaje || 'Error al guardar'); return }
    setForm({ tipo: TIPO, telefono_whatsapp: '', nombre_whatsapp: '', resumen: '' })
    setMostrarForm(false)
    setMensaje('')
    cargar()
  }

  const filtrados = pendientes.filter(p => p.tipo === TIPO)

  const inputStyle = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            {!embebido && <div style={{ color: 'var(--tinta)', fontSize: 22, fontWeight: 700 }}>🔔 Pedidos por WhatsApp</div>}
            <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: embebido ? 0 : 2 }}>
              Pedidos específicos que llegaron por WhatsApp y faltan atender
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setVista(v => v === 'activos' ? 'resueltos' : 'activos')}
              style={{ background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '8px 14px', color: 'var(--w60)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {vista === 'activos' ? '🕘 Ver resueltos' : '← Ver activos'}
            </button>
            {vista === 'activos' && (
              <button onClick={() => setVista('descartados')} title="Lo que la IA no debió generar — sirve para afinarla"
                style={{ background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '8px 14px', color: 'var(--w60)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                🚫 Descartados
              </button>
            )}
            {vista === 'activos' && (
              <button onClick={() => setMostrarForm(m => !m)}
                style={{ background: 'rgba(193,85,58,0.15)', border: '1px solid rgba(193,85,58,0.3)', borderRadius: 10, padding: '8px 14px', color: 'var(--marca-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                ➕ Agregar a mano
              </button>
            )}
          </div>
        </div>

        {mostrarForm && (
          <div style={{ background: 'var(--w03)', border: '1px solid var(--w08)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Agregar pendiente a mano</div>
            {mensaje && <div style={{ color: 'var(--rojo-t)', fontSize: 11, marginBottom: 10 }}>{mensaje}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input placeholder="Teléfono (10 dígitos)" value={form.telefono_whatsapp} onChange={e => setForm({ ...form, telefono_whatsapp: e.target.value })} style={inputStyle} />
              <input placeholder="Nombre (si se sabe)" value={form.nombre_whatsapp} onChange={e => setForm({ ...form, nombre_whatsapp: e.target.value })} style={inputStyle} />
            </div>
            <textarea placeholder="Resumen (ej. transferencia de $450, banco BBVA)" value={form.resumen} onChange={e => setForm({ ...form, resumen: e.target.value })}
              style={{ ...inputStyle, minHeight: 60, marginBottom: 10, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={agregarAMano} disabled={guardando}
                style={{ flex: 1, background: 'var(--marca)', border: 'none', borderRadius: 10, padding: '10px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                {guardando ? 'Guardando...' : '✓ Agregar'}
              </button>
              <button onClick={() => setMostrarForm(false)}
                style={{ background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '10px 16px', color: 'var(--w50)', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cargando ? (
            <div style={{ textAlign: 'center', color: 'var(--w30)', fontSize: 12, padding: 40 }}>Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--w30)', fontSize: 12 }}>
              {vista === 'activos' ? '✓ Nada pendiente por aquí'
                : vista === 'descartados' ? 'Nada descartado en esta categoría'
                : 'Sin historial en esta categoría'}
            </div>
          ) : (
            filtrados.map(p => {
              const nombre = p.clientes?.nombre || p.nombre_whatsapp || p.telefono_whatsapp
              const wa = paraWaMe(p.telefono_whatsapp)
              return (
                <div key={p.id} style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{nombre}</div>
                      <div style={{ color: 'var(--w70)', fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{p.resumen}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: colorUrgencia(p.creado_en), fontSize: 10, fontWeight: 600 }}>
                          {vista === 'activos' ? haceCuanto(p.creado_en)
                            : vista === 'descartados' ? haceCuanto(p.descartado_en)
                            : haceCuanto(p.resuelto_en)}
                        </span>
                        {p.estado === 'visto' && p.atendido?.nombre && (
                          <span style={{ color: 'var(--marca-t)', fontSize: 10, background: 'rgba(193,85,58,0.12)', borderRadius: 8, padding: '2px 7px' }}>
                            👀 Viendo: {p.atendido.nombre}
                          </span>
                        )}
                        {vista === 'resueltos' && p.resuelto?.nombre && (
                          <span style={{ color: 'var(--verde)', fontSize: 10, background: 'rgba(74,222,128,0.1)', borderRadius: 8, padding: '2px 7px' }}>
                            ✓ Resuelto por {p.resuelto.nombre}
                          </span>
                        )}
                        {vista === 'descartados' && p.descartado?.nombre && (
                          <span style={{ color: 'var(--w50)', fontSize: 10, background: 'var(--w06)', borderRadius: 8, padding: '2px 7px' }}>
                            🚫 Descartado por {p.descartado.nombre}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {p.imagen_url && (esPdf(p.imagen_url) ? (
                    <a href={p.imagen_url} target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, width: 'fit-content', background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 8, padding: '8px 12px', color: 'var(--marca-t)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      📄 Ver archivo (PDF)
                    </a>
                  ) : (
                    <a href={p.imagen_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 10 }}>
                      <img src={p.imagen_url} alt="Comprobante" style={{ maxHeight: 160, borderRadius: 8, border: '1px solid var(--w10)' }} />
                    </a>
                  ))}

                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
                      style={{ flex: 1, textAlign: 'center', background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 8, padding: '7px', color: '#25D366', fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                      💬 Abrir chat
                    </a>
                    {vista === 'activos' && p.estado === 'nuevo' && (
                      <button onClick={() => accion(p.id, 'ver')}
                        style={{ flex: 1, background: 'rgba(193,85,58,0.1)', border: '1px solid rgba(193,85,58,0.25)', borderRadius: 8, padding: '7px', color: 'var(--marca-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        👀 Yo lo veo
                      </button>
                    )}
                    {vista === 'activos' && (
                      <button onClick={() => accion(p.id, 'resolver')}
                        style={{ flex: 1, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '7px', color: 'var(--verde)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ✅ Listo
                      </button>
                    )}
                    {vista === 'activos' && (
                      <button onClick={() => descartar(p.id)} title="La IA no debió generar esto"
                        style={{ background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--w45)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        🚫 Esto no era
                      </button>
                    )}
                    {vista === 'resueltos' && (
                      <button onClick={() => accion(p.id, 'reabrir')}
                        style={{ flex: 1, background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px', color: 'var(--w50)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ↺ Reabrir
                      </button>
                    )}
                    {vista === 'descartados' && (
                      <button onClick={() => accion(p.id, 'restaurar')}
                        style={{ flex: 1, background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px', color: 'var(--w50)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        ↺ Devolver a la lista
                      </button>
                    )}
                  </div>

                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Aviso flotante de "Deshacer" — reemplaza a la doble confirmación:
          no estorba cuando el descarte era correcto (que será casi siempre)
          y protege igual cuando fue error de dedo. */}
      {descarteReciente && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 14, background: '#1c1c22', border: '1px solid var(--w14)', borderRadius: 12, padding: '11px 16px', boxShadow: '0 8px 28px rgba(0,0,0,0.5)', maxWidth: 'calc(100vw - 32px)' }}>
          <span style={{ color: 'var(--w75)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            🚫 Descartado{descarteReciente.resumen ? `: ${descarteReciente.resumen}` : ''}
          </span>
          <button onClick={deshacerDescarte}
            style={{ background: 'rgba(193,85,58,0.18)', border: '1px solid rgba(193,85,58,0.35)', borderRadius: 8, padding: '6px 12px', color: 'var(--marca-t)', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            ↺ Deshacer
          </button>
        </div>
      )}
    </div>
  )
}
