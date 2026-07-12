'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconCart } from './HeaderIcons';
import { leerCarrito, calcularTotales, CARRITO_EVENTO } from '../../../lib/mercadito/carritoUtils';

// Botón de carrito con contador en tiempo real — reutilizado en Inicio del
// cliente y en las pantallas de Cuenta (Detalle/Domicilio/Historial) para
// que el carrito siempre esté a un toque, no solo dentro del Mercadito.
export default function BotonCarrito() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const actualizar = () => setCount(calcularTotales(leerCarrito()).totalArticulos);
    actualizar();
    window.addEventListener(CARRITO_EVENTO, actualizar);
    window.addEventListener('storage', actualizar);
    return () => {
      window.removeEventListener(CARRITO_EVENTO, actualizar);
      window.removeEventListener('storage', actualizar);
    };
  }, []);

  return (
    <button
      onClick={() => router.push('/mercadito/carrito')}
      title="Tu carrito"
      style={{ position: 'relative', flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(193,85,58,0.13)', border: 'none', cursor: 'pointer' }}
    >
      <IconCart size={18} fill="#c1553a" />
      {count > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: '#c1553a', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fbf8f3' }}>
          {count}
        </span>
      )}
    </button>
  );
}
