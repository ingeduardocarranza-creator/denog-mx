'use client';

import { useState, useEffect } from 'react';

// En celular: la tarjeta ocupa toda la pantalla, como cualquier página web
// móvil normal. En computadora: se ve como una tarjeta angosta centrada
// sobre un fondo neutro (mismo tratamiento que el prototipo de diseño),
// para que no parezca una página móvil rota estirada a lo ancho.
export default function TarjetaCliente({ children, maxWidth = 480 }) {
  const [esEscritorio, setEsEscritorio] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    setEsEscritorio(mq.matches);
    const handler = (e) => setEsEscritorio(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: esEscritorio ? '#e9e4da' : '#fbf8f3',
      display: 'flex', justifyContent: 'center',
      padding: esEscritorio ? '40px 16px' : 0,
      fontFamily: 'var(--font-poppins)',
    }}>
      <div style={{
        width: '100%', maxWidth, background: '#fbf8f3',
        borderRadius: esEscritorio ? 32 : 0,
        border: esEscritorio ? '1px solid rgba(0,0,0,0.08)' : 'none',
        boxShadow: esEscritorio ? '0 30px 70px rgba(0,0,0,0.25)' : 'none',
        overflow: 'hidden',
        minHeight: esEscritorio ? 800 : '100vh',
      }}>
        {children}
      </div>
    </div>
  );
}
