'use client'
import { useState, useEffect } from 'react'

export default function Pedidos() {
  const hoy = new Date().toISOString().split('T')[0]
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [tc, setTc] = useState(19.45)
  const [estado, setEstado] = useState('az')
  const [form, setForm] = useState({
    cliente_id: '', entrega_id: '', descripcion: '',
    lugar_compra: 'Ross', cantidad: 1, fecha_compra: hoy,
    precio_usd: '', precio_venta: '', notas: ''
  })
  const [calc, setCalc] = useState({ costo_mx: 0, impuesto: 0, utilidad: 0, margen: 0 })
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => { if (d.ok) setClientes(d.clientes) })
    fetch('/api/entregas').then(r => r.json()).then(d => { if (d.ok) setEntregas(d.entregas) })
  }, [])

  useEffect(() => {
    const imp = estado === 'az' ? 0.086 : 0.0775
    const usd = parseFloat(form.precio_usd) || 0
    const venta = parseFloat(form.precio_venta) || 0
    const costoBase = usd * tc
    const impMonto = costoBase * imp
    const costoTotal = costoBase + impMonto
    const util = venta - costoTotal
    const margen = venta > 0 ? (util / venta) * 100 : 0
    setCalc({ costo_mx: costoTotal, impuesto: impMonto, utilidad: util, margen })
  }, [form.precio_usd, form.precio_venta, tc, estado])

  const guardar = async () => {
    if (!form.cliente_id || !form.entrega_id || !form.descripcion) {
      setMsg('Cliente, entrega y descripción son obligatorios'); return
    }
    setCargando(true)
    const imp = estado === 'az' ? 0.086 : 0.0775
    const res = await fetch('/api/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        fecha_compra: form.fecha_compra || hoy,
        precio_usd: parseFloat(form.precio_usd) || 0,
        tipo_cambio: tc,
        impuesto_pct: imp * 100,
        costo_mxn: calc.costo_mx,
        precio_venta: parseFloat(form.precio_venta) || 0,
        utilidad: calc.utilidad
      })
    })
    const data = await res.json()
    if (data.ok) {
      setMsg('✓ Pedido guardado')
      setForm({ cliente_id: form.cliente_id, entrega_id: form.entrega_id, descripcion: '',
        lugar_compra: form.lugar_compra, cantidad: 1, fecha_compra: hoy,
        precio_usd: '', precio_venta: '', notas: '' })
    } else {
      setMsg(data.mensaje || 'Error')
    }
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-white text-2xl font-semibold mb-6">Captura de pedidos</div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">TC:</span>
            <input type="number" value={tc} onChange={e => setTc(parseFloat(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-white text-sm w-24" step="0.01" />
            <span className="text-gray-500 text-sm">MXN</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEstado('az')}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${estado === 'az' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
              Arizona 8.6%
            </button>
            <button onClick={() => setEstado('ca')}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${estado === 'ca' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'}`}>
              California 7.75%
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cliente</label>
              <select value={form.cliente_id} onChange={e => setForm({...form, cliente_id: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                <option value="">— Selecciona —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Entrega</label>
              <select value={form.entrega_id} onChange={e => setForm({...form, entrega_id: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                <option value="">— Selecciona —</option>
                {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Descripción del producto</label>
            <input type="text" value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
              placeholder="Ej: Pantalón Nine West talla 10 azul oscuro" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Lugar de compra</label>
              <select value={form.lugar_compra} onChange={e => setForm({...form, lugar_compra: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                {['Ross','TJ Maxx','Marshalls','Target','Walmart','Costco','Old Navy','Otro'].map(l =>
                  <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cantidad</label>
              <input type="number" value={form.cantidad} onChange={e => setForm({...form, cantidad: parseInt(e.target.value)})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm" min="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Precio USD <span className="text-blue-400">(principal)</span></label>
              <input type="number" value={form.precio_usd} onChange={e => setForm({...form, precio_usd: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                placeholder="0.00" step="0.01" />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Precio de venta MXN</label>
              <input type="number" value={form.precio_venta} onChange={e => setForm({...form, precio_venta: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                placeholder="0" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Fecha de compra</label>
            <input type="date" value={form.fecha_compra} onChange={e => setForm({...form, fecha_compra: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm" />
          </div>

          {calc.costo_mx > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 mb-4 text-sm">
              <div className="flex justify-between text-gray-400 mb-1"><span>Costo USD × TC</span><span>${(parseFloat(form.precio_usd)*tc).toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-400 mb-1"><span>+ Impuesto {estado === 'az' ? '8.6%' : '7.75%'}</span><span>+${calc.impuesto.toFixed(2)}</span></div>
              <div className="flex justify-between text-white font-medium mb-2"><span>Costo total MXN</span><span>${calc.costo_mx.toFixed(2)}</span></div>
              <div className="border-t border-gray-700 pt-2 flex justify-between">
                <span className="text-green-400 font-medium">Utilidad</span>
                <span className={`font-medium ${calc.utilidad >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${calc.utilidad.toFixed(2)} ({calc.margen.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Notas internas</label>
            <input type="text" value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
              placeholder="Notas opcionales..." />
          </div>

          {msg && <div className={`text-sm mb-3 ${msg.includes('✓') ? 'text-green-400' : 'text-yellow-400'}`}>{msg}</div>}

          <div className="flex gap-3">
            <button onClick={guardar} disabled={cargando}
              className="bg-green-700 hover:bg-green-600 text-white px-6 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              {cargando ? 'Guardando...' : '✓ Guardar pedido'}
            </button>
            <button onClick={guardar}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">
              Guardar y capturar otro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}