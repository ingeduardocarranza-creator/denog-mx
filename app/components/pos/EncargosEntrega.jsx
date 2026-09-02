'use client';

import { useMemo, useState } from 'react';
import FotoPedido from '../FotoPedido';
import { crearLineaCatalogo, calcularTotalesCarrito } from '../../../lib/pos/tiendaUtils';
import Foto from './ProductoFoto';
import DescuentoForm from './DescuentoForm';
import { clay } from '../../../lib/theme/colors';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money2 = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const formatearFecha = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha + 'T12:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};
const formatearFechaCorta = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const TIPO_EMPAQUE = {
  chico:   { label: 'Chico',   sub: 'Bolsa blanca o cartón', icon: '🥡', color: 'var(--azul)' },
  mediano: { label: 'Mediano', sub: 'Bolsa blanca',          icon: '🛍️', color: 'var(--ambar-t)' },
  grande:  { label: 'Grande',  sub: 'Bolsa TJ Maxx',         icon: '🛒', color: 'var(--ambar-t)' },
};

const iniciales = (nombre) =>
  (nombre || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

export default function EncargosEntrega({
  clienteSeleccionado,
  onCambiarCliente,
  busquedaCliente,
  setBusquedaCliente,
  clientesFiltrados,
  onSeleccionarCliente,
  bloquesEntregas,
  productosSeleccionados,
  setProductosSeleccionados,
  listaAnticipos,
  productos,
  cart,
  setCart,
  sumaEncargosTotalNeto,
  desgloseTicketEncargos,
  pedidosMercadito = [],
  mercaditoSeleccionado = {},
  setMercaditoSeleccionado,
  sumaMercaditoSeleccionado = 0,
  onCobrar,
  loading,
}) {
  const [query, setQuery] = useState('');
  const [fotoModal, setFotoModal] = useState(null);

  const [menuId, setMenuId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editMode, setEditMode] = useState(null); // 'price' | 'discount'
  const [priceDraft, setPriceDraft] = useState('');
  const [discountType, setDiscountType] = useState('percent');
  const [discountDraft, setDiscountDraft] = useState('');

  // El resumen de arriba (piezas, empaque, frágiles) es para lo que el
  // colaborador va a entregar HOY. Una entrega que todavía no llega no cuenta.
  const bloquesCobrables = bloquesEntregas.filter((b) => !b.bloqueada);
  const hayBloqueadas = bloquesEntregas.length > bloquesCobrables.length;

  const totalPiezasFragilEncargo = bloquesCobrables.reduce(
    (sum, b) =>
      sum +
      b.pedidos
        .filter((p) => p.apartado_fragil && productosSeleccionados[p.id])
        .reduce((s, p) => s + (Number(p.cantidad) || 1), 0),
    0
  );
  const totalPiezasFragilMercadito = pedidosMercadito
    .filter((pm) => mercaditoSeleccionado[pm.id])
    .reduce(
      (sum, pm) =>
        sum +
        (pm.items || [])
          .filter((it) => it.apartado_fragil)
          .reduce((s, it) => s + (Number(it.cantidad) || 1), 0),
      0
    );
  const totalPiezasFragil = totalPiezasFragilEncargo + totalPiezasFragilMercadito;

  const tipoEmpaquePrincipal = bloquesCobrables
    .flatMap((b) => b.pedidos)
    .find((p) => p.tipo_empaque)?.tipo_empaque || null;

  const totalPiezas = bloquesCobrables.reduce(
    (sum, b) =>
      sum +
      b.pedidos
        .filter((p) => productosSeleccionados[p.id])
        .reduce((s, p) => s + (Number(p.cantidad) || 1), 0),
    0
  );

  const productosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return (productos || [])
      .filter((p) => p.nombre?.toLowerCase().includes(q) || p.codigo_barras?.includes(query.trim()))
      .slice(0, 8);
  }, [productos, query]);

  const agregarProducto = (producto) => {
    setCart((prev) => {
      const existe = prev.find((l) => l.origen === 'catalogo' && l.productoId === producto.id);
      if (existe) {
        const tope = existe.stockDisponible;
        if (tope != null && existe.cantidad + 1 > tope) return prev;
        return prev.map((l) => (l === existe ? { ...l, cantidad: l.cantidad + 1 } : l));
      }
      return [...prev, crearLineaCatalogo(producto)];
    });
    setQuery('');
  };

  const cambiarCantidad = (id, delta) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.id !== id) return l;
          const nueva = l.cantidad + delta;
          if (delta > 0 && l.stockDisponible != null && nueva > l.stockDisponible) return l;
          return { ...l, cantidad: nueva };
        })
        .filter((l) => l.cantidad > 0)
    );
  };

  const quitarLinea = (id) => {
    setCart((prev) => prev.filter((l) => l.id !== id));
    setMenuId((m) => (m === id ? null : m));
    setEditId((e) => (e === id ? null : e));
  };

  const abrirEditarPrecio = (linea) => {
    setMenuId(null);
    setEditId(linea.id);
    setEditMode('price');
    setPriceDraft(String(linea.precioUnitario));
  };

  const abrirEditarDescuento = (linea) => {
    setMenuId(null);
    setEditId(linea.id);
    setEditMode('discount');
    setDiscountType(linea.descuentoTipo || 'percent');
    setDiscountDraft(linea.descuentoValor ? String(linea.descuentoValor) : '');
  };

  const cerrarModalLinea = () => {
    setEditId(null);
    setEditMode(null);
  };

  const guardarPrecio = () => {
    const v = parseFloat(priceDraft);
    if (!(v >= 0)) return cerrarModalLinea();
    setCart((prev) => prev.map((l) => (l.id === editId ? { ...l, precioUnitario: v } : l)));
    cerrarModalLinea();
  };

  const guardarDescuento = () => {
    let v = parseFloat(discountDraft);
    if (isNaN(v) || v < 0) v = 0;
    if (discountType === 'percent') v = Math.min(100, v);
    setCart((prev) => prev.map((l) => (l.id === editId ? { ...l, descuentoTipo: v > 0 ? discountType : null, descuentoValor: v } : l)));
    cerrarModalLinea();
  };

  const { lineas: lineasTienda, total: montoTiendaExtra } = useMemo(
    () => calcularTotalesCarrito(cart, { tipo: null, valor: 0 }),
    [cart]
  );
  const storeCount = cart.reduce((a, l) => a + l.cantidad, 0);
  const total = sumaEncargosTotalNeto + sumaMercaditoSeleccionado + montoTiendaExtra;
  // No hay nada que entregar: cero cobrable, cero mercadito, cero tienda, y lo
  // único que tiene el cliente es una entrega que todavía no llega.
  const sinNadaQueCobrar =
    hayBloqueadas &&
    bloquesCobrables.length === 0 &&
    total === 0 &&
    pedidosMercadito.length === 0 &&
    lineasTienda.length === 0;
  const editLinea = cart.find((l) => l.id === editId) || null;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 400px', alignItems: 'start' }}>
      {/* IZQUIERDA */}
      <div className="flex flex-col gap-4">
        {/* Cliente */}
        <div
          className="flex items-center justify-between gap-4 rounded-2xl p-5"
          style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}
        >
          {!clienteSeleccionado ? (
            <div className="relative w-full">
              <div
                className="flex items-center gap-3 h-14 px-5 rounded-2xl"
                style={{ background: 'var(--w03)', border: `2px solid ${clay[500]}` }}
              >
                <span style={{ color: clay[300] }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar por nombre de cliente o teléfono..."
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-[15px]"
                  // El texto iba en semibold y el marcador de posición en
                  // gris frío de Tailwind (placeholder:text-gray-400, que el
                  // remapeo del tema no alcanza). Junto a la tinta café del
                  // panel se leía como si fuera otra tipografía. Ahora usa los
                  // tokens y el mismo peso que el resto de los campos.
                  style={{ color: 'var(--tinta)', fontWeight: 500 }}
                />
              </div>
              {clientesFiltrados.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-2 z-20 divide-y divide-gray-700">
                  {clientesFiltrados.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => onSeleccionarCliente(c)}
                      className="p-3 text-sm cursor-pointer flex justify-between" style={{ color: 'var(--tinta)' }}
                    >
                      <span>{c.nombre}</span>
                      <span className="text-gray-400 tabular-nums text-xs">{c.telefono}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'rgba(193,85,58,0.18)',
                    border: `1px solid rgba(193,85,58,0.4)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 800,
                    color: clay[300],
                  }}
                >
                  {iniciales(clienteSeleccionado.nombre)}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{clienteSeleccionado.nombre}</div>
                  <div style={{ fontSize: 13, color: 'var(--w50)', marginTop: 2 }}>
                    📞 {clienteSeleccionado.telefono}
                  </div>
                </div>
              </div>
              {tipoEmpaquePrincipal && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: `${TIPO_EMPAQUE[tipoEmpaquePrincipal].color}22`,
                    border: `1.5px solid ${TIPO_EMPAQUE[tipoEmpaquePrincipal].color}`,
                    color: TIPO_EMPAQUE[tipoEmpaquePrincipal].color,
                    borderRadius: 12, padding: '9px 16px', flex: 'none',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{TIPO_EMPAQUE[tipoEmpaquePrincipal].icon}</span>
                  <span>
                    <div style={{ fontSize: 14, fontWeight: 900, lineHeight: 1.2 }}>{TIPO_EMPAQUE[tipoEmpaquePrincipal].label}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, lineHeight: 1.2 }}>{TIPO_EMPAQUE[tipoEmpaquePrincipal].sub}</div>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={onCambiarCliente}
                style={{
                  background: 'transparent',
                  border: `1px solid rgba(193,85,58,0.5)`,
                  color: clay[300],
                  borderRadius: 10,
                  padding: '9px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cambiar
              </button>
            </>
          )}
        </div>

        {/* Banner frágil */}
        {totalPiezasFragil > 0 && (
          <div
            className="flex items-center gap-3 rounded-2xl px-5 py-4"
            style={{ background: 'var(--ambar)', color: '#ffffff' }}
          >
            <span style={{ fontSize: 24, lineHeight: 1 }}>⚠️</span>
            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.3 }}>
              {totalPiezasFragil} pieza{totalPiezasFragil > 1 ? 's' : ''} FRÁGIL — cuenta bien antes de entregar.
            </div>
          </div>
        )}

        {/* Piezas a entregar */}
        {bloquesEntregas.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'linear-gradient(120deg, rgba(193,85,58,0.18), rgba(193,85,58,0.06))', border: `1px solid rgba(193,85,58,0.4)` }}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div
                  style={{
                    flex: 'none',
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: 'rgba(193,85,58,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                  }}
                >
                  👜
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--w70)' }}>
                    Piezas a entregar
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--w45)', marginTop: 2 }}>
                    Cuenta las piezas de la bolsa y confirma que coincidan
                  </div>
                </div>
              </div>
              <div
                style={{
                  textAlign: 'center',
                  background: 'rgba(193,85,58,0.22)',
                  border: `1px solid rgba(193,85,58,0.5)`,
                  borderRadius: 12,
                  padding: '6px 22px',
                  minWidth: 88,
                }}
              >
                <div style={{ fontSize: 40, fontWeight: 900, color: clay[300], lineHeight: 1 }}>{totalPiezas}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--w60)', marginTop: 2 }}>piezas</div>
              </div>
            </div>
          </div>
        )}

        {/* Cards de entrega */}
        {bloquesEntregas.map((bloque, idx) => {
          // Una entrega que todavía no llega a tienda se muestra —para que el
          // colaborador sepa que el encargo existe— pero no se puede tocar ni
          // sumar. El servidor rechaza el cobro de todos modos; esto evita que
          // alguien llegue siquiera a intentarlo.
          const bloqueada = bloque.bloqueada;
          const anticiposDeEsteBloque = listaAnticipos.filter((ant) => ant.entrega_id === bloque.entrega.id);
          if (idx === 0 && !bloqueada) {
            const anticiposGenerales = listaAnticipos.filter((ant) => !ant.entrega_id);
            anticiposDeEsteBloque.push(...anticiposGenerales);
          }
          const subtotalArticulos = bloque.pedidos.reduce(
            (acc, p) => acc + (productosSeleccionados[p.id] ? Number(p.precio_venta) : 0),
            0
          );
          const totalDescuentoAnticipos = anticiposDeEsteBloque.reduce((acc, a) => acc + Number(a.monto), 0);
          const subtotalFinalEntrega = Math.max(0, subtotalArticulos - totalDescuentoAnticipos);
          const tipoEmpaqueBloque = bloque.pedidos.find((p) => p.tipo_empaque)?.tipo_empaque || null;

          return (
            <div
              key={idx}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--sup)', border: `1px solid ${bloqueada ? 'var(--ambar-borde)' : bloque.atrasada ? 'var(--rojo-t)' : 'var(--w08)'}` }}
            >
              <div
                className="flex items-center justify-between gap-3 px-5 py-3.5"
                style={{
                  background: bloqueada ? 'var(--ambar-suave)' : bloque.atrasada ? 'rgba(var(--rojo-rgb),0.08)' : 'var(--w03)',
                  borderBottom: `1px solid ${bloqueada ? 'var(--ambar-borde)' : bloque.atrasada ? 'rgba(var(--rojo-rgb),0.30)' : 'var(--w08)'}`,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 800, color: bloqueada ? 'var(--ambar-t)' : bloque.atrasada ? 'var(--rojo-t)' : 'var(--tinta)', letterSpacing: '0.02em' }}>
                  ENTREGA: {formatearFecha(bloque.entrega.fecha_entrega)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {tipoEmpaqueBloque && (
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: `${TIPO_EMPAQUE[tipoEmpaqueBloque].color}22`,
                        color: TIPO_EMPAQUE[tipoEmpaqueBloque].color,
                        border: `1px solid ${TIPO_EMPAQUE[tipoEmpaqueBloque].color}`,
                        borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 800,
                      }}
                    >
                      {TIPO_EMPAQUE[tipoEmpaqueBloque].icon} {TIPO_EMPAQUE[tipoEmpaqueBloque].label}
                    </span>
                  )}
                  {bloqueada && (
                    <span style={{ background: 'var(--ambar)', color: '#ffffff', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      🔒 AÚN NO ESTÁ EN TIENDA
                    </span>
                  )}
                  {bloque.atrasada && !bloqueada && (
                    <span style={{ background: 'var(--rojo)', color: '#ffffff', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em' }}>
                      ATRASADA
                    </span>
                  )}
                </div>
              </div>

              {bloqueada && (
                <div style={{ padding: '10px 20px', background: 'var(--ambar-suave)', borderBottom: '1px solid var(--w06)', fontSize: 12.5, color: 'var(--ambar-t)', lineHeight: 1.5 }}>
                  Esta entrega está <strong>en proceso</strong>: la mercancía todavía no llega.
                  No se puede cobrar hasta que se marque como <strong>En tienda</strong> en Encargos → Entregas.
                </div>
              )}

              <div className="px-5" style={bloqueada ? { opacity: 0.78, pointerEvents: 'none' } : undefined}>
                {bloque.pedidos.map((p) => {
                  const checked = !bloqueada && !!productosSeleccionados[p.id];
                  // En un bloque bloqueado la tarjeta entera ya va atenuada; si
                  // además tachamos cada renglón por "no palomeado", el texto se
                  // vuelve ilegible y el colaborador no puede decirle al cliente
                  // qué trae en camino. Ahí se leen todos con normalidad.
                  const legible = bloqueada || checked;
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid var(--w06)' }}>
                      <button
                        type="button"
                        onClick={() => setProductosSeleccionados({ ...productosSeleccionados, [p.id]: !checked })}
                        style={{
                          flex: 'none',
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          cursor: 'pointer',
                          border: checked ? 'none' : '2px solid var(--w30)',
                          background: checked ? 'var(--marca)' : 'transparent',
                          color: 'var(--tinta)',
                          fontSize: 15,
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                      >
                        {checked ? '✓' : ''}
                      </button>
                      <div
                        style={{
                          flex: 'none',
                          minWidth: 34,
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 8,
                          background: checked ? 'rgba(193,85,58,0.15)' : 'var(--w06)',
                          color: legible ? 'var(--marca-t)' : 'var(--w40)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        ×{p.cantidad || 1}
                      </div>
                      <FotoPedido
                        url={p.imagen_url_firmada}
                        descripcion={p.descripcion}
                        tam={48}
                        style={{
                          border: p.apartado_fragil ? '2px solid var(--ambar-borde)' : '1px solid var(--w15)',
                          background: 'var(--w05)', opacity: legible ? 1 : 0.4,
                        }}
                        onAmpliar={p.imagen_url_firmada ? () => setFotoModal({ url: p.imagen_url_firmada, descripcion: p.descripcion }) : null}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 600,
                            // Color explícito: sin él este texto no hereda nada
                            // útil y queda ilegible.
                            color: 'var(--tinta)',
                            opacity: legible ? 1 : 0.4,
                            textDecoration: legible ? 'none' : 'line-through',
                          }}
                        >
                          {p.descripcion}
                        </span>
                        {p.apartado_fragil && (
                          <span
                            style={{ flex: 'none', background: 'var(--ambar)', color: '#ffffff', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}
                          >
                            ⚠ APARTADOS / FRÁGIL
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: legible ? 'var(--tinta)' : 'var(--w40)', whiteSpace: 'nowrap' }}>
                        $ {money(Number(p.precio_venta))}
                      </div>
                    </div>
                  );
                })}
                {anticiposDeEsteBloque.map((anticipo, aIdx) => (
                  <div
                    key={anticipo.id || aIdx}
                    className="flex justify-between py-3 text-xs font-medium"
                    style={{ color: 'var(--verde)', borderTop: '1px solid var(--w04)' }}
                  >
                    <span>↓ Anticipo vinculado ({anticipo.creado_en ? formatearFechaCorta(anticipo.creado_en) : 'Fecha reciente'})</span>
                    <span className="tabular-nums font-bold">-${Number(anticipo.monto).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--w03)' }}>
                <span style={{ fontSize: 15, fontWeight: 700, opacity: bloqueada ? 0.6 : 1 }}>
                  {bloqueada ? 'Valor del encargo (no cobrable todavía)' : 'Monto de esta entrega'}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: bloqueada ? 'var(--w45)' : 'var(--marca-t)' }}>
                  $ {money(bloqueada ? bloque.pedidos.reduce((a, p) => a + (Number(p.precio_venta) || 0), 0) : subtotalFinalEntrega)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Pedidos de Mercadito pendientes de este cliente */}
        {pedidosMercadito.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--sup)', border: '1px solid rgba(168,154,248,0.35)' }}>
            <div className="flex items-center gap-2 px-5 py-3.5" style={{ background: 'rgba(168,154,248,0.1)', borderBottom: '1px solid rgba(168,154,248,0.25)' }}>
              <span style={{ fontSize: 16 }}>🛍️</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--marca-t)' }}>SU MERCADITO — pendiente de recoger</span>
            </div>
            <div className="px-5">
              {pedidosMercadito.map((pm) => {
                const checked = !!mercaditoSeleccionado[pm.id];
                const cubierto = pm.saldo <= 0;
                const itemsFragiles = (pm.items || [])
                  .filter((it) => it.apartado_fragil)
                  .reduce((s, it) => s + (Number(it.cantidad) || 1), 0);
                return (
                  <div key={pm.id} className="py-3" style={{ borderBottom: '1px solid var(--w06)' }}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setMercaditoSeleccionado({ ...mercaditoSeleccionado, [pm.id]: !checked })}
                        style={{
                          flex: 'none', width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                          border: checked ? 'none' : '2px solid var(--w30)',
                          background: checked ? 'var(--marca)' : 'transparent', color: 'var(--tinta)', fontSize: 15, fontWeight: 800, lineHeight: 1,
                        }}
                      >
                        {checked ? '✓' : ''}
                      </button>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, opacity: checked ? 1 : 0.6 }}>{pm.folio}</span>
                        {itemsFragiles > 0 && (
                          <span style={{ flex: 'none', background: 'var(--ambar)', color: '#ffffff', borderRadius: 7, padding: '3px 9px', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                            ⚠ {itemsFragiles} FRÁGIL
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: checked ? (cubierto ? 'var(--verde)' : 'var(--marca-t)') : 'var(--w40)', whiteSpace: 'nowrap' }}>
                        $ {money(pm.saldo)}
                      </div>
                    </div>

                    <div style={{ marginLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(pm.items || []).map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--w60)' }}>
                          <span>{it.cantidad}x {it.nombre}</span>
                          {it.apartado_fragil && (
                            <span style={{ flex: 'none', background: 'rgba(250,204,21,0.16)', color: 'var(--ambar-t)', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                              ⚠ FRÁGIL — no empacar, dejar en área de cuidado
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ marginLeft: 36, fontSize: 12, color: cubierto ? 'var(--verde)' : 'var(--w50)', marginTop: 6 }}>
                      Total $ {money(pm.total)} · Pagado $ {money(pm.pagado)}
                      {cubierto ? ' · ✓ cubierto por anticipo' : ` · Saldo $ ${money(pm.saldo)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DERECHA sticky */}
      <div className="flex flex-col gap-4" style={{ position: 'sticky', top: 14 }}>
        {/* Agregar producto de tienda */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 17 }}>🛒</span>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em' }}>AGREGAR PRODUCTO DE TIENDA</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--w45)', marginBottom: 12 }}>
            Algo extra del catálogo, además de su pedido.
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-3" style={{ background: 'var(--w05)', border: '1px solid var(--marca)' }}>
            <span style={{ opacity: 0.7 }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nombre o código…"
              className="flex-1 bg-transparent outline-none text-white text-sm"
            />
          </div>

          {productosFiltrados.length > 0 && (
            <div className="scrollpane flex flex-col gap-2 mt-3" style={{ maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
              {productosFiltrados.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-xl p-2" style={{ background: 'var(--w04)', border: '1px solid var(--w08)' }}>
                  <Foto imagenUrl={p.imagen_url_firmada} categoria={p.categoria} size={44} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--w50)', marginTop: 2 }}>
                      {p.categoria || 'Sin categoría'} · Stock {p.stock}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ambar-t)', whiteSpace: 'nowrap' }}>$ {money(p.precio_venta)}</div>
                  <button
                    type="button"
                    onClick={() => agregarProducto(p)}
                    style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'var(--marca)', color: '#ffffff', border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
          )}

          {lineasTienda.length > 0 && (
            <div className="mt-3.5 flex flex-col gap-2">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--w40)' }}>
                Productos de tienda agregados
              </div>
              {lineasTienda.map(({ linea, subtotal, baseSubtotal, tieneDescuento }) => (
                <div key={linea.id} className="rounded-xl p-2.5" style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.3)' }}>
                  <div className="flex items-center gap-2.5">
                    <Foto imagenUrl={linea.imagenUrl} categoria={linea.categoria} size={40} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {linea.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--w50)', marginTop: 2 }}>
                        $ {money(linea.precioUnitario)} c/u{linea.descuentoValor > 0 ? ` · ${linea.descuentoTipo === 'amount' ? `−$${money(linea.descuentoValor)}` : `−${linea.descuentoValor}%`}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMenuId((m) => (m === linea.id ? null : linea.id))}
                      style={{ flex: 'none', width: 28, height: 28, borderRadius: 8, background: menuId === linea.id ? 'rgba(193,85,58,0.25)' : 'var(--w06)', color: menuId === linea.id ? 'var(--marca-t)' : 'var(--w70)', border: 'none', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
                    >
                      ⋮
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2" style={{ marginTop: 8 }}>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => cambiarCantidad(linea.id, -1)} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--w08)', color: 'var(--tinta)', border: 'none', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>
                        −
                      </button>
                      <span style={{ minWidth: 20, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{linea.cantidad}</span>
                      <button type="button" onClick={() => cambiarCantidad(linea.id, 1)} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--w08)', color: 'var(--tinta)', border: 'none', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>
                        ＋
                      </button>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {tieneDescuento && <span style={{ fontSize: 11, color: 'var(--w40)', textDecoration: 'line-through', marginRight: 6 }}>$ {money(baseSubtotal)}</span>}
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ambar-t)' }}>$ {money(subtotal)}</span>
                    </div>
                  </div>
                  {menuId === linea.id && (
                    <div className="flex gap-2" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--w08)' }}>
                      <button type="button" onClick={() => abrirEditarPrecio(linea)} style={{ flex: 1, background: 'rgba(193,85,58,0.14)', border: '1px solid rgba(193,85,58,0.4)', color: 'var(--marca)', fontSize: 11.5, fontWeight: 700, padding: '8px 4px', borderRadius: 8, cursor: 'pointer' }}>✏️ Precio</button>
                      <button type="button" onClick={() => abrirEditarDescuento(linea)} style={{ flex: 1, background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.4)', color: 'var(--verde)', fontSize: 11.5, fontWeight: 700, padding: '8px 4px', borderRadius: 8, cursor: 'pointer' }}>🏷 Descuento</button>
                      <button type="button" onClick={() => quitarLinea(linea.id)} style={{ flex: 1, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--rojo-t)', fontSize: 11.5, fontWeight: 700, padding: '8px 4px', borderRadius: 8, cursor: 'pointer' }}>🗑 Quitar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen final */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--sup)', border: '1px solid var(--w10)' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--w08)', fontSize: 14, fontWeight: 800, letterSpacing: '0.05em' }}>
            🧾 RESUMEN FINAL
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {desgloseTicketEncargos.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div style={{ fontSize: 14, fontWeight: 700 }}>Encargo · Entrega {formatearFecha(item.fecha)}</div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>$ {money(item.montoNeto)}</div>
              </div>
            ))}
            {pedidosMercadito.filter((pm) => mercaditoSeleccionado[pm.id]).map((pm) => (
              <div key={pm.id} className="flex items-center justify-between">
                <div style={{ fontSize: 14, fontWeight: 700 }}>Mercadito · {pm.folio}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--marca-t)' }}>$ {money(pm.saldo)}</div>
              </div>
            ))}
            {lineasTienda.length > 0 && (
              <div className="flex items-center justify-between" style={{ paddingTop: 12, borderTop: '1px solid var(--w07)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Productos de tienda</div>
                  <div style={{ fontSize: 12, color: 'var(--w45)', marginTop: 2 }}>{storeCount} artículo(s) extra</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--marca-t)' }}>$ {money(montoTiendaExtra)}</div>
              </div>
            )}
            <div className="flex items-center justify-between" style={{ paddingTop: 14, borderTop: '1px solid var(--w12)' }}>
              <span style={{ fontSize: 15, color: 'var(--w70)', fontWeight: 700 }}>Total a cobrar</span>
              <span style={{ fontSize: 28, fontWeight: 900 }}>$ {money2(total)}</span>
            </div>
            {/* Si lo único que tiene el cliente son entregas que todavía no
                llegan, no hay nada que entregar: el botón no debe invitar a
                apretarlo "a ver qué pasa". */}
            {sinNadaQueCobrar ? (
              <div style={{ width: '100%', borderRadius: 12, padding: 15, marginTop: 2, textAlign: 'center', background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', color: 'var(--ambar-t)', fontSize: 13.5, fontWeight: 700, lineHeight: 1.5 }}>
                🔒 Nada que entregar todavía
                <div style={{ fontWeight: 500, fontSize: 12.5, marginTop: 4, color: 'var(--w45)' }}>
                  Su encargo está en una entrega que aún no llega a tienda.
                </div>
              </div>
            ) : (
            <button
              type="button"
              onClick={onCobrar}
              disabled={loading || !clienteSeleccionado}
              style={{
                width: '100%',
                background: !loading && clienteSeleccionado ? 'var(--marca)' : 'rgba(193,85,58,0.25)',
                color: !loading && clienteSeleccionado ? 'var(--tinta)' : 'var(--w50)',
                border: 'none',
                borderRadius: 12,
                padding: 15,
                fontSize: 15,
                fontWeight: 800,
                cursor: !loading && clienteSeleccionado ? 'pointer' : 'not-allowed',
                boxShadow: !loading && clienteSeleccionado ? '0 6px 20px rgba(193,85,58,0.4)' : 'none',
                marginTop: 2,
              }}
            >
              {loading ? 'Procesando…' : total === 0 ? '✅ Marcar como entregado' : `✓ Registrar pago · $ ${money2(total)}`}
            </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Editar precio */}
      {editLinea && editMode === 'price' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,12,24,0.7)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) cerrarModalLinea(); }}>
          <div style={{ width: '100%', maxWidth: 460, background: 'var(--sup-2)', border: '1px solid var(--w12)', borderRadius: 18, padding: '26px 26px 24px', boxShadow: '0 24px 60px var(--w55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Nuevo precio para el producto</div>
                <div style={{ fontSize: 14, color: 'var(--w50)', marginTop: 4 }}>Solo aplica a esta venta.</div>
              </div>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'var(--w06)', border: 'none', color: 'var(--w60)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0' }}>
              <Foto imagenUrl={editLinea.imagenUrl} categoria={editLinea.categoria} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editLinea.nombre}</div>
                <div style={{ fontSize: 14, color: 'var(--w55)', marginTop: 2 }}>$ {money(editLinea.precioUnitario)} /u.</div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--w60)', marginBottom: 8 }}>Precio personalizado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--w05)', border: '1px solid var(--marca)', borderRadius: 12, padding: '14px 16px' }}>
              <span style={{ fontSize: 20, color: 'var(--w60)', fontWeight: 700 }}>$</span>
              <input type="number" autoFocus value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} placeholder="0.00" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tinta)', fontSize: 20, fontWeight: 800 }} />
              <span style={{ fontSize: 14, color: 'var(--w45)', whiteSpace: 'nowrap' }}>Por unidad (u.)</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" onClick={guardarPrecio} style={{ flex: 1, background: 'var(--marca)', color: '#ffffff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirmar</button>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 1, background: 'var(--w06)', color: 'var(--w70)', border: '1px solid var(--w14)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Descuento por línea */}
      {editLinea && editMode === 'discount' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,12,24,0.7)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) cerrarModalLinea(); }}>
          <div style={{ width: '100%', maxWidth: 480, background: 'var(--sup-2)', border: '1px solid var(--w12)', borderRadius: 18, padding: '26px 26px 24px', boxShadow: '0 24px 60px var(--w55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Descuento sobre el producto</div>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'var(--w06)', border: 'none', color: 'var(--w60)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0' }}>
              <Foto imagenUrl={editLinea.imagenUrl} categoria={editLinea.categoria} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editLinea.nombre}</div>
                <div style={{ fontSize: 14, color: 'var(--w55)', marginTop: 2 }}>$ {money(editLinea.precioUnitario)} /u.</div>
              </div>
            </div>
            <DescuentoForm
              tipo={discountType}
              setTipo={setDiscountType}
              draft={discountDraft}
              setDraft={setDiscountDraft}
              onConfirmar={guardarDescuento}
              onCancelar={cerrarModalLinea}
            />
          </div>
        </div>
      )}
      {fotoModal && (
        <div
          onClick={() => setFotoModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'var(--w80)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}
        >
          <div style={{ fontSize: 13, color: 'var(--w60)', marginBottom: 14, textAlign: 'center', maxWidth: 500 }}>{fotoModal.descripcion}</div>
          <img
            src={fotoModal.url}
            alt={fotoModal.descripcion}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 14, boxShadow: '0 20px 60px var(--w70)' }}
          />
          <button
            onClick={() => setFotoModal(null)}
            style={{ marginTop: 20, background: 'var(--w10)', color: 'var(--tinta)', border: '1px solid var(--w20)', borderRadius: 10, padding: '10px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
