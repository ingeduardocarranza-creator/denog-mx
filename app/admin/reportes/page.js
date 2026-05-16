'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Usamos la forma directa que no falla ni necesita librerías viejas
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ReportesAdmin() {
  const [entregas, setEntregas] = useState([]);
  const [entregaSeleccionada, setEntregaSeleccionada] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarEntregas() {
      const { data, error } = await supabase
        .from('entregas')
        .select('*')
        .order('fecha_entrega', { ascending: false });
      
      if (!error && data && data.length > 0) {
        setEntregas(data);
        setEntregaSeleccionada(data[0].id);
      }
    }
    cargarEntregas();
  }, []);

  useEffect(() => {
    if (!entregaSeleccionada) return;

    async function cargarDatosReporte() {
      setLoading(true);

      const { data: dataPedidos } = await supabase
        .from('pedidos')
        .select('*')
        .eq('entrega_id', entregaSeleccionada);

      const { data: dataPagos } = await supabase
        .from('pagos')
        .select('*')
        .eq('entrega_id', entregaSeleccionada);

      const { data: dataClientes } = await supabase
        .from('clientes')
        .select('*');

      setPedidos(dataPedidos || []);
      setPagos(dataPagos || []);
      setClientes(dataClientes || []);
      setLoading(false);
    }

    cargarDatosReporte();
  }, [entregaSeleccionada]);

  const ventasTotales = pedidos.reduce((acc, p) => acc + (Number(p.precio_venta) || 0), 0);
  const utilidadNeta = pedidos.reduce((acc, p) => acc + (Number(p.utilidad) || 0), 0);
  const margenUtilidad = ventasTotales > 0 ? (utilidadNeta / ventasTotales) * 100 : 0;
  const totalCobrado = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const pendienteCobrar = ventasTotales - totalCobrado;

  const saldosPorCliente = clientes.map(cliente => {
    const pedidosCliente = pedidos.filter(p => p.cliente_id === cliente.id);
    const totalPedido = pedidosCliente.reduce((acc, p) => acc + (Number(p.precio_venta) || 0), 0);
    const pagosCliente = pagos.filter(p => p.cliente_id === cliente.id);
    const totalPagado = pagosCliente.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);

    return {
      nombre: cliente.nombre,
      pendiente: totalPedido - totalPagado
    };
  })
  .filter(c => c.pendiente > 0)
  .sort((a, b) => b.pendiente - a.pendiente);

  if (loading && entregas.length === 0) {
    return <div className="p-8 text-center text-gray-600">Cargando reporte de Denog USA...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Panel de Reportes Financieros</h1>
          <p className="text-sm text-gray-500">Monitoreo de viajes, ventas y cobranza en Hermosillo</p>
        </div>
        
        <div className="flex items-center gap-2">
          <label className="font-semibold text-gray-700 text-sm">Viaje / Entrega:</label>
          <select 
            className="border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={entregaSeleccionada}
            onChange={(e) => setEntregaSeleccionada(e.target.value)}
          >
            {entregas.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.fecha_entrega).toLocaleDateString('es-MX')} — {e.nota || 'Sin nota'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Actualizando datos de entrega...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ventas Totales</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">${ventasTotales.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-green-500 uppercase tracking-wider">Total Cobrado</p>
              <p className="text-2xl font-bold text-green-600 mt-1">${totalCobrado.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-amber-500 uppercase tracking-wider">Por Cobrar</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">${pendienteCobrar.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Utilidad Neta</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">${utilidadNeta.toLocaleString('es-MX', {minimumFractionDigits: 2})}</p>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Margen Real</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{margenUtilidad.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                <span>Clientes con Saldo Pendiente</span>
                <span className="text-xs bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full font-medium">Por cobrar</span>
              </h2>
              {saldosPorCliente.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">¡Excelente! No hay saldos pendientes.</p>
              ) : (
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-1">
                  {saldosPorCliente.map((c, i) => (
                    <div key={i} className="py-3 flex justify-between items-center text-sm">
                      <span className="font-medium text-gray-700">{c.nombre}</span>
                      <span className="font-bold text-red-600">${c.pendiente.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Desglose de Ganancia por Producto</h2>
              {pedidos.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No hay productos registrados en esta fecha.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-400 font-semibold uppercase text-xs">
                        <th className="py-3 font-medium">Producto</th>
                        <th className="py-3 font-medium text-center">Lugar</th>
                        <th className="py-3 font-medium text-right">Costo MXN</th>
                        <th className="py-3 font-medium text-right">Venta MXN</th>
                        <th className="py-3 font-medium text-right text-blue-600">Utilidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {pedidos.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 font-medium max-w-xs truncate">{p.descripcion}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.lugar_compra === 'Arizona' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                              {p.lugar_compra}
                            </span>
                          </td>
                          <td className="py-3 text-right text-gray-500">${Number(p.costo_mxn || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                          <td className="py-3 text-right font-medium">${Number(p.precio_venta || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                          <td className="py-3 text-right font-bold text-blue-600">${Number(p.utilidad || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}