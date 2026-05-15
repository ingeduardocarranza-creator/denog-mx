'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [buscador, setBuscador] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nuevo, setNuevo] = useState({
    nombre: '', telefono: '', usuario: '', password: '',
    limite_credito: 3000, requiere_anticipo: false
  })
  const [cargando, setCargando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { cargarClientes() }, [])

  const cargarClientes = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre')
    if (data) setClientes(data)
  }

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(buscador.toLowerCase()) ||
    c.usuario?.toLowerCase().includes(buscador.toLowerCase()) ||
    c.telefono?.includes(buscador)
  )

  const guardar = async () => {
    if (!nuevo.nombre || !nuevo.usuario || !nuevo.password) {
      setMsg('Nombre, usuario y contraseña son obligatorios')
      return
    }
    setCargando(true)
    const res = await fetch('/api/clientes/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevo)
    })
    const data = await res.json()
    if (data.ok) {
      setMsg('Cliente creado ✓')
      setNuevo({ nombre: '', telefono: '', usuario: '', password: '', limite_credito: 3000, requiere_anticipo: false })
      setMostrarForm(false)
      cargarClientes()
    } else {
      setMsg(data.mensaje || 'Error al crear cliente')
    }
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="text-white text-2xl font-semibold">Clientes</div>
            <div className="text-gray-400 text-sm">{clientes.length} clientes registrados</div>
          </div>
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            + Nuevo cliente
          </button>
        </div>

        {mostrarForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <div className="text-white font-medium mb-4">Nuevo cliente</div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-gray-400 text-sm block mb-1">Nombre completo</label>
                <input type="text" value={nuevo.nombre}
                  onChange={e => setNuevo({...nuevo, nombre: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                  placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Teléfono WhatsApp</label>
                <input type="text" value={nuevo.telefono}
                  onChange={e => setNuevo({...nuevo, telefono: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                  placeholder="662 000 0000" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Usuario portal</label>
                <input type="text" value={nuevo.usuario}
                  onChange={e => setNuevo({...nuevo, usuario: e.target.value.toLowerCase().replace(/\s/g, '.')})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                  placeholder="nombre.apellido" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Contraseña inicial</label>
                <input type="text" value={nuevo.password}
                  onChange={e => setNuevo({...nuevo, password: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                  placeholder="Contraseña temporal" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1">Límite de crédito</label>
                <select value={nuevo.limite_credito}
                  onChange={e => setNuevo({...nuevo, limite_credito: Number(e.target.value)})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                  <option value={1500}>$1,500 — Conservador</option>
                  <option value={3000}>$3,000 — Estándar</option>
                  <option value={5000}>$5,000 — Amplio</option>
                  <option value={99999}>Sin límite</option>
                </select>
              </div>
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" checked={nuevo.requiere_anticipo}
                  onChange={e => setNuevo({...nuevo, requiere_anticipo: e.target.checked})}
                  className="w-4 h-4" />
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

        <div className="mb-4">
          <input type="text" value={buscador} onChange={e => setBuscador(e.target.value)}
            placeholder="Buscar por nombre, usuario o teléfono..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm" />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-6 py-3 text-gray-500 text-xs uppercase border-b border-gray-800">
            <span>Cliente</span>
            <span>Usuario</span>
            <span>Teléfono</span>
            <span>Límite</span>
            <span>Estado</span>
          </div>
          {clientesFiltrados.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-600">
              {buscador ? 'Sin resultados' : 'No hay clientes registrados aún'}
            </div>
          ) : (
            clientesFiltrados.map(c => (
              <div key={c.id} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-gray-800 last:border-0 text-sm">
                <div className="text-white font-medium">{c.nombre}</div>
                <div className="text-gray-400">{c.usuario}</div>
                <div className="text-gray-400">{c.telefono || '—'}</div>
                <div className="text-gray-400">${c.limite_credito?.toLocaleString()}</div>
                <div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.activo ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                    {c.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}