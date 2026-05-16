'use client'
import { useState, useEffect } from 'react'

export default function Entregas() {
  const [entregas, setEntregas] = useState([])
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  const cargarEntregas = async () => {
    const res = await fetch('/api/admin/entregas')
    const data = await res.json()
    setEntregas(data.entregas || [])
  }

  useEffect(() => {
    cargarEntregas()
  }, [])

  const crearEntrega = async () => {
    if (!fecha) { setMensaje('Selecciona una fecha'); return }
    setCargando(true)
    const res = await fetch('/api/admin/entregas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_entrega: fecha, nota })
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      setMensaje('Entrega creada correctamente')
      setFecha('')
      setNota('')
      cargarEntregas()
    } else {
      setMensaje('Error: ' + data.mensaje)
    }
  }

  const cambiarEstado = async (id, estado) => {
    await fetch('/api/admin/entregas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargarEntregas()
  }

  const colorEstado = (estado) => {
    if (estado === 'pendiente') return 'bg-yellow-900 text-yellow-400'
    if (estado === 'en camino') return 'bg-blue-900 text-blue-400'
    if (estado === 'entregado') return 'bg-green-900 text-green-400'
    return 'bg-gray-800 text-gray-400'
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <h1 className="text-2xl font-bold text-blue-400 mb-6">Gestion de Entregas</h1>

      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-gray-400 text-sm mb-3">Nueva entrega</p>
        <div className="flex flex-col gap-3">
          <input
            type="date"
            className="bg-gray-800 text-white rounded-lg px-4 py-2 outline-none"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
          <input
            type="text"
            placeholder="Nota opcional (ej: Entrega Hermosillo Norte)"
            className="bg-gray-800 text-white rounded-lg px-4 py-2 outline-none"
            value={nota}
            onChange={e => setNota(e.target.value)}
          />
          <button
            onClick={crearEntrega}
            disabled={cargando}
            className="bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium"
          >
            {cargando ? 'Creando...' : 'Crear Entrega'}
          </button>
        </div>
        {mensaje && <p className="text-center mt-3 text-sm text-green-400">{mensaje}</p>}
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <p className="text-gray-400 text-sm mb-3">Entregas registradas</p>
        {entregas.length === 0 && <p className="text-gray-600 text-center py-4">No hay entregas aun</p>}
        {entregas.map(e => (
          <div key={e.id} className="border-b border-gray-800 py-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-white font-medium">{e.fecha_entrega}</p>
                {e.nota && <p className="text-gray-400 text-sm">{e.nota}</p>}
              </div>
              <span className={'text-xs px-2 py-1 rounded-full ' + colorEstado(e.estado)}>
                {e.estado}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => cambiarEstado(e.id, 'pendiente')}
                className="text-xs bg-gray-800 hover:bg-yellow-900 text-yellow-400 px-3 py-1 rounded-lg"
              >
                Pendiente
              </button>
              <button
                onClick={() => cambiarEstado(e.id, 'en camino')}
                className="text-xs bg-gray-800 hover:bg-blue-900 text-blue-400 px-3 py-1 rounded-lg"
              >
                En camino
              </button>
              <button
                onClick={() => cambiarEstado(e.id, 'entregado')}
                className="text-xs bg-gray-800 hover:bg-green-900 text-green-400 px-3 py-1 rounded-lg"
              >
                Entregado
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
