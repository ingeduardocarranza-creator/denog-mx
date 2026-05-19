'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function RegistroAnticipos() {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const [clientes, setClientes] = useState([]);
  const [entregas, setEntregas] = useState([]);

  // Campos del formulario
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('Transferencia');
  
  // FECHA DEL ANTICIPO (POR DEFAULT HOY EN FORMATO YYYY-MM-DD)
  const [fechaAnticipo, setFechaAnticipo] = useState(() => {
    const hoy = new Date();
    const offset = hoy.getTimezoneOffset();
    const fechaLocal = new Date(hoy.getTime() - (offset * 60 * 1000));
    return fechaLocal.toISOString().split('T')[0];
  });

  useEffect(() => {
    async function cargarDatos() {
      const { data: cl } = await supabase.from('clientes').select('*').order('nombre', { ascending: true });
      const { data: en } = await supabase.from('entregas').select('*').order('fecha_entrega', { ascending: false });
      setClientes(cl || []);
      setEntregas(en || []);
    }
    cargarDatos();
  }, []);

  const registrarAnticipo = async (e) => {
    e.preventDefault();
    if (!clienteSeleccionado || !monto || Number(monto) <= 0 || !fechaAnticipo) {
      setMensaje({ tipo: 'error', texto: 'Por favor llena los campos obligatorios (*)' });
      return;
    }

    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    try {
      // Creamos el timestamp correcto usando la fecha elegida por el usuario y la hora actual
      const horaActual = new Date().toLocaleTimeString('es-MX', { hour12: false });
      const creadoEnFusionado = `${fechaAnticipo}T${horaActual}.000Z`;

      const { error } = await supabase.from('pagos').insert({
        cliente_id: clienteSeleccionado,
        entrega_id: entregaSeleccionada || null,
        monto: Number(monto),
        metodo: metodoPago,
        tipo: 'Anticipo',
        creado_en: creadoEnFusionado
      });

      if (error) throw error;

      setMensaje({ tipo: 'exito', texto: '¡Anticipo registrado y vinculado con éxito!' });
      
      setClienteSeleccionado('');
      setEntregaSeleccionada('');
      setMonto('');
      setMetodoPago('Transferencia');
      // Resetear a la fecha de hoy
      const hoy = new Date();
      setFechaAnticipo(new Date(hoy.getTime() - (hoy.getTimezoneOffset() * 60 * 1000)).toISOString().split('T')[0]);

    } catch (err) {
      console.error(err);
      setMensaje({ tipo: 'error', texto: 'Hubo un error al registrar en la base de datos.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans flex items-center justify-center">
      <div className="max-w-md w-full bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-2xl space-y-5">
        
        <div>
          <h1 className="text-lg font-bold text-white">💰 Registro de Anticipos</h1>
          <p className="text-xs text-gray-400 mt-1">Abona dinero a un cliente, define la fecha y vincúlalo a un estado de cuenta.</p>
        </div>

        {mensaje.texto && (
          <div className={`p-3.5 rounded-xl text-xs font-semibold text-center border ${
            mensaje.tipo === 'exito' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'
          }`}>
            {mensaje.texto}
          </div>
        )}

        <form onSubmit={registrarAnticipo} className="space-y-4">
          
          {/* SELECCIONAR CLIENTE */}
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Seleccionar Cliente *</label>
            <select value={clienteSeleccionado} onChange={(e) => setClienteSeleccionado(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 text-xs focus:outline-none">
              <option value="">-- Elige un cliente --</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} {c.telefono ? `(${c.telefono})` : ''}</option>
              ))}
            </select>
          </div>

          {/* FECHA DEL ANTICIPO */}
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Fecha del Anticipo *</label>
            <input type="date" value={fechaAnticipo} onChange={(e) => setFechaAnticipo(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 text-xs focus:outline-none font-mono" />
          </div>

          {/* SELECCIONAR ESTADO DE CUENTA / ENTREGA */}
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Vincular a Estado de Cuenta (Fecha de Entrega)</label>
            <select value={entregaSeleccionada} onChange={(e) => setEntregaSeleccionada(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 text-xs focus:outline-none">
              <option value="">Ninguno / Anticipo General</option>
              {entregas.map(e => {
                const fechaFormateada = new Date(e.fecha_entrega).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
                return <option key={e.id} value={e.id}>Entrega del {fechaFormateada}</option>;
              })}
            </select>
          </div>

          {/* MONTO DEL ANTICIPO */}
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Monto del Anticipo ($ MXN) *</label>
            <input type="number" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white font-mono rounded-xl p-3 text-xs focus:outline-none" />
          </div>

          {/* MÉTODO DE PAGO */}
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Método de Recibo</label>
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 text-xs focus:outline-none">
              <option value="Transferencia">📱 Transferencia</option>
              <option value="Efectivo">💵 Efectivo</option>
              <option value="Terminal">💳 Terminal</option>
            </select>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3.5 rounded-xl uppercase tracking-widest transition-all shadow-lg disabled:opacity-40">
            {loading ? 'Guardando...' : '✓ Registrar Anticipo'}
          </button>

        </form>
      </div>
    </div>
  );
}