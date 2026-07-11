'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MercaditoReportes() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const [periodo, setPeriodo] = useState('semana');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [bucketAbierto, setBucketAbierto] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('cliente');
    if (!stored) { router.push('/'); return; }
    setUsuario(JSON.parse(stored));
    setCargandoSesion(false);
  }, []);

  useEffect(() => {
    if (!usuario || usuario.rol !== 'admin') return;
    setCargando(true);
    fetch(`/api/mercadito/reportes?periodo=${periodo}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setDatos(d); })
      .finally(() => setCargando(false));
  }, [usuario, periodo]);

  if (cargandoSesion) return null;

  if (usuario.rol !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm font-bold text-white">Acceso restringido</div>
          <div className="text-xs text-slate-400 mt-1">Los reportes del Mercadito son solo para cuentas administradoras.</div>
        </div>
      </div>
    );
  }

  const k = datos?.kpis;
  const maxTendencia = Math.max(1, ...(datos?.tendencia || []).map((b) => b.count));

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 font-sans">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">📊 Mercadito — Reportes</h1>
            <p className="text-xs text-slate-400 mt-1">Solo visible para administradores.</p>
          </div>
          <div className="flex gap-1.5 bg-[#111827] border border-white/10 rounded-xl p-1">
            {['semana', 'mes'].map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(p)}
                className="px-3.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-all"
                style={periodo === p ? { background: 'rgba(59,130,246,0.2)', color: '#fff' } : { color: 'rgba(255,255,255,0.5)' }}>
                {p === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {cargando || !k ? (
          <div className="text-center text-slate-500 text-xs py-16">Cargando reportes…</div>
        ) : (
          <>
            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Pedidos totales', value: k.pedidosTotales, sub: `${k.variacionPedidos >= 0 ? '+' : ''}${k.variacionPedidos.toFixed(0)}% vs periodo anterior` },
                { label: 'Ingresos aprobados', value: `$${money(k.ingresosAprobados)}` },
                { label: 'Ticket promedio', value: `$${money(k.ticketPromedio)}` },
                { label: 'Tasa de cancelación', value: `${k.tasaCancelacion.toFixed(1)}%` },
                { label: 'Tiempo prom. atención', value: `${k.tiempoPromedioAtencionHoras.toFixed(1)}h` },
              ].map((c, i) => (
                <div key={i} className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                  <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest">{c.label}</div>
                  <div className="text-lg font-black text-white mt-1">{c.value}</div>
                  {c.sub && <div className="text-[10.5px] text-slate-500 mt-0.5">{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Indicadores adicionales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-2">Invitado vs cliente</div>
                <div className="flex justify-between text-xs text-slate-300"><span>👤 Invitado</span><span className="font-bold">{k.pctInvitado.toFixed(0)}%</span></div>
                <div className="flex justify-between text-xs text-slate-300 mt-1"><span>✅ Cliente</span><span className="font-bold">{k.pctCliente.toFixed(0)}%</span></div>
              </div>
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-2">Desglose de anticipo</div>
                <div className="flex justify-between text-xs text-slate-300"><span>💰 Recibido</span><span className="font-bold">{k.desgloseAnticipo.recibido}</span></div>
                <div className="flex justify-between text-xs text-slate-300 mt-1"><span>🟡 Autorizado sin anticipo</span><span className="font-bold">{k.desgloseAnticipo.autorizado_sin_anticipo}</span></div>
                <div className="flex justify-between text-xs text-slate-300 mt-1"><span>⏳ Esperando</span><span className="font-bold">{k.desgloseAnticipo.esperando}</span></div>
              </div>
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
                <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-2">Otros</div>
                <div className="flex justify-between text-xs text-slate-300"><span>Categoría más vendida</span><span className="font-bold">{k.categoriaMasVendida || '—'}</span></div>
                <div className="flex justify-between text-xs text-slate-300 mt-1"><span>Colaborador top</span><span className="font-bold">{k.colaboradorTop || '—'}</span></div>
              </div>
            </div>

            {/* Tendencia */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-3">
                Tendencia · pedidos por {periodo === 'semana' ? 'día' : 'semana'}
              </div>
              <div className="flex items-end gap-2 h-32">
                {(datos.tendencia || []).map((b) => (
                  <div key={b.clave} onClick={() => setBucketAbierto(b)} className="flex-1 flex flex-col items-center gap-1 cursor-pointer group">
                    <div className="w-full rounded-t-md bg-blue-500 group-hover:bg-blue-400 transition-all" style={{ height: `${(b.count / maxTendencia) * 100}%`, minHeight: 4 }} />
                    <div className="text-[9px] text-slate-500 whitespace-nowrap">{b.clave.slice(5)}</div>
                  </div>
                ))}
                {(datos.tendencia || []).length === 0 && <div className="text-slate-500 text-xs">Sin datos en este periodo.</div>}
              </div>
            </div>

            {/* Top 5 productos */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-3">Top 5 productos más pedidos</div>
              <div className="space-y-2">
                {(datos.topProductos || []).length === 0 ? (
                  <div className="text-slate-500 text-xs">Sin datos en este periodo.</div>
                ) : datos.topProductos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{i + 1}. {p.nombre}</span>
                    <span className="font-bold text-white">{p.cantidad} u</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal solo-consulta */}
      {bucketAbierto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Detalle · {bucketAbierto.clave}</h2>
              <button type="button" onClick={() => setBucketAbierto(null)} className="text-slate-400 hover:text-white text-sm">Cerrar ✕</button>
            </div>
            <div className="space-y-3">
              {bucketAbierto.pedidos.map((p) => (
                <div key={p.id} className="border-b border-white/10 pb-2">
                  <div className="flex justify-between text-xs text-white font-bold">
                    <span>{p.nombre} — {p.folio}</span>
                    <span>${money(p.total)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{p.estado}</div>
                  <div className="text-[11px] text-slate-400">{(p.items || []).map((it) => `${it.cantidad}x ${it.nombre}`).join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
