'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import TarjetaCliente from '../../components/cliente/TarjetaCliente';
import { leerCarrito, guardarCarrito, actualizarCantidad, quitarLinea, calcularTotales } from '../../../lib/mercadito/carritoUtils';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CarritoMercadito() {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setCart(leerCarrito());
    setListo(true);
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
          <div onClick={() => router.push('/mercadito')} style={{ color: '#2a2118', fontSize: 20, cursor: 'pointer' }}>←</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(193,85,58,0.35))' }} />
            <div style={{ fontFamily: 'var(--font-baloo2)', color: '#2a2118', fontWeight: 700, fontSize: 19 }}>Tu carrito</div>
          </div>
          <div style={{ width: 20 }} />
        </div>

        {cart.length === 0 ? (
          <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 13, textAlign: 'center', padding: '36px 0' }}>
            Carrito vacío.<br />Vuelve al mercadito y agrega productos.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {cart.map((ci) => (
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
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div onClick={() => actualizar(actualizarCantidad(cart, ci.productoId, ci.cantidad - 1))} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', color: '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</div>
                      <div style={{ color: '#2a2118', fontSize: 13, fontWeight: 700, width: 16, textAlign: 'center' }}>{ci.cantidad}</div>
                      <div onClick={() => actualizar(actualizarCantidad(cart, ci.productoId, ci.cantidad + 1))} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(0,0,0,0.06)', color: '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</div>
                    </div>
                    <div onClick={() => actualizar(quitarLinea(cart, ci.productoId))} style={{ color: '#c0392b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑 Quitar</div>
                  </div>
                </div>
              ))}
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
