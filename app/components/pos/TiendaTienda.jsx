'use client';

import { useMemo, useState } from 'react';
import {
  crearLineaCatalogo,
  crearLineaMonto,
  calcularLineaEfectiva,
  calcularTotalesCarrito,
} from '../../../lib/pos/tiendaUtils';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PALETA_CATEGORIAS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#facc15', '#fb7185', '#a78bfa', '#f59e0b'];
const colorParaCategoria = (categoria) => {
  const str = categoria || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETA_CATEGORIAS[hash % PALETA_CATEGORIAS.length];
};

function Foto({ imagenUrl, categoria, size = 46 }) {
  const color = colorParaCategoria(categoria);
  if (imagenUrl) {
    return (
      <img
        src={imagenUrl}
        alt=""
        style={{ flex: 'none', width: size, height: size, borderRadius: 10, objectFit: 'cover', border: `1px solid ${color}55` }}
      />
    );
  }
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: 10, background: color + '22', border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>
      📦
    </div>
  );
}

export default function TiendaTienda({
  productos,
  cart,
  setCart,
  descuentoVenta,
  setDescuentoVenta,
  vendedorTienda,
  setVendedorTienda,
  vendedores,
  colaborador,
  todosClientes,
  clienteTienda,
  setClienteTienda,
  onCobrar,
  loading,
}) {
  const [subtab, setSubtab] = useState('productos');
  // Captura el monto como si fuera una caja registradora: se escriben puros
  // dígitos y los 2 últimos siempre son los centavos, sin necesidad de
  // teclear el punto decimal (evita cobros confusos por un punto olvidado).
  const [montoCentavos, setMontoCentavos] = useState('');
  const montoNumero = parseInt(montoCentavos || '0', 10) / 100;
  const montoFormateado = montoNumero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const onMontoInput = (e) => {
    const soloDigitos = e.target.value.replace(/\D/g, '');
    const comoEntero = parseInt(soloDigitos || '0', 10);
    if (comoEntero > 999999999) return; // tope ~$9,999,999.99
    setMontoCentavos(String(comoEntero));
  };
  const [montoDesc, setMontoDesc] = useState('');
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('Todos');

  const [menuId, setMenuId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editMode, setEditMode] = useState(null); // 'price' | 'discount'
  const [priceDraft, setPriceDraft] = useState('');
  const [discountType, setDiscountType] = useState('percent');
  const [discountDraft, setDiscountDraft] = useState('');

  const [ventaDiscountOpen, setVentaDiscountOpen] = useState(false);
  const [ventaDiscountType, setVentaDiscountType] = useState(descuentoVenta?.tipo || 'percent');
  const [ventaDiscountDraft, setVentaDiscountDraft] = useState(descuentoVenta?.valor ? String(descuentoVenta.valor) : '');

  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const [clienteQuery, setClienteQuery] = useState('');

  const categorias = useMemo(() => {
    const unicas = [...new Set((productos || []).map((p) => p.categoria).filter(Boolean))];
    return ['Todos', ...unicas];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (productos || []).filter((p) => {
      const enCategoria = activeCat === 'Todos' || p.categoria === activeCat;
      const coincide = q === '' || p.nombre?.toLowerCase().includes(q) || p.codigo_barras?.includes(query.trim());
      return enCategoria && coincide;
    });
  }, [productos, activeCat, query]);

  const clientesFiltrados = useMemo(() => {
    const q = clienteQuery.trim().toLowerCase();
    if (q === '') return [];
    return (todosClientes || []).filter((c) => c.nombre?.toLowerCase().includes(q) || c.telefono?.includes(clienteQuery.trim())).slice(0, 8);
  }, [todosClientes, clienteQuery]);

  const { lineas, subtotalBruto, total } = useMemo(() => calcularTotalesCarrito(cart, descuentoVenta), [cart, descuentoVenta]);

  const editLinea = cart.find((l) => l.id === editId) || null;

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
  };

  const agregarMonto = () => {
    if (!(montoNumero > 0)) return;
    setCart((prev) => [...prev, crearLineaMonto(montoDesc, montoNumero)]);
    setMontoCentavos('');
    setMontoDesc('');
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

  const guardarDescuentoVenta = () => {
    let v = parseFloat(ventaDiscountDraft);
    if (isNaN(v) || v < 0) v = 0;
    if (ventaDiscountType === 'percent') v = Math.min(100, v);
    setDescuentoVenta(v > 0 ? { tipo: ventaDiscountType, valor: v } : { tipo: null, valor: 0 });
    setVentaDiscountOpen(false);
  };

  const montoValido = montoNumero > 0;
  const carritoVacio = cart.length === 0;

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 400px', alignItems: 'start' }}>
      {/* IZQUIERDA: entrada */}
      <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => setSubtab('monto')}
            style={{ flex: 1, background: subtab === 'monto' ? 'rgba(59,130,246,0.16)' : 'transparent', color: subtab === 'monto' ? '#3b82f6' : 'rgba(255,255,255,0.55)', border: 'none', borderRadius: 11, padding: 13, fontSize: 15, fontWeight: subtab === 'monto' ? 800 : 700, cursor: 'pointer' }}
          >
            💵 Monto
          </button>
          <button
            type="button"
            onClick={() => setSubtab('productos')}
            style={{ flex: 1, background: subtab === 'productos' ? 'rgba(59,130,246,0.16)' : 'transparent', color: subtab === 'productos' ? '#3b82f6' : 'rgba(255,255,255,0.55)', border: 'none', borderRadius: 11, padding: 13, fontSize: 15, fontWeight: subtab === 'productos' ? 800 : 700, cursor: 'pointer' }}
          >
            🔎 Productos
          </button>
        </div>

        {subtab === 'monto' ? (
          <div style={{ padding: '34px 28px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 40, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={montoFormateado}
                onChange={onMontoInput}
                style={{ width: 260, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 64, fontWeight: 800, textAlign: 'left' }}
              />
            </div>
            {montoCentavos && (
              <button
                type="button"
                onClick={() => setMontoCentavos('')}
                style={{ marginTop: -12, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                ✕ Borrar monto
              </button>
            )}
            <input
              type="text"
              value={montoDesc}
              onChange={(e) => setMontoDesc(e.target.value)}
              placeholder="✏️ Agregar descripción (ej. Producto sin código)"
              style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '13px 16px', color: '#fff', fontSize: 15, outline: 'none', textAlign: 'center' }}
            />
            <button
              type="button"
              onClick={agregarMonto}
              disabled={!montoValido}
              style={{ width: '100%', maxWidth: 420, border: 'none', borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 800, cursor: montoValido ? 'pointer' : 'not-allowed', background: montoValido ? '#3b82f6' : 'rgba(59,130,246,0.25)', color: montoValido ? '#fff' : 'rgba(255,255,255,0.5)' }}
            >
              ＋ Agregar a la venta
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px 22px 24px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid #3b82f6', borderRadius: 12, padding: '12px 16px' }}>
                <span style={{ fontSize: 16, opacity: 0.7 }}>🔍</span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const exacto = (productos || []).find((p) => p.codigo_barras === query.trim());
                    if (exacto) { agregarProducto(exacto); setQuery(''); return; }
                    if (productosFiltrados.length === 1) { agregarProducto(productosFiltrados[0]); setQuery(''); }
                  }}
                  placeholder="Buscar producto o escanear código de barras…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {categorias.map((cat) => {
                const activo = cat === activeCat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCat(cat)}
                    style={{
                      background: activo ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                      color: activo ? '#3b82f6' : 'rgba(255,255,255,0.7)',
                      border: `1px solid ${activo ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: 999,
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: activo ? 700 : 600,
                      cursor: 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="scrollpane" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
              {productosFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin resultados.</div>
              )}
              {productosFiltrados.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px' }}>
                  <Foto imagenUrl={p.imagen_url} categoria={p.categoria} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{p.nombre}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{p.categoria || 'Sin categoría'} · Stock {p.stock}</div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#facc15', whiteSpace: 'nowrap' }}>$ {money(p.precio_venta)}</div>
                  <button
                    type="button"
                    onClick={() => agregarProducto(p)}
                    style={{ flex: 'none', width: 38, height: 38, borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 20, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {vendedores && vendedores.length > 1 && (
          <div style={{ margin: '0 22px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>👤 ¿Quién realizó esta venta?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {vendedores.map((v) => {
                const activo = vendedorTienda?.id === v.id;
                const iniciales = v.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVendedorTienda(v)}
                    style={{ flex: 1, minWidth: 80, background: activo ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activo ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '8px 6px', cursor: 'pointer' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: activo ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: activo ? '#3b82f6' : 'rgba(255,255,255,0.5)', fontWeight: 700, margin: '0 auto 5px' }}>
                      {iniciales}
                    </div>
                    <div style={{ color: activo ? '#3b82f6' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: activo ? 600 : 400 }}>{v.nombre.split(' ')[0]}</div>
                    {v.id === colaborador?.id && <div style={{ color: activo ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.2)', fontSize: 9 }}>En sesión</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DERECHA: carrito */}
      <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🛒 Carrito</div>
          <button type="button" onClick={() => setCart([])} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🗑 Vaciar
          </button>
        </div>

        <div className="scrollpane" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '62vh', overflowY: 'auto' }}>
          {carritoVacio && (
            <div style={{ textAlign: 'center', padding: '44px 16px', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
              Carrito vacío.
              <br />
              Agrega un monto o un producto.
            </div>
          )}
          {lineas.map(({ linea, subtotal, baseSubtotal, tieneDescuento }) => (
            <div key={linea.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Foto imagenUrl={linea.imagenUrl} categoria={linea.categoria} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linea.nombre}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                    $ {money(linea.precioUnitario)} c/u{linea.descuentoValor > 0 ? ` · ${linea.descuentoTipo === 'amount' ? `−$${money(linea.descuentoValor)}` : `−${linea.descuentoValor}%`}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuId((m) => (m === linea.id ? null : linea.id))}
                  style={{ flex: 'none', width: 32, height: 32, borderRadius: 8, background: menuId === linea.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)', color: menuId === linea.id ? '#3b82f6' : 'rgba(255,255,255,0.7)', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                >
                  ⋮
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" onClick={() => cambiarCantidad(linea.id, -1)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>−</button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{linea.cantidad}</span>
                  <button type="button" onClick={() => cambiarCantidad(linea.id, 1)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {tieneDescuento && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through', marginRight: 6 }}>$ {money(baseSubtotal)}</span>}
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#facc15' }}>$ {money(subtotal)}</span>
                </div>
              </div>
              {menuId === linea.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button type="button" onClick={() => abrirEditarPrecio(linea)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(59,130,246,0.14)', border: '1px solid rgba(59,130,246,0.4)', color: '#3b82f6', fontSize: 12.5, fontWeight: 700, padding: '9px 6px', borderRadius: 9, cursor: 'pointer' }}>✏️ Precio</button>
                  <button type="button" onClick={() => abrirEditarDescuento(linea)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399', fontSize: 12.5, fontWeight: 700, padding: '9px 6px', borderRadius: 9, cursor: 'pointer' }}>🏷 Descuento</button>
                  <button type="button" onClick={() => quitarLinea(linea.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', fontSize: 12.5, fontWeight: 700, padding: '9px 6px', borderRadius: 9, cursor: 'pointer' }}>🗑 Quitar</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 20px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
            {clienteTienda ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>👤 {clienteTienda.nombre}</span>
                <button type="button" onClick={() => setClienteTienda(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Quitar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setClientePickerOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', color: '#3b82f6', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                👤 Agregar cliente
              </button>
            )}
            {clientePickerOpen && !clienteTienda && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 8 }}>
                <input
                  type="text"
                  autoFocus
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  placeholder="Buscar por nombre o teléfono…"
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, padding: '6px 4px' }}
                />
                {clientesFiltrados.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { setClienteTienda(c); setClientePickerOpen(false); setClienteQuery(''); }}
                    style={{ padding: '8px 6px', fontSize: 13, color: '#e2e8f0', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {c.nombre} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{c.telefono}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => { setVentaDiscountType(descuentoVenta?.tipo || 'percent'); setVentaDiscountDraft(descuentoVenta?.valor ? String(descuentoVenta.valor) : ''); setVentaDiscountOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', color: '#3b82f6', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              🏷 Aplicar descuento{descuentoVenta?.valor > 0 ? ` (${descuentoVenta.tipo === 'amount' ? `−$${money(descuentoVenta.valor)}` : `−${descuentoVenta.valor}%`})` : ''}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>Total a cobrar</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>$ {money(total)}</span>
          </div>

          <button
            type="button"
            onClick={onCobrar}
            disabled={loading || carritoVacio}
            style={{ width: '100%', border: 'none', borderRadius: 12, padding: 16, fontSize: 17, fontWeight: 800, cursor: loading || carritoVacio ? 'not-allowed' : 'pointer', background: !loading && !carritoVacio ? '#3b82f6' : 'rgba(59,130,246,0.25)', color: !loading && !carritoVacio ? '#fff' : 'rgba(255,255,255,0.5)', boxShadow: !loading && !carritoVacio ? '0 6px 20px rgba(59,130,246,0.4)' : 'none' }}
          >
            {loading ? 'Procesando…' : `Cobrar $ ${money(total)}`}
          </button>
        </div>
      </div>

      {/* MODAL: Editar precio */}
      {editLinea && editMode === 'price' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,12,24,0.7)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) cerrarModalLinea(); }}>
          <div style={{ width: '100%', maxWidth: 460, background: '#152036', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '26px 26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Nuevo precio para el producto</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Solo aplica a esta venta.</div>
              </div>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0' }}>
              <Foto imagenUrl={editLinea.imagenUrl} categoria={editLinea.categoria} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editLinea.nombre}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>$ {money(editLinea.precioUnitario)} /u.</div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Precio personalizado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid #3b82f6', borderRadius: 12, padding: '14px 16px' }}>
              <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>$</span>
              <input type="number" autoFocus value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} placeholder="0.00" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 20, fontWeight: 800 }} />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>Por unidad (u.)</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" onClick={guardarPrecio} style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirmar</button>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Descuento por línea */}
      {editLinea && editMode === 'discount' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,12,24,0.7)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) cerrarModalLinea(); }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#152036', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '26px 26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Descuento sobre el producto</div>
              <button type="button" onClick={cerrarModalLinea} style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '20px 0' }}>
              <Foto imagenUrl={editLinea.imagenUrl} categoria={editLinea.categoria} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editLinea.nombre}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>$ {money(editLinea.precioUnitario)} /u.</div>
              </div>
            </div>
            <DescuentoForm
              tipo={discountType}
              setTipo={setDiscountType}
              draft={discountDraft}
              setDraft={setDiscountDraft}
              confirmarLabel="Confirmar"
              onConfirmar={guardarDescuento}
              onCancelar={cerrarModalLinea}
            />
          </div>
        </div>
      )}

      {/* MODAL: Descuento a nivel venta */}
      {ventaDiscountOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,12,24,0.7)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={(e) => { if (e.target === e.currentTarget) setVentaDiscountOpen(false); }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#152036', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '26px 26px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Descuento sobre la venta</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Se reparte entre todos los productos del carrito.</div>
              </div>
              <button type="button" onClick={() => setVentaDiscountOpen(false)} style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ marginTop: 20 }}>
              <DescuentoForm
                tipo={ventaDiscountType}
                setTipo={setVentaDiscountType}
                draft={ventaDiscountDraft}
                setDraft={setVentaDiscountDraft}
                confirmarLabel="Confirmar"
                onConfirmar={guardarDescuentoVenta}
                onCancelar={() => setVentaDiscountOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DescuentoForm({ tipo, setTipo, draft, setDraft, onConfirmar, onCancelar }) {
  const prefijo = tipo === 'amount' ? '$' : '%';
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, padding: '13px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          <option value="percent" style={{ background: '#152036' }}>Porcentaje (%)</option>
          <option value="amount" style={{ background: '#152036' }}>Monto ($)</option>
        </select>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid #3b82f6', borderRadius: 12, padding: '13px 16px' }}>
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>{prefijo}</span>
          <input type="number" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 17, fontWeight: 800 }} />
        </div>
      </div>
      {tipo === 'percent' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {[10, 15, 20].map((pct) => (
            <button key={pct} type="button" onClick={() => setDraft(String(pct))} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              {pct} %
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onConfirmar} style={{ flex: 1, background: '#34d399', color: '#0f172a', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirmar</button>
        <button type="button" onClick={onCancelar} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
      </div>
    </>
  );
}
