'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// La API devuelve claves como "2026-08-S3" (semana 3 de agosto) o "2026-08-14"
// (un día). En la gráfica salían como "08-S3" y "08-14", que no se leen.
function etiquetaBucket(clave) {
  const partes = String(clave).split('-');
  const mes = MESES[Number(partes[1]) - 1] || '';
  if (partes[2] && partes[2].startsWith('S')) return `sem ${partes[2].slice(1)} ${mes}`;
  return `${Number(partes[2])} ${mes}`;
}

export default function MercaditoReportes() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // Abre en Mes: el Mercadito recibe unos pocos pedidos al mes, así que una
  // ventana de 7 días casi siempre sale vacía y el reporte parece roto.
  const [periodo, setPeriodo] = useState('mes');
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
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, color: 'var(--tinta)', lineHeight: 1.1 }}>Reportes del Mercadito</h1>
            <p style={{ fontSize: 12.5, color: 'var(--w45)', marginTop: 3 }}>
              {periodo === 'semana' ? 'Últimos 7 días' : 'Últimos 30 días'} · sólo administradores
            </p>
          </div>
          <div className="flex gap-1.5 bg-[#111827] border border-white/10 rounded-xl p-1">
            {['semana', 'mes'].map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(p)}
                className="px-3.5 py-1.5 rounded-lg text-[11.5px] font-bold transition-all"
                style={periodo === p ? { background: 'rgba(193,85,58,0.2)', color: 'var(--tinta)' } : { color: 'var(--w50)' }}>
                {p === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {cargando || !k ? (
          <div className="text-center text-slate-500 text-xs py-16">Cargando reportes…</div>
        ) : (
          <>
            {/* Un periodo sin pedidos no se dibuja como una pared de ceros:
                eso parece pantalla rota. Se dice lo que pasa y ya. */}
            {k.pedidosTotales === 0 ? (
              <div style={{ background: 'var(--sup)', border: '1px solid var(--w08)', borderRadius: 16, padding: '38px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🗓️</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tinta)' }}>
                  Sin pedidos en {periodo === 'semana' ? 'los últimos 7 días' : 'los últimos 30 días'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--w45)', marginTop: 4 }}>
                  {periodo === 'semana'
                    ? 'Prueba con el mes, o revisa la lista completa en Mercadito → Pedidos.'
                    : 'La lista completa está en Mercadito → Pedidos.'}
                </div>
              </div>
            ) : (
            <>
            {/* KPIs principales. La tasa de cancelación va aparte y coloreada:
                en el Mercadito es EL número —4 de cada 10 pedidos han muerto por
                falta de stock— y estaba escondido como una casilla más entre
                cinco iguales. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Pedidos', value: k.pedidosTotales, sub: `${k.variacionPedidos >= 0 ? '+' : ''}${k.variacionPedidos.toFixed(0)}% vs periodo anterior` },
                { label: 'Ingresos aprobados', value: `$${money(k.ingresosAprobados)}` },
                { label: 'Ticket promedio', value: `$${money(k.ticketPromedio)}` },
                { label: 'Tiempo prom. atención', value: `${k.tiempoPromedioAtencionHoras.toFixed(1)}h` },
              ].map((c, i) => (
                <div key={i} className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--w45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tinta)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize: 10.5, color: 'var(--w40)', marginTop: 2 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {(() => {
              const tasa = k.tasaCancelacion;
              const grave = tasa >= 30;
              const tono = grave ? 'var(--rojo-t)' : tasa >= 15 ? 'var(--ambar-t)' : 'var(--verde)';
              const fondo = grave ? 'rgba(var(--rojo-rgb),0.07)' : tasa >= 15 ? 'var(--ambar-suave)' : 'var(--verde-suave)';
              const borde = grave ? 'rgba(var(--rojo-rgb),0.28)' : tasa >= 15 ? 'var(--ambar-borde)' : 'var(--verde-borde)';
              return (
                <div style={{ background: fondo, border: `1px solid ${borde}`, borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--w50)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tasa de cancelación</div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: tono, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{tasa.toFixed(0)}%</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: 'var(--w60)', lineHeight: 1.5 }}>
                    {grave
                      ? 'Uno de cada tres pedidos o más se está cayendo. El motivo más común ha sido que la mercancía no estaba en bodega: revisa el stock del catálogo antes de publicar.'
                      : tasa >= 15
                        ? 'Vale la pena revisar por qué se están cayendo estos pedidos.'
                        : 'La mayoría de los pedidos llega a entregarse.'}
                  </div>
                </div>
              );
            })()}

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
              {/* La barra llevaba height en % dentro de una columna de altura
                  automática: el porcentaje no tenía contra qué resolverse y
                  todas salían del minHeight de 4 px. O sea que la gráfica nunca
                  dibujó nada. La columna ahora sí tiene altura y empuja la barra
                  al fondo. */}
              <div className="flex items-end gap-2" style={{ height: 150 }}>
                {(datos.tendencia || []).map((b) => (
                  <div key={b.clave} onClick={() => setBucketAbierto(b)}
                    className="flex-1 flex flex-col items-center justify-end gap-1.5 cursor-pointer group"
                    style={{ height: '100%' }}
                    title={`${b.count} pedido${b.count === 1 ? '' : 's'} · clic para ver el detalle`}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--w55)', fontVariantNumeric: 'tabular-nums' }}>{b.count || ''}</div>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max(2, (b.count / maxTendencia) * 100)}%`,
                        background: b.count > 0 ? 'var(--marca)' : 'var(--w08)',
                      }}
                    />
                    <div style={{ fontSize: 9.5, color: 'var(--w40)', whiteSpace: 'nowrap' }}>{etiquetaBucket(b.clave)}</div>
                  </div>
                ))}
                {(datos.tendencia || []).length === 0 && <div style={{ color: 'var(--w40)', fontSize: 12 }}>Sin datos en este periodo.</div>}
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
