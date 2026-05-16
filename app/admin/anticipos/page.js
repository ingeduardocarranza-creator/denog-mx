'use client'
import { useState } from 'react'

export default function Anticipos() {
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('efectivo')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  const buscarCliente = async () => {
    if (!busqueda) return
    const res = await fetch('/api/clientes/buscar?q=' + busqueda)
    const data = await res.json()
    setClientes(data.clientes || [])
  }

  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente)
    setClientes([])
    setBusqueda(cliente.nombre)
  }

  const registrarAnticipo = async () => {
    if (!clienteSeleccionado) { setMensaje('Selecciona un cliente'); return }
    if (!monto || parseFloat(monto) <= 0) { setMensaje('Ingresa un monto valido'); return }
    setCargando(true)
    const res = await fetch('/api/anticipos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteSeleccionado.id,
        monto: parseFloat(monto),
        metodo: metodo
      })
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      setMensaje('Anticipo registrado correctamente')
      setClienteSeleccionado(null)
      setBusqueda('')
      setMonto('')
      setMetodo('efectivo')
    } else {
      setMensaje('Error: ' + data.mensaje)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <h1 className="text-2xl font-bold text-blue-400 mb-6">Anticipos</h1>

      <div className="bg-gray-900 rounded-xl p-4 mb-4">
        <p className="text-gray-400 text-sm mb-2">Buscar cliente</p>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 outline-none"
            placeholder="Nombre del cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarCliente()}
          />
          <button onClick={buscarCliente} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium">
            Buscar
          </button>
        </div>
        {clientes.map(c => (
          <div key={c.id} onClick={() => seleccionarCliente(c)} className="mt-2 bg-gray-800 hover:bg-gray-700 cursor-pointer rounded-lg px-4 py-2">
            {c.nombre} - {c.usuario}
          </div>
        ))}
      </div>

      {clienteSeleccionado && (
        <div className="bg-gray-900 rounded-xl p-4 mb-4">
          <p className="text-gray-400 text-sm mb-4">Registrar anticipo para <span className="text-white font-medium">{clienteSeleccionado.nombre}</span></p>

          <div className="flex gap-2 mb-4">
            <select
              className="bg-gray-800 text-white rounded-lg px-3 py-2 outline-none"
              value={metodo}
              onChange={e => setMetodo(e.target.value)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="terminal">Terminal</option>
            </select>
            <input
              type="number"
              placeholder="Monto del anticipo"
              className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 outline-none"
              value={monto}
              onChange={e => setMonto(e.target.value)}
            />
          </div>

          <button
            onClick={registrarAnticipo}
            disabled={cargando}
            className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-xl font-bold text-lg"
          >
            {cargando ? 'Registrando...' : 'Registrar Anticipo'}
          </button>
        </div>
      )}

      {mensaje && <div className="mt-4 bg-gray-800 rounded-xl p-4 text-center">{mensaje}</div>}
    </div>
  )
}
