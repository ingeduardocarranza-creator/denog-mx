'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import TarjetaCliente from '../../components/cliente/TarjetaCliente';
import { IconHouse } from '../../components/mercadito/HeaderIcons';
import MenuUsuario from '../../components/mercadito/MenuUsuario';
import { leerCarrito, guardarCarrito, actualizarCantidad, quitarLinea, calcularTotales, sincronizarStock } from '../../../lib/mercadito/carritoUtils';
import { irAInicio, volverSeguro } from '../../../lib/mercadito/navegacion';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const botonCaja = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const botonGris = { ...botonCaja, background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };
const botonNaranja = { ...botonCaja, background: '#c1553a' };

export default function CarritoMercadito() {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [stockPorProducto, setStockPorProducto] = useState({});
  const [listo, setListo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [cliente, setCliente] = useState(null);

  useEffect(() => {
    const datos = localStorage.getItem('cliente');
    if (datos) { try { setCliente(JSON.parse(datos)) } catch {} }
  }, []);

  // Trae el stock real y fresco de cada producto en el carrito, y ajusta el
  // carrito si algo cambió desde que se agregó (bajó el stock, se agotó, o
  // ya no existe/no está publicado) — misma regla que ya usa el checkout.
  const sincronizar = async () => {
    const actual = leerCarrito();
    if (actual.length === 0) { setCart([]); setStockPorProducto({}); setListo(true); return; }

    const ids = actual.map((l) => l.productoId);
    const { data } = await supabase.from('productos_tienda').select('id, stock').in('id', ids);
    const productosPorId = Object.fromEntries((data || []).map((p) => [p.id, p]));

    const { cart: ajustado, removidos } = sincronizarStock(actual, productosPorId);
    if (removidos.length > 0 || ajustado.some((l, i) => l.cantidad !== actual[i]?.cantidad)) {
      guardarCarrito(ajustado);
      if (removidos.length > 0) {
        setAviso(`Actualizamos tu carrito: ${removidos.map((r) => r.nombre).join(', ')} ya no ${removidos.length === 1 ? 'tiene' : 'tienen'} stock y se quitó.`);
      } else {
        setAviso('Ajustamos algunas cantidades a lo que hay disponible en stock.');
      }
    }
    setCart(ajustado);
    setStockPorProducto(Object.fromEntries((data || []).map((p) => [p.id, Number(p.stock) || 0])));
    setListo(true);
  };

  useEffect(() => {
    sincronizar();

    // Solo "storage" (otra pestaña) — el evento propio del carrito ya lo
    // disparamos nosotros mismos con guardarCarrito() en cada +/-, así que
    // escucharlo aquí solo provocaría una consulta de stock redundante por
    // cada clic.
    const onCambioOtraPestana = () => sincronizar();
    window.addEventListener('storage', onCambioOtraPestana);
    return () => window.removeEventListener('storage', onCambioOtraPestana);
  }, []);

  const actualizar = (next) => {
    setCart(next);
    guardarCarrito(next);
  };

  const { total } = calcularTotales(cart);

  if (!listo) return <div style={{ minHeight: '100vh', background: '#fbf8f3' }} />;

  return (
    <TarjetaCliente>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div onClick={() => volverSeguro(router, '/mercadito')} style={{ ...botonGris, fontSize: 20 }}>←</div>
            <div onClick={() => irAInicio(router, cliente)} style={botonNaranja} title="Inicio">
              <IconHouse size={18} fill="#fff" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(193,85,58,0.35))' }} />
            <div style={{ fontFamily: 'var(--font-baloo2)', color: '#2a2118', fontWeight: 700, fontSize: 19 }}>Tu carrito</div>
          </div>
          <MenuUsuario cliente={cliente} onLogin={setCliente} />
        </div>

        {aviso && (
          <div style={{ background: 'rgba(250,204,21,0.15)', border: '1.5px solid rgba(202,138,4,0.3)', color: '#8a6d00', fontSize: 12, borderRadius: 10, padding: '10px 12px', marginBottom: 14, lineHeight: 1.5 }}>
            ⚠️ {aviso}
          </div>
        )}

        {cart.length === 0 ? (
          <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 13, textAlign: 'center', padding: '36px 0' }}>
            Carrito vacío.<br />Vuelve al mercadito y agrega productos.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {cart.map((ci) => {
                const stockDisponible = stockPorProducto[ci.productoId] ?? Infinity;
                const enTope = ci.cantidad >= stockDisponible;
                return (
                  <div key={ci.productoId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 12 }}>
                    <div
                      style={{
                        flex: 'none', width: 56, height: 56, borderRadius: 10,
                        background: ci.imagenUrl ? `center / cover no-repeat url(${ci.imagenUrl})` : 'rgba(193,85,58,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                      }}
                    >
                      {!ci.imagenUrl && '🛍️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#2a2118', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{ci.nombre}</div>
                      <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12, marginTop: 2 }}>
                        ${money(ci.precioUnitario)} c/u · Subtotal ${money(ci.precioUnitario * ci.cantidad)}
                      </div>
                      {enTope && (
                        <div style={{ color: '#a3432b', fontSize: 10.5, marginTop: 2 }}>Solo quedan {stockDisponible} en stock</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div onClick={() => actualizar(actualizarCantidad(cart, ci.productoId, ci.cantidad - 1, stockDisponible))} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', color: '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</div>
                        <div style={{ color: '#2a2118', fontSize: 13, fontWeight: 700, width: 16, textAlign: 'center' }}>{ci.cantidad}</div>
                        <div
                          onClick={() => !enTope && actualizar(actualizarCantidad(cart, ci.productoId, ci.cantidad + 1, stockDisponible))}
                          style={{ width: 26, height: 26, borderRadius: 7, background: enTope ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)', color: enTope ? 'rgba(42,33,24,0.25)' : '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: enTope ? 'not-allowed' : 'pointer' }}
                        >
                          +
                        </div>
                      </div>
                      <div onClick={() => actualizar(quitarLinea(cart, ci.productoId))} style={{ color: '#c0392b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑 Quitar</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1.5px solid rgba(0,0,0,0.08)', marginBottom: 18 }}>
              <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13, fontWeight: 600 }}>Total</div>
              <div style={{ color: '#2a2118', fontSize: 20, fontWeight: 800 }}>${money(total)}</div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/mercadito/checkout')}
              style={{ width: '100%', textAlign: 'center', background: '#c1553a', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Continuar →
            </button>
            <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 11, marginTop: 10 }}>
              🔒 Tu carrito se guarda solo; si cierras la página seguirá aquí hasta que lo vacíes.
            </div>
          </>
        )}
      </div>
    </TarjetaCliente>
  );
}
