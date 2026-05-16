'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Conexión directa y segura con tus variables de entorno
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ScoreClientes() {
  const [clientesCalificados, setClientesCalificados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarYCalcularScore() {
      setLoading(true);

      // 1. Descargar datos de tus tablas de Supabase
      const { data: dataClientes } = await supabase.from('clientes').select('*');
      const { data: dataPedidos } = await supabase.from('pedidos').select('*');
      const { data: dataPagos } = await supabase.from('pagos').select('*');
      const { data: dataEntregas } = await supabase.from('entregas').select('*');

      const dbClientes = dataClientes || [];
      const dbPedidos = dataPedidos || [];
      const dbPagos = dataPagos || [];
      const dbEntregas = dataEntregas || [];

      const hoy = new Date();

      // 2. Aplicar las matemáticas del negocio a cada cliente
      const resultado = dbClientes.map(cliente => {
        const pedidosCliente = dbPedidos.filter(p => p.cliente_id === cliente.id);
        const pagosCliente = dbPagos.filter(p => p.cliente_id === cliente.id);

        // --- FRECUENCIA DE COMPRA (25%) ---
        const viajesComprados = new Set(pedidosCliente.map(p => p.entrega_id)).size;
        let puntosFrecuencia = 0;
        if (viajesComprados >= 5) puntosFrecuencia = 25;
        else if (viajesComprados >= 3) puntosFrecuencia = 18;
        else if (viajesComprados >= 1) puntosFrecuencia = 10;

        // --- VOLUMEN DE COMPRA (25%) ---
        const totalDineroComprado = pedidosCliente.reduce((acc, p) => acc + (Number(p.precio_venta) || 0), 0);
        let puntosVolumen = 0;
        if (totalDineroComprado >= 20000) puntosVolumen = 25;
        else if (totalDineroComprado >= 10000) puntosVolumen = 18;
        else if (totalDineroComprado >= 3000) puntosVolumen = 10;
        else if (totalDineroComprado > 0) puntosVolumen = 5;

        // --- HISTORIAL DE DEUDAS (10%) ---
        const totalPagado = pagosCliente.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
        const deudaActual = totalDineroComprado - totalPagado;
        let puntosDeuda = 10;
        if (deudaActual > (Number(cliente.limite_credito) || 0)) {
          puntosDeuda = 0; 
        } else if (deudaActual > 0) {
          puntosDeuda = 7; 
        }

        // --- PUNTUALIDAD DE PAGO (40%) ---
        let pedidosEvaluados = 0;
        let pedidosPagadosATiempo = 0;

        pedidosCliente.forEach(pedido => {
          const entregaAsociada = dbEntregas.find(e => e.id === pedido.entrega_id);
          if (!entregaAsociada) return;

          const fechaEntrega = new Date(entregaAsociada.fecha_entrega);
          const fechaLimite = new Date(fechaEntrega);
          fechaLimite.setDate(fechaLimite.getDate() + 7); // Los 7 días de tolerancia en Hermosillo

          if (hoy > fechaLimite) {
            pedidosEvaluados++;
            if (pedido.estado === 'Entregado' || pedido.estado === 'Pagado') {
              pedidosPagadosATiempo++;
            }
          }
        });

        let puntosPuntualidad = 40; 
        if (pedidosEvaluados > 0) {
          puntosPuntualidad = (pedidosPagadosATiempo / pedidosEvaluados) * 40;
        }

        // Cálculo Final del Score
        const scoreFinal = Math.round(puntosPuntualidad + puntosFrecuencia + puntosVolumen + puntosDeuda);

        // Clasificación Visual
        let categoria = 'Riesgo';
        let colorBadge = 'bg-red-100 text-red-800 border-red-200';
        
        if (scoreFinal >= 85) {
          categoria = 'VIP ⭐';
          colorBadge = 'bg-purple-100 text-purple-800 border-purple-200';
        } else if (scoreFinal >= 70) {
          categoria = 'Buen cliente';
          colorBadge = 'bg-green-100 text-green-800 border-green-200';
        } else if (scoreFinal >= 50) {
          categoria = 'Vigilar';
          colorBadge = 'bg-amber-100 text-amber-800 border-amber-200';
        }

        return {
          id: cliente.id,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          score: scoreFinal,
          categoria,
          colorBadge,
          totalComprado: totalDineroComprado,
          deuda: deudaActual > 0 ? deudaActual : 0
        };
      });

      // Ordenar del cliente más confiable al menos confiable
      resultado.sort((a, b) => b.score - a.score);
      setClientesCalificados(resultado);
      setLoading(false);
    }

    cargarYCalcularScore();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-600 font-sans">Analizando comportamiento de clientes...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gray-50 min-h-screen font-sans">
      
      {/* Encabezado */}
      <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800">Score de Confianza de Clientes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Algoritmo automatizado de Denog: Puntualidad (40%), Frecuencia (25%), Volumen (25%) e Historial Crediticio (10%).
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-400 font-semibold uppercase text-xs">
                <th className="p-4">Cliente</th>
                <th className="p-4 text-center">Score / 100</th>
                <th className="p-4 text-center">Clasificación</th>
                <th className="p-4 text-right">Total Histórico</th>
                <th className="p-4 text-right">Deuda Actual</th>
                <th className="p-4 text-center">Contacto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {clientesCalificados.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-semibold text-gray-800">{c.nombre}</td>
                  
                  {/* Score en número y barra */}
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className={`font-bold text-base ${c.score >= 70 ? 'text-green-600' : c.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {c.score}
                      </span>
                      <div className="w-16 bg-gray-200 h-2 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          className={`h-full ${c.score >= 85 ? 'bg-purple-500' : c.score >= 70 ? 'bg-green-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${c.score}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Insignia de categoría */}
                  <td className="p-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${c.colorBadge}`}>
                      {c.categoria}
                    </span>
                  </td>

                  <td className="p-4 text-right text-gray-600">${c.totalComprado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                  
                  <td className="p-4 text-right font-medium">
                    {c.deuda > 0 ? (
                      <span className="text-red-600 font-bold">${c.deuda.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                    ) : (
                      <span className="text-gray-400">$0.00</span>
                    )}
                  </td>

                  {/* Acceso directo a WhatsApp */}
                  <td className="p-4 text-center">
                    <a 
                      href={`https://wa.me/52${c.telefono}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                    >
                      WhatsApp
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}