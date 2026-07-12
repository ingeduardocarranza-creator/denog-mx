'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconUser } from './HeaderIcons';

const boton = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };

// Botón de usuario del header de Mercadito. Con sesión iniciada va directo
// a la cuenta; sin sesión abre un menú para elegir entre iniciar sesión o
// seguir navegando/comprando como invitado (el checkout ya sabe manejar
// ambos casos — esto solo evita que el ícono mande a alguien sin sesión a
// una pantalla que de todos modos lo iba a rebotar).
export default function MenuUsuario({ cliente }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [abierto]);

  if (cliente) {
    return (
      <div onClick={() => router.push('/cliente/detalle')} style={boton} title="Mi cuenta">
        <IconUser size={18} fill="#2a2118" />
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setAbierto((v) => !v)} style={boton} title="Cuenta">
        <IconUser size={18} fill="#2a2118" />
      </div>
      {abierto && (
        <div style={{
          position: 'absolute', top: 46, right: 0, background: '#fff',
          border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14,
          boxShadow: '0 12px 30px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 40, minWidth: 220,
        }}>
          <button
            onClick={() => { setAbierto(false); router.push('/'); }}
            style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-poppins)', fontSize: 13.5, fontWeight: 600, color: '#2a2118' }}
          >
            🔑 Iniciar sesión
          </button>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
          <button
            onClick={() => setAbierto(false)}
            style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-poppins)', fontSize: 13.5, fontWeight: 600, color: 'rgba(42,33,24,0.6)' }}
          >
            🙂 Continuar como invitado
          </button>
        </div>
      )}
    </div>
  );
}
