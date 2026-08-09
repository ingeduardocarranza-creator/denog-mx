'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AperturaCaja() {
  const [efectivo, setEfectivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const manejarApertura = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/pos/apertura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ efectivoInicial: Number(efectivo) || 0 })
      });

      if (res.ok) {
        router.push('/admin/punto-venta');
      } else {
        setError('No se pudo abrir la caja.');
      }
    } catch (err) {
      setError('Error de comunicación con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4 shadow-xl">
        <div className="text-center">
          <h1 className="text-lg font-bold text-white">☀️ Apertura de Turno</h1>
          <p className="text-xs text-gray-400 mt-1">Registra el efectivo inicial para abrir la caja</p>
        </div>

        {error && <div className="p-3 bg-red-900 text-red-400 border border-red-800 rounded-xl text-xs text-center font-bold">{error}</div>}

        <form onSubmit={manejarApertura} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-gray-400 font-bold uppercase text-[10px]">Efectivo Inicial en Caja (MXN)</label>
            <input type="number" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} placeholder="0.00 (Si no hay, pon 0)" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-[#c1553a] hover:bg-[#9b3f28] text-white font-bold py-3.5 rounded-xl uppercase tracking-widest transition-all text-xs">
            {loading ? 'Registrando...' : '🚀 Abrir Caja e Ir a Ventas'}
          </button>
        </form>
      </div>
    </div>
  );
}