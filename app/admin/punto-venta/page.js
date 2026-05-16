'use client'
import { useState } from 'react'

export default function PuntoDeVenta() {
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [pagos, setPagos] = useState([{ metodo: 'efectivo', monto: '' }])
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  const buscarCliente = async () => {
    if (!busqueda) return
    const res = await fetch('/api/clientes/buscar?q=' + busqueda)
    const data = await res.json()
    setClientes(data.clientes || [])
  }

  const seleccionarCliente = async (cliente) => {
    setClienteSeleccionado(cliente)
    setClientes([])
    setBusqueda(cliente.nombre)
    const res = await fetch('/api/punto-venta?cliente_id=' + cliente.id)
    const data = await res.json()
    setPedidos(data.pedidos || [])
  }

  const totalPedidos = pedidos.reduce((s, p) => s + (p.precio_venta || 0), 0)
  const totalPagado = pagos.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
  const diferencia = totalPedidos - totalPagado

  const agregarMetodoPago = () => setPagos([...pagos, { metodo: 'efectivo', monto: '' }])

  const actualizarPago = (index, campo, valor) => {
    const nuevos = [...pagos]
    nuevos[index][campo] = valor
    setPagos(nuevos)
  }

  const registrarPago = async () => {
    if (!clienteSeleccionado || pedidos.length === 0) return
    if (totalPagado <= 0) { setMensaje('Ingresa el monto a pagar'); return }
    setCargando(true)
    const entrega_id = pedidos[0] ? pedidos[0].entrega_id : null
    const res = await fetch('/api/punto-venta/pagar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteSeleccionado.id,
        entrega_id: entrega_id,
        pagos: pagos.filter(p => parseFloat(p.monto) > 0)
      })
    })
    const data = await res.json()
    setCargando(false)
    if (data.ok) {
      setMensaje('Pago registrado correctamente')
      setPedidos([])
      setClienteSeleccionado(null)
      setBusqueda('')
      setPagos([{ metodo: 'efectivo', monto: '' }])
    } else {
      setMensaje('Error: ' + data.mensaje)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <h1 className="text-2xl font-bold text-blue-400 mb-6">Punto de Venta</h1>

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

      {pedidos.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-4">
          <p className="text-gray-400 text-sm mb-3">Pedidos pendientes</p>
          {pedidos.map(p => (
            <div key={p.id} className="flex justify-between py-2 border-b border-gray-800">
              <div>
                <p className="text-white text-sm">{p.descripcion}</p>
                <p className="text-gray-500 text-xs">{p.lugar_compra} - {p.estado}</p>
              </div>
              <p className="text-white font-medium">${p.precio_venta}</p>
            </div>
          ))}
          <div className="flex justify-between mt-3 pt-2">
            <p className="text-gray-400">Total a cobrar</p>
            <p className="text-blue-400 font-bold text-lg">${totalPedidos}</p>
          </div>
        </div>
      )}

      {pedidos.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-4">
          <p className="text-gray-400 text-sm mb-3">Forma de pago</p>
          {pagos.map((p, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <select className="bg-gray-800 text-white rounded-lg px-3 py-2 outline-none" value={p.metodo} onChange={e => actualizarPago(i, 'metodo', e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="terminal">Terminal</option>
              </select>
              <input
                type="number"
                placeholder="Monto"
                className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-2 outline-none"
                value={p.monto}
                onChange={e => actualizarPago(i, 'monto', e.target.value)}
              />
            </div>
          ))}
          <button onClick={agregarMetodoPago} className="text-blue-400 text-sm mt-1">
            + Agregar otro metodo
          </button>
          <div className="flex justify-between mt-4 pt-3 border-t border-gray-800">
            <p className="text-gray-400">Total pagado</p>
            <p className="font-bold text-lg text-green-400">${totalPagado}</p>
          </div>
          {diferencia > 0 && <p className="text-yellow-500 text-sm mt-1 text-right">Falta: ${diferencia}</p>}
          {diferencia < 0 && <p className="text-green-400 text-sm mt-1 text-right">Cambio: ${Math.abs(diferencia)}</p>}
        </div>
      )}

      {pedidos.length > 0 && (
        <button onClick={registrarPago} disabled={cargando} className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-xl font-bold text-lg">
          {cargando ? 'Registrando...' : 'Registrar Pago'}
        </button>
      )}

      {mensaje && <div className="mt-4 bg-gray-800 rounded-xl p-4 text-center">{mensaje}</div>}
    </div>
  )
}
