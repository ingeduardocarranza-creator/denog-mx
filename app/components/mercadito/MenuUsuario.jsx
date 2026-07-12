'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IconUser } from './HeaderIcons';

const boton = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };
const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 9, padding: '9px 11px', color: '#2a2118', fontSize: 12.5, marginBottom: 8, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

// Botón de usuario del header de Mercadito. Con sesión iniciada va directo
// a la cuenta; sin sesión abre un menú para elegir entre iniciar sesión
// (formulario embebido aquí mismo, igual que ya funciona en checkout — sin
// mandar al invitado a la Portada a buscarlo) o seguir como invitado.
//
// onLogin: se llama con el cliente recién autenticado para que la pantalla
// donde vive este botón actualice su propio estado al instante.
export default function MenuUsuario({ cliente, onLogin }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cerrar(); };
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [abierto]);

  const cerrar = () => {
    setAbierto(false);
    setMostrarLogin(false);
    setUsuario('');
    setPassword('');
    setError('');
  };

  const enviarLogin = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || !password.trim()) { setError('Completa usuario y contraseña.'); return; }
    setCargando(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), password }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'Usuario o contraseña incorrectos');
      const c = { id: datos.id, nombre: datos.nombre, rol: datos.rol };
      localStorage.setItem('cliente', JSON.stringify(c));
      cerrar();
      onLogin?.(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

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
          boxShadow: '0 12px 30px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 40, minWidth: 230,
        }}>
          {!mostrarLogin ? (
            <>
              <button onClick={() => setMostrarLogin(true)} style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-poppins)', fontSize: 13.5, fontWeight: 600, color: '#2a2118' }}>
                🔑 Iniciar sesión
              </button>
              <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
              <button onClick={cerrar} style={{ display: 'block', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-poppins)', fontSize: 13.5, fontWeight: 600, color: 'rgba(42,33,24,0.6)' }}>
                🙂 Continuar como invitado
              </button>
            </>
          ) : (
            <form onSubmit={enviarLogin} style={{ padding: 14 }}>
              <button type="button" onClick={() => setMostrarLogin(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10, color: 'rgba(42,33,24,0.45)', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}>
                ‹ Volver
              </button>
              <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Usuario" autoComplete="username" style={inputStyle} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" autoComplete="current-password" style={{ ...inputStyle, marginBottom: 10 }} />
              {error && <div style={{ color: '#c0392b', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>{error}</div>}
              <button type="submit" disabled={cargando} style={{ width: '100%', textAlign: 'center', background: '#c1553a', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 9, padding: 10, cursor: cargando ? 'default' : 'pointer', opacity: cargando ? 0.7 : 1, fontFamily: 'inherit' }}>
                {cargando ? 'Entrando…' : 'Entrar →'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
