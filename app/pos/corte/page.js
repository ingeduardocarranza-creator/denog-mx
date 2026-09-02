'use client';

import { useState, useEffect } from 'react';

export default function CorteDeCaja() {
  const [totales, setTotales] = useState({ inicial: 0, efectivo: 0, transferencia: 0, terminal: 0, esperado: 0 });
  const [ventas, setVentas] = useState([]);
  const [efectivoContado, setEfectivoContado] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    async function cargarCorte() {
      const res = await fetch('/api/pos/corte');
      const data = await res.json();
      if (data.totales) setTotales(data.totales);
      if (data.ventas) setVentas(data.ventas);
    }
    cargarCorte();
  }, []);

  const dineroContado = Number(efectivoContado) || 0;
  const diferencia = dineroContado - totales.esperado;

  const ejecutarCierre = async () => {
    setLoading(true);
    try {
      await fetch('/api/pos/corte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efectivoContado: dineroContado, diferencia })
      });
      setMensaje('✓ Turno cerrado e historial guardado de forma exitosa en Supabase.');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* COLUMNA CÁLCULOS DE SISTEMA */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">Arqueo General de Caja</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800"><p className="text-gray-400 font-semibold">Fondo Inicial</p><p className="text-base font-bold tabular-nums mt-1">${totales.inicial}</p></div>
              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800"><p className="text-gray-400 font-semibold">Ventas Efectivo</p><p className="text-base font-bold tabular-nums mt-1 text-green-400">+${totales.efectivo}</p></div>
              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800"><p className="text-gray-400 font-semibold">Transferencias</p><p className="text-base font-bold tabular-nums mt-1 text-blue-400">${totales.transferencia}</p></div>
              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800"><p className="text-gray-400 font-semibold">Cobros Terminal</p><p className="text-base font-bold tabular-nums mt-1 text-purple-400">${totales.terminal}</p></div>
            </div>
          </div>

          {/* DESGLOSE DETALLADO DE OPERACIONES */}
          <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Historial de Ventas del Turno (Identificación Fácil)</h2>
            <div className="divide-y divide-gray-800 text-xs">
              {ventas.length === 0 ? (
                <p className="text-gray-500 py-3 italic">No se han registrado cobros en este turno todavía.</p>
              ) : (
                ventas.map((v, i) => (
                  <div key={i} className="py-3.5 flex justify-between items-center hover:bg-gray-800/10 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-200">
                          {v.clientes?.nombre ? `📦 Liquidación: ${v.clientes.nombre}` : '⚡ Venta Rápida (Tienda)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-3">
                        <span>{v.metodo === 'Efectivo' ? '💵 Efectivo' : v.metodo === 'Transferencia' ? '📱 Transferencia' : '💳 Terminal'}</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-500 tabular-nums">Hora: {v.creado_a_hora || 'Reciente'}</span>
                      </p>
                    </div>
                    <p className="font-black text-white tabular-nums text-sm">${Number(v.monto).toFixed(0)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CONTEO FÍSICO Y CIERRE */}
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 h-fit space-y-4 shadow-xl">
          <h2 className="text-xs font-bold text-gray-400 uppercase border-b border-gray-800 pb-2">Cierre de Caja</h2>
          <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs flex justify-between items-center"><span className="text-gray-400 font-bold">Efectivo Esperado:</span><span className="font-bold tabular-nums text-sm text-blue-400">${totales.esperado}</span></div>
          <div className="space-y-1.5 text-xs">
            <label className="text-gray-400 font-bold block">Efectivo Contado en Físico *</label>
            <input type="number" value={efectivoContado} onChange={(e) => setEfectivoContado(e.target.value)} placeholder="$ Ingresa lo contado" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white tabular-nums text-sm focus:outline-none" />
          </div>
          {efectivoContado && (
            <div className={`p-3 rounded-xl text-xs font-bold flex justify-between items-center ${diferencia === 0 ? 'bg-green-900/40 text-green-400 border border-green-800' : 'bg-red-900/40 text-red-400 border border-red-800'}`}>
              <span>Diferencia:</span>
              <span className="tabular-nums text-sm">{diferencia >= 0 ? `+$${diferencia}` : `-$${Math.abs(diferencia)}`}</span>
            </div>
          )}
          {mensaje && <div className="p-3 bg-[#4a1b0c] text-[#dd8a6c] text-xs font-bold rounded-xl text-center">{mensaje}</div>}
          <button onClick={ejecutarCierre} disabled={loading || !efectivoContado} className="w-full bg-red-700 hover:bg-red-800 sobre-color text-xs font-bold py-3 rounded-xl uppercase tracking-widest transition-all shadow-md disabled:opacity-40">
            {loading ? 'Cerrando...' : '⛔ Cerrar Turno y Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}