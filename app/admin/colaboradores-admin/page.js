'use client'
import { useState, useEffect } from 'react'

const ROL_LABEL = { vendedor: 'Vendedor', admin: 'Admin' }
const ROL_COLOR = {
  vendedor: { bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.3)', text: '#818cf8' },
  admin:    { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '9px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const labelStyle = {
  color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
  display: 'block', marginBottom: 6,
}

export default function ColaboradoresAdmin() {
  const [colaboradores, setColaboradores] = useState([])
  const [buscador, setBuscador]           = useState('')
  const [mostrarForm, setMostrarForm]     = useState(false)
  const [editando, setEditando]           = useState(null)
  const [cargando, setCargando]           = useState(false)
  const [msg, setMsg]                     = useState({ texto: '', ok: true })

  const [usuarioManual, setUsuarioManual] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', usuario: '', password: '', rol: 'vendedor' })
  const [edit, setEdit]   = useState({ nombre: '', usuario: '', rol: 'vendedor', activo: true, password: '' })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const res  = await fetch('/api/colaboradores')
    const data = await res.json()
    if (data.ok) setColaboradores(data.colaboradores)
  }

  // ── Generación automática de usuario ────────────────────────────
  const quitarAcentos = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ñÑ]/g, 'n')

  const generarBase = (nombre) => {
    const limpio = quitarAcentos(nombre).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const partes = limpio.split(/\s+/).filter(Boolean)
    if (!partes.length) return ''
    return partes.length >= 2 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0]
  }

  const usuarioUnico = (base, excluirId = null) => {
    let u = base; let n = 2
    while (colaboradores.some(c => c.usuario === u && c.id !== excluirId)) { u = `${base}${n}`; n++ }
    return u
  }

  const handleNombreNuevo = (nombre) => {
    const base = generarBase(nombre)
    setNuevo(prev => ({ ...prev, nombre, usuario: usuarioManual ? prev.usuario : usuarioUnico(base) }))
  }

  const mostrarMsg = (texto, ok = true) => {
    setMsg({ texto, ok })
    setTimeout(() => setMsg({ texto: '', ok: true }), 3000)
  }

  // ── Crear ────────────────────────────────────────────────────────
  const crear = async () => {
    if (!nuevo.nombre.trim() || !nuevo.usuario.trim() || !nuevo.password) {
      mostrarMsg('Nombre, usuario y contraseña son obligatorios', false); return
    }
    if (colaboradores.some(c => c.usuario === nuevo.usuario)) {
      mostrarMsg('Este usuario ya está en uso', false); return
    }
    setCargando(true)
    const res  = await fetch('/api/colaboradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevo),
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      mostrarMsg('Colaborador creado ✓')
      setNuevo({ nombre: '', usuario: '', password: '', rol: 'vendedor' })
      setUsuarioManual(false)
      setMostrarForm(false)
      cargar()
    } else {
      mostrarMsg(data.mensaje || 'Error al crear', false)
    }
  }

  // ── Abrir edición ────────────────────────────────────────────────
  const abrirEdicion = (c) => {
    setEditando(c.id)
    setEdit({ nombre: c.nombre, usuario: c.usuario || '', rol: c.rol, activo: c.activo, password: '' })
  }

  // ── Guardar edición ──────────────────────────────────────────────
  const guardarEdicion = async () => {
    if (!edit.nombre.trim()) { mostrarMsg('El nombre es obligatorio', false); return }
    if (colaboradores.some(c => c.usuario === edit.usuario && c.id !== editando)) {
      mostrarMsg('Este usuario ya está en uso', false); return
    }
    setCargando(true)
    const body = { id: editando, nombre: edit.nombre, usuario: edit.usuario, rol: edit.rol, activo: edit.activo }
    if (edit.password) body.password = edit.password
    const res  = await fetch('/api/colaboradores', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      mostrarMsg('Guardado ✓')
      setEditando(null)
      cargar()
    } else {
      mostrarMsg(data.mensaje || 'Error al guardar', false)
    }
  }

  // ── Toggle activo rápido ─────────────────────────────────────────
  const toggleActivo = async (c) => {
    await fetch('/api/colaboradores', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, activo: !c.activo }),
    })
    cargar()
  }

  const filtrados = colaboradores.filter(c =>
    c.nombre.toLowerCase().includes(buscador.toLowerCase()) ||
    c.usuario?.toLowerCase().includes(buscador.toLowerCase())
  )

  const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }

  return (
    <div style={{ minHeight: '100vh', background: '#030712', padding: '24px 20px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>👥 Equipo</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>
              {colaboradores.length} colaborador{colaboradores.length !== 1 ? 'es' : ''} registrados
            </div>
          </div>
          <button onClick={() => { setMostrarForm(f => !f); setEditando(null) }}
            style={{ padding: '9px 18px', borderRadius: 10, background: mostrarForm ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.2)', border: `1px solid ${mostrarForm ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.35)'}`, color: mostrarForm ? 'rgba(255,255,255,0.5)' : '#818cf8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo colaborador'}
          </button>
        </div>

        {/* Mensaje global */}
        {msg.texto && (
          <div style={{ background: msg.ok ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${msg.ok ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 10, padding: '10px 16px', color: msg.ok ? '#4ade80' : '#f87171', fontSize: 13, marginBottom: 16 }}>
            {msg.texto}
          </div>
        )}

        {/* Formulario nuevo */}
        {mostrarForm && (
          <div style={{ ...card, padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nuevo colaborador</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Nombre completo</label>
                <input style={inputStyle} placeholder="Nombre apellido" value={nuevo.nombre}
                  onChange={e => handleNombreNuevo(e.target.value)} />
              </div>
              <div>
                <label style={{ ...labelStyle }}>
                  Usuario {!usuarioManual && <span style={{ color: '#818cf8', fontSize: 10 }}>(auto)</span>}
                </label>
                <input style={{ ...inputStyle, borderColor: colaboradores.some(c => c.usuario === nuevo.usuario) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)' }}
                  placeholder="nombre.apellido" value={nuevo.usuario}
                  onChange={e => { setUsuarioManual(true); setNuevo({ ...nuevo, usuario: e.target.value.toLowerCase().replace(/\s/g, '.') }) }} />
                {colaboradores.some(c => c.usuario === nuevo.usuario) && nuevo.usuario && (
                  <div style={{ color: '#f87171', fontSize: 10, marginTop: 4 }}>Este usuario ya está en uso</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Contraseña</label>
                <input type="password" style={inputStyle} placeholder="••••••••" value={nuevo.password}
                  onChange={e => setNuevo({ ...nuevo, password: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Rol</label>
                <select style={inputStyle} value={nuevo.rol}
                  onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}>
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <button onClick={crear} disabled={cargando}
              style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: cargando ? 0.5 : 1 }}>
              {cargando ? 'Guardando...' : 'Crear colaborador'}
            </button>
          </div>
        )}

        {/* Buscador */}
        <div style={{ marginBottom: 16 }}>
          <input style={{ ...inputStyle, padding: '10px 14px' }} placeholder="Buscar por nombre o usuario..."
            value={buscador} onChange={e => setBuscador(e.target.value)} />
        </div>

        {/* Lista */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {/* Header tabla */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['Colaborador', 'Usuario', 'Rol', 'Estado', ''].map((h, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</div>
            ))}
          </div>

          {filtrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
              {buscador ? 'Sin resultados' : 'No hay colaboradores registrados aún'}
            </div>
          ) : (
            filtrados.map((c, i) => {
              const rc = ROL_COLOR[c.rol] || ROL_COLOR.vendedor
              const isEditing = editando === c.id

              return (
                <div key={c.id}>
                  {/* Fila */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px 20px', borderBottom: i < filtrados.length - 1 || isEditing ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>{c.nombre}</div>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{c.usuario}</div>
                    <div>
                      <span style={{ background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: 20, padding: '3px 10px', color: rc.text, fontSize: 11, fontWeight: 600 }}>
                        {ROL_LABEL[c.rol] || c.rol}
                      </span>
                    </div>
                    <div>
                      <button onClick={() => toggleActivo(c)}
                        style={{ background: c.activo ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${c.activo ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: 20, padding: '3px 10px', color: c.activo ? '#4ade80' : '#f87171', fontSize: 11, cursor: 'pointer' }}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                    <div>
                      <button onClick={() => isEditing ? setEditando(null) : abrirEdicion(c)}
                        style={{ padding: '5px 12px', borderRadius: 8, background: isEditing ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.12)', border: `1px solid ${isEditing ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.25)'}`, color: isEditing ? 'rgba(255,255,255,0.4)' : '#818cf8', fontSize: 12, cursor: 'pointer' }}>
                        {isEditing ? 'Cerrar' : 'Editar'}
                      </button>
                    </div>
                  </div>

                  {/* Panel edición inline */}
                  {isEditing && (
                    <div style={{ background: 'rgba(99,102,241,0.04)', borderBottom: i < filtrados.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', padding: '16px 20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                        <div>
                          <label style={labelStyle}>Nombre completo</label>
                          <input style={inputStyle} value={edit.nombre}
                            onChange={e => setEdit({ ...edit, nombre: e.target.value })} />
                        </div>
                        <div>
                          <label style={labelStyle}>Rol</label>
                          <select style={inputStyle} value={edit.rol}
                            onChange={e => setEdit({ ...edit, rol: e.target.value })}>
                            <option value="vendedor">Vendedor</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>Estado</label>
                          <select style={inputStyle} value={edit.activo ? 'true' : 'false'}
                            onChange={e => setEdit({ ...edit, activo: e.target.value === 'true' })}>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Nueva contraseña (dejar vacío para no cambiar)</label>
                          <input type="password" style={{ ...inputStyle, maxWidth: 320 }} placeholder="••••••••"
                            value={edit.password} onChange={e => setEdit({ ...edit, password: e.target.value })} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={guardarEdicion} disabled={cargando}
                          style={{ padding: '8px 20px', borderRadius: 9, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: cargando ? 0.5 : 1 }}>
                          {cargando ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                        <button onClick={() => setEditando(null)}
                          style={{ padding: '8px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
