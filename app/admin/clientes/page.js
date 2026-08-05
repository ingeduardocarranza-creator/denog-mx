'use client'
import { useState, useEffect } from 'react'

const iStyle = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm outline-none'
const lStyle = 'text-gray-400 text-xs block mb-1'

export default function Clientes() {
  const [clientes, setClientes]         = useState([])
  const [buscador, setBuscador]         = useState('')
  const [mostrarForm, setMostrarForm]   = useState(false)
  const [editando, setEditando]         = useState(null)
  const [cargando, setCargando]         = useState(false)
  const [msg, setMsg]                   = useState('')
  const [msgEdit, setMsgEdit]           = useState('')
  const [usuarioManual, setUsuarioManual] = useState(false)

  const [nuevo, setNuevo] = useState({
    nombre: '', telefono: '', usuario: '', password: '',
    limite_credito: 3000, requiere_anticipo: false
  })
  const [edit, setEdit] = useState({
    nombre: '', usuario: '', telefono: '', celular_contacto: '',
    limite_credito: 3000, requiere_anticipo: false, activo: true, password: ''
  })

  useEffect(() => { cargarClientes() }, [])

  const cargarClientes = async () => {
    const res = await fetch('/api/clientes/listar?activo=todos')
    const data = await res.json()
    if (data.ok) setClientes(data.clientes)
  }

  // ── Generación de usuario ──────────────────────────────────────
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
    while (clientes.some(c => c.usuario === u && c.id !== excluirId)) { u = `${base}${n}`; n++ }
    return u
  }

  const handleNombreNuevo = (nombre) => {
    const base = generarBase(nombre)
    setNuevo(prev => ({
      ...prev, nombre,
      usuario: usuarioManual ? prev.usuario : usuarioUnico(base)
    }))
  }

  // ── Crear cliente ──────────────────────────────────────────────
  const guardar = async () => {
    if (!nuevo.nombre || !nuevo.usuario || !nuevo.password) {
      setMsg('Nombre, usuario y contraseña son obligatorios'); return
    }
    if (clientes.some(c => c.usuario === nuevo.usuario)) {
      setMsg('Este usuario ya está en uso'); return
    }
    setCargando(true)
    const res = await fetch('/api/clientes/crear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevo)
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      setMsg('Cliente creado ✓')
      setNuevo({ nombre: '', telefono: '', usuario: '', password: '', limite_credito: 3000, requiere_anticipo: false })
      setUsuarioManual(false)
      setMostrarForm(false)
      cargarClientes()
    } else {
      setMsg(data.mensaje || 'Error al crear cliente')
    }
  }

  // ── Edición inline ─────────────────────────────────────────────
  const abrirEdicion = (c) => {
    setEditando(c.id)
    setEdit({
      nombre: c.nombre, usuario: c.usuario || '',
      telefono: c.telefono || '', celular_contacto: c.celular_contacto || '',
      limite_credito: c.limite_credito || 3000,
      requiere_anticipo: c.requiere_anticipo || false,
      activo: c.activo, password: ''
    })
    setMsgEdit('')
  }

  const guardarEdicion = async () => {
    if (!edit.nombre.trim()) { setMsgEdit('El nombre es obligatorio'); return }
    const res = await fetch('/api/clientes/actualizar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editando, ...edit })
    })
    const data = await res.json()
    if (data.ok) { setEditando(null); cargarClientes() }
    else setMsgEdit(data.mensaje || 'Error al guardar')
  }

  const toggleActivo = async (c) => {
    await fetch('/api/clientes/actualizar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, activo: !c.activo })
    })
    cargarClientes()
  }

  const clientesFiltrados = clientes.filter(c =>
    c.rol === 'cliente' && (
      c.nombre.toLowerCase().includes(buscador.toLowerCase()) ||
      c.usuario?.toLowerCase().includes(buscador.toLowerCase()) ||
      c.telefono?.includes(buscador)
    )
  )

  const creditsOptions = [
    { value: 1500, label: '$1,500 — Conservador' },
    { value: 3000, label: '$3,000 — Estándar' },
    { value: 5000, label: '$5,000 — Amplio' },
    { value: 99999, label: 'Sin límite' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="text-white text-2xl font-semibold">Clientes</div>
            <div className="text-gray-400 text-sm">{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => { setMostrarForm(f => !f); setMsg('') }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
            {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
          </button>
        </div>

        {/* Formulario nuevo cliente */}
        {mostrarForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <div className="text-white font-medium mb-4">Nuevo cliente</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={lStyle}>Nombre completo *</label>
                <input type="text" value={nuevo.nombre}
                  onChange={e => handleNombreNuevo(e.target.value)}
                  className={iStyle} placeholder="Andrea Pérez" />
              </div>
              <div>
                <label className={lStyle}>Teléfono WhatsApp</label>
                <input type="text" value={nuevo.telefono}
                  onChange={e => setNuevo({...nuevo, telefono: e.target.value})}
                  className={iStyle} placeholder="662 000 0000" />
              </div>
              <div>
                <label className={lStyle}>
                  Usuario portal *
                  {!usuarioManual && <span className="text-indigo-400 ml-1">(auto-generado)</span>}
                </label>
                <input type="text" value={nuevo.usuario}
                  onChange={e => { setUsuarioManual(true); setNuevo({...nuevo, usuario: e.target.value.toLowerCase().replace(/\s/g, '.')}) }}
                  className={iStyle} placeholder="nombre.apellido" />
                {clientes.some(c => c.usuario === nuevo.usuario) && nuevo.usuario && (
                  <div className="text-red-400 text-xs mt-1">Este usuario ya está en uso</div>
                )}
              </div>
              <div>
                <label className={lStyle}>Contraseña inicial *</label>
                <input type="password" value={nuevo.password}
                  onChange={e => setNuevo({...nuevo, password: e.target.value})}
                  className={iStyle} placeholder="••••••••" />
              </div>
              <div>
                <label className={lStyle}>Límite de crédito</label>
                <select value={nuevo.limite_credito}
                  onChange={e => setNuevo({...nuevo, limite_credito: Number(e.target.value)})}
                  className={iStyle}>
                  {creditsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" checked={nuevo.requiere_anticipo}
                  onChange={e => setNuevo({...nuevo, requiere_anticipo: e.target.checked})}
                  className="w-4 h-4 accent-indigo-500" />
                <label className="text-gray-400 text-sm">Requiere anticipo antes de comprar</label>
              </div>
            </div>
            {msg && <div className="text-yellow-400 text-sm mb-3">{msg}</div>}
            <div className="flex gap-3">
              <button onClick={guardar} disabled={cargando}
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                {cargando ? 'Guardando...' : 'Guardar cliente'}
              </button>
              <button onClick={() => { setMostrarForm(false); setMsg('') }}
                className="bg-gray-800 text-gray-300 px-4 py-2 rounded-xl text-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="mb-4">
          <input type="text" value={buscador} onChange={e => setBuscador(e.target.value)}
            placeholder="Buscar por nombre, usuario o teléfono..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm outline-none" />
        </div>

        {/* Lista */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">

          {/* Header tabla */}
          <div className="grid grid-cols-6 gap-3 px-5 py-3 text-gray-500 text-xs uppercase border-b border-gray-800">
            <span className="col-span-2">Cliente</span>
            <span>Teléfono</span>
            <span>Límite</span>
            <span>Estado</span>
            <span></span>
          </div>

          {clientesFiltrados.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-600">
              {buscador ? 'Sin resultados' : 'No hay clientes registrados aún'}
            </div>
          ) : (
            clientesFiltrados.map((c) => {
              const isEditing = editando === c.id
              return (
                <div key={c.id}>
                  {/* Fila */}
                  <div className="grid grid-cols-6 gap-3 px-5 py-4 border-b border-gray-800 items-center text-sm">
                    <div className="col-span-2">
                      <div className="text-white font-medium">{c.nombre}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{c.usuario}</div>
                    </div>
                    <div className="text-gray-400">{c.telefono || '—'}</div>
                    <div className="text-gray-400">
                      {c.limite_credito >= 99999 ? 'Sin límite' : `$${c.limite_credito?.toLocaleString()}`}
                    </div>
                    <div>
                      <button onClick={() => toggleActivo(c)}
                        className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer border ${c.activo ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>
                        {c.activo ? '● Activo' : '○ Inactivo'}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button onClick={() => isEditing ? setEditando(null) : abrirEdicion(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${isEditing ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-indigo-900/30 text-indigo-400 border-indigo-800/50 hover:bg-indigo-900/50'}`}>
                        {isEditing ? 'Cerrar' : '✏️ Editar'}
                      </button>
                    </div>
                  </div>

                  {/* Panel edición inline */}
                  {isEditing && (
                    <div className="border-b border-gray-800 bg-gray-900/60 px-5 py-5">
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className={lStyle}>Nombre completo *</label>
                          <input type="text" value={edit.nombre}
                            onChange={e => setEdit({...edit, nombre: e.target.value})}
                            className={iStyle} />
                        </div>
                        <div>
                          <label className={lStyle}>Usuario</label>
                          <input type="text" value={edit.usuario}
                            onChange={e => setEdit({...edit, usuario: e.target.value.toLowerCase().replace(/\s/g, '.')})}
                            className={iStyle} />
                          {clientes.some(c => c.usuario === edit.usuario && c.id !== editando) && (
                            <div className="text-red-400 text-xs mt-1">Este usuario ya está en uso</div>
                          )}
                        </div>
                        <div>
                          <label className={lStyle}>Teléfono WhatsApp</label>
                          <input type="text" value={edit.telefono}
                            onChange={e => setEdit({...edit, telefono: e.target.value})}
                            className={iStyle} />
                        </div>
                        <div>
                          <label className={lStyle}>Celular de contacto</label>
                          <input type="text" value={edit.celular_contacto}
                            onChange={e => setEdit({...edit, celular_contacto: e.target.value})}
                            className={iStyle} />
                        </div>
                        <div>
                          <label className={lStyle}>Límite de crédito</label>
                          <select value={edit.limite_credito}
                            onChange={e => setEdit({...edit, limite_credito: Number(e.target.value)})}
                            className={iStyle}>
                            {creditsOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lStyle}>Estado</label>
                          <select value={edit.activo ? 'true' : 'false'}
                            onChange={e => setEdit({...edit, activo: e.target.value === 'true'})}
                            className={iStyle}>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <input type="checkbox" checked={edit.requiere_anticipo}
                            onChange={e => setEdit({...edit, requiere_anticipo: e.target.checked})}
                            className="w-4 h-4 accent-indigo-500" />
                          <label className="text-gray-400 text-sm">Requiere anticipo</label>
                        </div>
                        <div className="col-span-2">
                          <label className={lStyle}>Nueva contraseña (dejar vacío para no cambiar)</label>
                          <input type="password" value={edit.password} placeholder="••••••••"
                            onChange={e => setEdit({...edit, password: e.target.value})}
                            className={iStyle} />
                        </div>
                      </div>
                      {msgEdit && <div className="text-red-400 text-sm mb-3">{msgEdit}</div>}
                      <div className="flex gap-3">
                        <button onClick={guardarEdicion}
                          className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
                          ✓ Guardar cambios
                        </button>
                        <button onClick={() => setEditando(null)}
                          className="bg-gray-800 text-gray-300 px-4 py-2 rounded-xl text-sm">
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
