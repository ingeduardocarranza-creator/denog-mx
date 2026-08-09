'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_META = {
  nuevo: { label: 'Nuevo', color: '#3b82f6', icon: '🆕' },
  confirmado: { label: 'Confirmado (stock ok)', color: '#38bdf8', icon: '📋' },
  esperando_anticipo: { label: 'Esperando anticipo', color: '#facc15', icon: '⏳' },
  aprobado: { label: 'Aprobado', color: '#34d399', icon: '✅' },
  agregado: { label: 'Agregado a su cuenta', color: '#22c55e', icon: '📦' },
  entregado: { label: 'Entregado y cobrado', color: '#a3e635', icon: '🏁' },
  cancelado: { label: 'Cancelado', color: '#ef4444', icon: '🚫' },
};
const TAB_ORDER = ['todos', 'nuevo', 'confirmado', 'esperando_anticipo', 'aprobado', 'agregado', 'entregado', 'cancelado'];
const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Terminal'];

const pillStyle = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: bg || color + '22', color, border: `1px solid ${color}55`,
  borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
});

const totalPedido = (pedido) => (pedido.items || []).reduce((acc, it) => acc + (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0), 0);
const nombrePedido = (pedido) => pedido.clientes?.nombre || pedido.invitado_nombre || 'Cliente';
const telefonoPedido = (pedido) => pedido.clientes?.telefono || pedido.invitado_telefono || '';
const horasDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

function waTemplates(pedido, total) {
  const nombre = nombrePedido(pedido);
  const folio = pedido.folio;
  const itemsList = (pedido.items || []).map((it) => `• ${it.cantidad}x ${it.nombre} — $${money(it.precio_unitario)}`).join('\n');
  return [
    { id: 'resumen', label: 'Resumen del pedido', text: `🛍️ *Pedido ${folio} - Mercadito Denog*\n\nCliente: ${nombre}\n\n${itemsList}\n\nTotal: $${money(total)} MXN` },
    { id: 'confirmacion', label: 'Confirmación aprobado', text: `¡Buenas noticias ${nombre}! Tu pedido ${folio} del Mercadito fue *aprobado* ✅. Total: $${money(total)} MXN. Lo verás reflejado en tu próxima entrega.` },
    { id: 'recordatorio', label: 'Recordatorio de anticipo', text: `Hola ${nombre}! Te recordamos que tu pedido ${folio} del Mercadito está esperando el anticipo para poder continuar. Total: $${money(total)} MXN. ¡Cualquier duda avísanos!` },
    { id: 'cancelacion', label: 'Cancelación', text: `Hola ${nombre}, tu pedido ${folio} del Mercadito fue cancelado. Motivo: ${pedido.motivo_cancelacion || 'sin especificar'}. Cualquier duda con gusto te ayudamos.` },
  ];
}

export default function MercaditoAdmin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const datos = localStorage.getItem('cliente');
    if (!datos) { router.push('/'); return; }
    setUsuario(JSON.parse(datos));
  }, []);

  // Stock del catálogo, solo para cruce de inventario en cada línea de pedido.
  const [stockPorProducto, setStockPorProducto] = useState({});

  // ---------- Panel de pedidos ----------
  const [pedidos, setPedidos] = useState([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(true);
  const [tab, setTab] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelingId, setCancelingId] = useState(null);
  const [cancelDraft, setCancelDraft] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const [waSel, setWaSel] = useState({});
  const [armed, setArmed] = useState(null);
  const [undoSnapshot, setUndoSnapshot] = useState(null);
  const [showDaily, setShowDaily] = useState(false);

  const [pagosPorPedido, setPagosPorPedido] = useState({});

  const cargarPedidos = async () => {
    const res = await fetch('/api/admin/mercadito').then(r => r.json());
    if (res.ok) {
      setPedidos(res.pedidos);
      setPagosPorPedido(res.pagosPorPedido);
      setStockPorProducto(res.stockPorProducto);
    }
    setCargandoPedidos(false);
  };

  useEffect(() => { cargarPedidos(); }, []);

  const pagadoDe = (p) => pagosPorPedido[p.id] || 0;
  const saldoDe = (p) => Math.max(0, totalPedido(p) - pagadoDe(p));

  const [formPagoAbierto, setFormPagoAbierto] = useState(null);
  const [formPago, setFormPago] = useState({ monto: '', metodo: 'Efectivo' });
  const [errorPago, setErrorPago] = useState('');

  const abrirFormPago = (p) => {
    setFormPagoAbierto(p.id);
    setFormPago({ monto: String(saldoDe(p) || ''), metodo: 'Efectivo' });
    setErrorPago('');
  };
  const cerrarFormPago = () => { setFormPagoAbierto(null); setErrorPago(''); };

  const registrarPago = async (p) => {
    const monto = Number(formPago.monto);
    if (!monto || monto <= 0) { setErrorPago('Escribe un monto válido.'); return; }
    const saldo = saldoDe(p);
    if (monto > saldo + 0.5) { setErrorPago(`Ese monto supera el saldo pendiente ($${money(saldo)}).`); return; }

    const res = await fetch('/api/admin/mercadito/pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedidoId: p.id,
        clienteId: p.cliente_id,
        monto,
        metodo: formPago.metodo,
        estadoActual: p.estado,
        actorNombre: usuario?.nombre || null,
      }),
    }).then(r => r.json());

    if (!res.ok) { setErrorPago('No se pudo registrar el pago.'); return; }
    await cargarPedidos();
    cerrarFormPago();
  };

  const aplicarCambio = async (id, patch, historialLabel) => {
    const actual = pedidos.find((p) => p.id === id);
    if (!actual) return;
    setUndoSnapshot({ order: actual, label: historialLabel || 'última acción' });
    await fetch('/api/admin/mercadito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, patch, historialLabel, actorNombre: usuario?.nombre || null }),
    });
    cargarPedidos();
  };

  const deshacer = async () => {
    if (!undoSnapshot) return;
    const { order } = undoSnapshot;
    await fetch('/api/admin/mercadito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: order.id,
        patch: {
          estado: order.estado,
          anticipo_estado: order.anticipo_estado,
          motivo_cancelacion: order.motivo_cancelacion,
          items: order.items,
          notas_internas: order.notas_internas,
        },
        historialCompleto: order.historial,
      }),
    });
    setUndoSnapshot(null);
    cargarPedidos();
  };

  const estaArmado = (id, accion) => armed?.orderId === id && armed?.accion === accion;
  const ejecutarConArmado = (id, accion, fn) => {
    if (estaArmado(id, accion)) { setArmed(null); fn(); } else { setArmed({ orderId: id, accion }); }
  };

  const confirmarStockOk = (p) => ejecutarConArmado(p.id, 'confirmarStock', () =>
    aplicarCambio(p.id, { estado: 'confirmado' }, 'Stock confirmado disponible'));
  const cancelarSinStock = (p) =>
    aplicarCambio(p.id, { estado: 'cancelado', motivo_cancelacion: 'Sin stock disponible al revisar bodega.' }, 'Cancelado: sin stock disponible');
  const autorizarSinAnticipo = (p) => ejecutarConArmado(p.id, 'autorizarSinAnticipo', () =>
    aplicarCambio(p.id, { estado: 'aprobado', anticipo_estado: 'autorizado_sin_anticipo' }, 'Autorizado sin anticipo — venta aprobada'));
  const marcarEsperandoAnticipo = (p) =>
    aplicarCambio(p.id, { estado: 'esperando_anticipo', anticipo_estado: 'esperando' }, 'Marcado esperando anticipo');

  const iniciarCancel = (id) => { setCancelingId(id); setCancelDraft(''); };
  const abortarCancel = () => { setCancelingId(null); setCancelDraft(''); };
  const confirmarCancel = (p) => {
    if (!cancelDraft.trim()) return;
    aplicarCambio(p.id, { estado: 'cancelado', motivo_cancelacion: cancelDraft.trim() }, 'Cancelado: ' + cancelDraft.trim());
    setCancelingId(null);
    setCancelDraft('');
  };

  const cambiarCantidad = async (p, idx, delta) => {
    const items = [...(p.items || [])];
    items[idx] = { ...items[idx], cantidad: Math.max(1, (items[idx].cantidad || 1) + delta) };
    await fetch('/api/admin/mercadito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, patch: { items } }),
    });
    cargarPedidos();
  };

  const toggleFragil = async (p, idx) => {
    const items = [...(p.items || [])];
    items[idx] = { ...items[idx], apartado_fragil: !items[idx].apartado_fragil };
    await fetch('/api/admin/mercadito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, patch: { items } }),
    });
    cargarPedidos();
  };

  const agregarNota = async (p) => {
    const texto = (noteDrafts[p.id] || '').trim();
    if (!texto) return;
    const notas = [...(p.notas_internas || []), { ts: new Date().toISOString(), author_id: usuario?.id || null, author_nombre: usuario?.nombre || null, text: texto }];
    await fetch('/api/admin/mercadito', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, patch: { notas_internas: notas } }),
    });
    setNoteDrafts((d) => ({ ...d, [p.id]: '' }));
    cargarPedidos();
  };

  const enviarWhatsapp = (p) => {
    const total = totalPedido(p);
    const plantillas = waTemplates(p, total);
    const seleccionada = plantillas.find((t) => t.id === (waSel[p.id] || 'resumen')) || plantillas[0];
    const tel = telefonoPedido(p).replace(/\D/g, '');
    window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(seleccionada.text)}`, '_blank');
  };

  // ---------- Derivados: filtros, alertas, gráfico ----------
  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (tab !== 'todos' && p.estado !== tab) return false;
      if (q && !(nombrePedido(p).toLowerCase().includes(q) || p.folio.toLowerCase().includes(q))) return false;
      if (dateFrom && p.creado_en.slice(0, 10) < dateFrom) return false;
      if (dateTo && p.creado_en.slice(0, 10) > dateTo) return false;
      if (soloAtencion) {
        const necesitaAtencion = (p.estado === 'nuevo' || p.estado === 'esperando_anticipo') && horasDesde(p.creado_en) >= 24;
        if (!necesitaAtencion) return false;
      }
      return true;
    });
  }, [pedidos, tab, busqueda, dateFrom, dateTo, soloAtencion]);

  const conteosPorEstado = useMemo(() => {
    const c = {};
    TAB_ORDER.forEach((t) => { c[t] = t === 'todos' ? pedidos.length : pedidos.filter((p) => p.estado === t).length; });
    return c;
  }, [pedidos]);

  const activosPorCliente = useMemo(() => {
    const map = {};
    pedidos.forEach((p) => {
      if (p.estado === 'agregado' || p.estado === 'entregado' || p.estado === 'cancelado') return;
      const key = nombrePedido(p);
      (map[key] = map[key] || []).push(p.folio);
    });
    return map;
  }, [pedidos]);

  const alertas = useMemo(() => {
    const lista = [];
    const atencion = pedidos.filter((p) => (p.estado === 'nuevo' || p.estado === 'esperando_anticipo') && horasDesde(p.creado_en) >= 24).length;
    if (atencion > 0) lista.push({ icon: '🔥', text: `${atencion} pedido(s) llevan más de 24h sin avanzar de estado`, color: '#f87171' });
    const dup = Object.values(activosPorCliente).filter((l) => l.length > 1).length;
    if (dup > 0) lista.push({ icon: '⚠️', text: `${dup} cliente(s) con más de un pedido activo al mismo tiempo`, color: '#fca5a5' });
    const stockMismatch = pedidos.filter((p) =>
      (p.estado === 'nuevo' || p.estado === 'confirmado') &&
      (p.items || []).some((it) => stockPorProducto[it.producto_id] !== undefined && stockPorProducto[it.producto_id] < it.cantidad)
    ).length;
    if (stockMismatch > 0) lista.push({ icon: '📦', text: `${stockMismatch} pedido(s) piden más cantidad de la que hay en catálogo`, color: '#facc15' });
    return lista;
  }, [pedidos, activosPorCliente, stockPorProducto]);

  const chartRows = useMemo(() => {
    const estados = TAB_ORDER.filter((t) => t !== 'todos');
    const max = Math.max(1, ...estados.map((t) => conteosPorEstado[t] || 0));
    return estados.map((t) => ({ t, ...STATUS_META[t], count: conteosPorEstado[t] || 0, width: `${((conteosPorEstado[t] || 0) / max) * 100}%` }));
  }, [conteosPorEstado]);

  const totalPendiente = TAB_ORDER.filter((t) => !['todos', 'agregado', 'entregado', 'cancelado'].includes(t)).reduce((a, t) => a + (conteosPorEstado[t] || 0), 0);

  const pedidosResumenDia = useMemo(() =>
    pedidos.filter((p) => ['confirmado', 'esperando_anticipo', 'aprobado', 'agregado'].includes(p.estado)),
  [pedidos]);

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 font-sans">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">🛍️ Mercadito — Pedidos</h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de pedidos enviados desde el Mercadito (invitados por WhatsApp, clientes agregados a su próxima entrega). Mismo flujo y permisos para admin y colaborador.
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            El stock ya se descontó del catálogo al enviarse el pedido. Aquí es la <b>segunda confirmación</b>: revisar disponibilidad real, gestionar el anticipo (si aplica) y aprobar o cancelar. En cuanto queda <b>Aprobado</b>, ya está anotado en el Estado de Cuenta del cliente y listo para cobrarse en el punto de venta — no hace falta ningún paso extra. El catálogo (fotos, precio, stock) se administra en <b>Operaciones → Catálogo</b>, con el interruptor &quot;Mostrar en Mercadito&quot;.
          </p>
        </div>

        <div className="space-y-4">
          {alertas.map((a, i) => (
            <div key={i} style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', color: a.color, fontWeight: 600, fontSize: 12.5 }}>
              {a.icon} {a.text}
            </div>
          ))}

          <div className="bg-[#111827] rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">{totalPendiente} por atender</span>
              <button type="button" onClick={() => setShowDaily(true)} className="text-[11px] font-bold text-[#dd8a6c] hover:underline">🖨️ Ver resumen del día</button>
            </div>
            <div className="space-y-1.5">
              {chartRows.map((r) => (
                <div key={r.t} className="flex items-center gap-2 text-[11px]">
                  <div className="w-32 text-slate-400 flex-none">{r.icon} {r.label}</div>
                  <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                    <div style={{ width: r.width, background: r.color, height: '100%', borderRadius: 999 }} />
                  </div>
                  <div className="w-6 text-right text-slate-300 font-bold flex-none">{r.count}</div>
                </div>
              ))}
            </div>
          </div>

          {undoSnapshot && (
            <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-2.5">
              <span className="text-[11.5px] text-amber-300">↩ Deshacer: {undoSnapshot.label} ({undoSnapshot.order.folio})</span>
              <button type="button" onClick={deshacer} className="text-[11px] font-bold text-amber-300 hover:underline">Deshacer</button>
            </div>
          )}

          <div className="bg-[#111827] rounded-2xl border border-white/10 p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Cliente o folio…" className="flex-1 min-w-[160px] bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none placeholder-slate-500" />
              <button type="button" onClick={() => setSoloAtencion((v) => !v)} className="px-3 py-2 rounded-xl text-[11px] font-bold border transition-all" style={soloAtencion ? { background: 'rgba(248,113,113,0.2)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.5)' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.14)' }}>
                🔥 Requieren atención hoy
              </button>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-[#1e2533] border border-slate-700 rounded-xl px-2 py-2 text-[11px] text-white focus:outline-none" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-[#1e2533] border border-slate-700 rounded-xl px-2 py-2 text-[11px] text-white focus:outline-none" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TAB_ORDER.map((t) => {
                const activo = t === tab;
                const label = t === 'todos' ? 'Todos' : STATUS_META[t].label;
                return (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className="px-3 py-1.5 rounded-xl text-[11.5px] font-bold border transition-all"
                    style={activo ? { background: 'rgba(193,85,58,0.18)', color: '#fff', border: '1px solid rgba(193,85,58,0.5)' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {label} <span className="ml-1 bg-red-600/80 rounded-full px-1.5 text-[9.5px]">{conteosPorEstado[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de tarjetas expandidas */}
          <div className="space-y-4">
            {cargandoPedidos ? (
              <div className="text-center text-slate-500 text-xs py-10">Cargando pedidos…</div>
            ) : pedidosFiltrados.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-10">No hay pedidos en este estado.</div>
            ) : pedidosFiltrados.map((p) => {
              const meta = STATUS_META[p.estado];
              const total = totalPedido(p);
              const dupFolios = (activosPorCliente[nombrePedido(p)] || []).filter((f) => f !== p.folio);
              const isCanceling = cancelingId === p.id;
              const editableQty = p.estado === 'nuevo' || p.estado === 'confirmado';
              const plantillas = waTemplates(p, total);
              const seleccionadaId = waSel[p.id] || 'resumen';

              return (
                <div key={p.id} className="bg-[#111827] rounded-2xl border border-white/10 p-5 space-y-4">
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{nombrePedido(p)}</span>
                        <span style={pillStyle(meta.color)}>{meta.icon} {meta.label}</span>
                        <span style={pillStyle('#a89af8', 'rgba(168,154,248,0.15)')}>🛍️ Mercadito</span>
                        <span style={p.cliente_id ? pillStyle('#34d399') : pillStyle('rgba(255,255,255,0.6)', 'rgba(255,255,255,0.08)')}>
                          {p.cliente_id ? '✅ Cliente' : '👤 Invitado'}
                        </span>
                        {p.domicilio_id && (
                          <span style={pillStyle('#f59e0b', 'rgba(245,158,11,0.15)')}>🏠 Domicilio</span>
                        )}
                        {p.anticipo_estado && (
                          <span style={pillStyle(p.anticipo_estado === 'recibido' ? '#34d399' : p.anticipo_estado === 'autorizado_sin_anticipo' ? '#facc15' : '#3b82f6', 'rgba(255,255,255,0.05)')}>
                            {p.anticipo_estado === 'recibido' ? '💰 Anticipo recibido' : p.anticipo_estado === 'autorizado_sin_anticipo' ? '🟡 Autorizado sin anticipo' : '⏳ Esperando anticipo'}
                          </span>
                        )}
                        {(p.estado === 'nuevo' || p.estado === 'esperando_anticipo') && horasDesde(p.creado_en) >= 24 && (
                          <span style={pillStyle('#f87171', 'rgba(248,113,113,0.16)')}>🔥 Atención</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1.5">{telefonoPedido(p)} · {p.folio} · {new Date(p.creado_en).toLocaleString('es-MX')}</div>
                      {dupFolios.length > 0 && (
                        <div className="text-[11px] text-red-300 mt-1">⚠️ Este cliente tiene otro pedido activo: {dupFolios.join(', ')}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => router.push('/admin/clientes')} className="text-[11px] text-slate-500 hover:underline flex-none">👤 Ver estado de cuenta →</button>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {(p.items || []).map((it, idx) => {
                      const stockCat = stockPorProducto[it.producto_id];
                      const mismatch = stockCat !== undefined && stockCat < it.cantidad;
                      return (
                        <div key={idx} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] text-slate-200 font-semibold">{it.nombre}</div>
                            {stockCat !== undefined && (
                              <div className="text-[11px] font-bold" style={{ color: mismatch ? '#f87171' : 'rgba(255,255,255,0.4)' }}>📦 Stock catálogo: {stockCat}</div>
                            )}
                          </div>
                          {editableQty ? (
                            <div className="flex items-center gap-2 flex-none">
                              <button type="button" onClick={() => cambiarCantidad(p, idx, -1)} className="w-6 h-6 rounded bg-white/10 text-white text-xs">−</button>
                              <span className="text-white text-xs font-bold w-5 text-center">{it.cantidad}</span>
                              <button type="button" onClick={() => cambiarCantidad(p, idx, 1)} className="w-6 h-6 rounded bg-white/10 text-white text-xs">+</button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs flex-none">{it.cantidad}x</span>
                          )}
                          <span className="text-[#dd8a6c] text-xs font-bold w-16 text-right flex-none">${money(it.precio_unitario)}</span>
                          <button type="button" onClick={() => toggleFragil(p, idx)} className="flex-none px-2.5 py-1 rounded-lg text-[11px] font-bold" style={it.apartado_fragil ? { background: 'rgba(250,204,21,0.18)', color: '#facc15', border: '1px solid rgba(250,204,21,0.5)' } : { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.16)' }}>
                            ⚠️ Frágil
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end text-sm font-bold text-white">Total: ${money(total)}</div>

                  {(pagadoDe(p) > 0 || ['esperando_anticipo', 'aprobado', 'agregado'].includes(p.estado)) && p.estado !== 'entregado' && p.estado !== 'cancelado' && (
                    <div className="flex justify-end gap-3 text-[11.5px]">
                      <span className="text-emerald-400 font-bold">Pagado: ${money(pagadoDe(p))}</span>
                      <span className={saldoDe(p) > 0 ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>
                        {saldoDe(p) > 0 ? `Saldo pendiente: $${money(saldoDe(p))}` : '✓ Cubierto por anticipo'}
                      </span>
                    </div>
                  )}

                  {/* Historial */}
                  {(p.historial || []).length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 mb-1.5">🕓 Historial</div>
                      <div className="space-y-1">
                        {p.historial.map((h, i) => (
                          <div key={i} className="text-[11px] text-slate-500">
                            {h.label}{h.actor_nombre ? ` — ${h.actor_nombre}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notas internas */}
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 mb-1.5">📝 Notas internas</div>
                    <div className="space-y-1 mb-2">
                      {(p.notas_internas || []).map((n, i) => (
                        <div key={i} className="text-[11px] text-slate-400">
                          <span className="text-slate-300 font-semibold">{n.author_nombre || 'Equipo'}:</span> {n.text}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={noteDrafts[p.id] || ''} onChange={(e) => setNoteDrafts((d) => ({ ...d, [p.id]: e.target.value }))} placeholder="Agregar nota interna…" className="flex-1 bg-[#1e2533] border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11.5px] text-white focus:outline-none" />
                      <button type="button" onClick={() => agregarNota(p)} className="bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold px-3 rounded-lg">Agregar</button>
                    </div>
                  </div>

                  {/* Cancelación en curso / nota de cancelado */}
                  {isCanceling && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 14 }}>
                      <div className="text-[11px] font-bold text-red-300 mb-2">Motivo de cancelación (obligatorio)</div>
                      <textarea value={cancelDraft} onChange={(e) => setCancelDraft(e.target.value)} placeholder="Ej. Sin stock, cliente se arrepintió, etc." rows={2} className="w-full bg-[#1e2533] border border-slate-700 rounded-lg px-2.5 py-2 text-[11.5px] text-white focus:outline-none resize-none mb-2" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => confirmarCancel(p)} className="bg-red-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg">Confirmar cancelación</button>
                        <button type="button" onClick={abortarCancel} className="bg-transparent text-slate-400 border border-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-lg">Volver</button>
                      </div>
                    </div>
                  )}
                  {!isCanceling && p.estado === 'cancelado' && p.motivo_cancelacion && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
                      Cancelado: {p.motivo_cancelacion}
                    </div>
                  )}
                  {(p.estado === 'aprobado' || p.estado === 'agregado') && (
                    <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: 10, padding: '10px 14px', color: '#6ee7b7', fontSize: 13 }}>
                      ✅ Anotado en su Estado de Cuenta — {saldoDe(p) > 0 ? 'pendiente de cobrar' : 'ya cubierto'} en el punto de venta cuando pase a recoger.
                    </div>
                  )}
                  {p.estado === 'entregado' && (
                    <div style={{ background: 'rgba(163,230,53,0.1)', border: '1px solid rgba(163,230,53,0.35)', borderRadius: 10, padding: '10px 14px', color: '#d9f99d', fontSize: 13 }}>
                      🏁 Cobrado y entregado en el punto de venta.
                    </div>
                  )}

                  {/* Nota cuando el Mercadito va incluido en un domicilio */}
                  {p.domicilio_id && !['cancelado', 'entregado'].includes(p.estado) && (
                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 14px', color: '#fcd34d', fontSize: 13 }}>
                      🏠 Este pedido va incluido en un domicilio — el cobro se centraliza desde la sección de <b>Domicilios</b>, no desde aquí.
                    </div>
                  )}

                  {/* Registrar pago (anticipo o liquidación) */}
                  {formPagoAbierto === p.id && !p.domicilio_id && (
                    <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 10, padding: 14 }}>
                      <div className="text-[11px] font-bold text-emerald-300 mb-2">Registrar pago — saldo pendiente ${money(saldoDe(p))}</div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <input type="number" value={formPago.monto} onChange={(e) => setFormPago((f) => ({ ...f, monto: e.target.value }))} placeholder="Monto" className="w-28 bg-[#1e2533] border border-slate-700 rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none" />
                        <select value={formPago.metodo} onChange={(e) => setFormPago((f) => ({ ...f, metodo: e.target.value }))} className="bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-[11.5px] text-white focus:outline-none">
                          {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button type="button" onClick={() => registrarPago(p)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-bold px-3 py-1.5 rounded-lg">Guardar pago</button>
                        <button type="button" onClick={cerrarFormPago} className="bg-transparent text-slate-400 border border-slate-700 text-[11.5px] font-bold px-3 py-1.5 rounded-lg">Cancelar</button>
                      </div>
                      {errorPago && <div className="text-[11px] text-red-300 mt-2">{errorPago}</div>}
                    </div>
                  )}

                  {/* WhatsApp */}
                  {telefonoPedido(p) && (
                    <div className="flex gap-2 items-center">
                      <select value={seleccionadaId} onChange={(e) => setWaSel((s) => ({ ...s, [p.id]: e.target.value }))} className="bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none">
                        {plantillas.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <button type="button" onClick={() => enviarWhatsapp(p)} style={{ background: 'rgba(37,211,102,0.14)', color: '#4ade80', border: '1px solid rgba(37,211,102,0.4)' }} className="text-[11px] font-bold px-3 py-1.5 rounded-lg">💬 Enviar por WhatsApp</button>
                    </div>
                  )}

                  {/* Acciones según estado */}
                  {!isCanceling && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {p.estado === 'nuevo' && (
                        <>
                          <button type="button" onClick={() => confirmarStockOk(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl" style={estaArmado(p.id, 'confirmarStock') ? { background: '#facc15', color: '#3a2a00' } : { background: '#34d399', color: '#06281d' }}>
                            {estaArmado(p.id, 'confirmarStock') ? '⚠️ ¿Confirmar? Toca de nuevo' : '✅ Confirmar stock disponible'}
                          </button>
                          <button type="button" onClick={() => cancelarSinStock(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl bg-transparent text-red-300 border border-red-800/60">❌ Sin stock / Cancelar</button>
                        </>
                      )}
                      {(p.estado === 'confirmado' || p.estado === 'esperando_anticipo') && (
                        <>
                          {!p.domicilio_id && (
                            <button type="button" onClick={() => abrirFormPago(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl" style={{ background: '#34d399', color: '#06281d' }}>
                              💰 Registrar anticipo
                            </button>
                          )}
                          <button type="button" onClick={() => autorizarSinAnticipo(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl" style={estaArmado(p.id, 'autorizarSinAnticipo') ? { background: '#facc15', color: '#3a2a00' } : { background: '#3b82f6', color: '#fff' }}>
                            {estaArmado(p.id, 'autorizarSinAnticipo') ? '⚠️ ¿Confirmar? Toca de nuevo' : '🟡 Autorizar pedido sin anticipo'}
                          </button>
                          {p.estado === 'confirmado' && (
                            <button type="button" onClick={() => marcarEsperandoAnticipo(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl bg-transparent text-slate-300 border border-slate-600">⏳ Esperando anticipo</button>
                          )}
                          {p.estado === 'esperando_anticipo' && (
                            <button type="button" onClick={() => window.open(`https://wa.me/52${telefonoPedido(p).replace(/\D/g, '')}?text=${encodeURIComponent(waTemplates(p, total).find((t) => t.id === 'recordatorio').text)}`, '_blank')} className="text-[12px] font-bold px-3.5 py-2 rounded-xl bg-transparent text-slate-300 border border-slate-600">🔔 Reenviar recordatorio de anticipo</button>
                          )}
                          <button type="button" onClick={() => iniciarCancel(p.id)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl bg-transparent text-red-300 border border-red-800/60">🚫 Cancelar pedido</button>
                        </>
                      )}
                      {(p.estado === 'aprobado' || p.estado === 'agregado') && saldoDe(p) > 0 && !p.domicilio_id && (
                        <button type="button" onClick={() => abrirFormPago(p)} className="text-[12px] font-bold px-3.5 py-2 rounded-xl" style={{ background: '#3b82f6', color: '#fff' }}>
                          💳 Registrar pago
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Resumen del día */}
      {showDaily && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-white">📋 Resumen del día — qué entregar/cobrar</h2>
              <button type="button" onClick={() => setShowDaily(false)} className="text-slate-400 hover:text-white text-sm">Cerrar ✕</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">Pedidos confirmados, esperando anticipo o aprobados — listos para gestionar hoy.</p>
            <div className="space-y-3">
              {pedidosResumenDia.length === 0 ? (
                <div className="text-slate-500 text-xs text-center py-6">Nada pendiente por hoy.</div>
              ) : pedidosResumenDia.map((p) => (
                <div key={p.id} className="border-b border-white/10 pb-2">
                  <div className="flex justify-between text-xs text-white font-bold">
                    <span>{nombrePedido(p)} — {STATUS_META[p.estado].label}</span>
                    <span>${money(totalPedido(p))}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{p.folio} · {telefonoPedido(p)}</div>
                  <div className="text-[11px] text-slate-400">{(p.items || []).map((it) => `${it.cantidad}x ${it.nombre}`).join(', ')}</div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => window.print()} className="w-full mt-4 bg-[#c1553a] hover:bg-[#9b3f28] text-white font-bold py-2.5 rounded-xl text-xs">🖨️ Imprimir</button>
          </div>
        </div>
      )}
    </div>
  );
}
