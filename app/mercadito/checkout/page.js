'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { leerCarrito, vaciarCarrito, calcularTotales } from '../../../lib/mercadito/carritoUtils';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMERO_DENOG = '526625486432';

const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '11px 14px', color: '#fff', fontSize: 13, marginBottom: 10, outline: 'none' };
const botonMorado = { display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg,#8b7cf6,#a89af8)', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer' };
const botonVerde = { ...botonMorado, background: '#25D366' };

export default function CheckoutMercadito() {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [listo, setListo] = useState(false);
  const [cliente, setCliente] = useState(null);

  const [dispositivo, setDispositivo] = useState('movil');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const [loginUsuario, setLoginUsuario] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginCargando, setLoginCargando] = useState(false);

  useEffect(() => {
    const cartActual = leerCarrito();
    setCart(cartActual);
    if (cartActual.length === 0) router.replace('/mercadito/carrito');

    const datos = localStorage.getItem('cliente');
    if (datos) setCliente(JSON.parse(datos));

    setDispositivo(window.matchMedia('(max-width: 640px)').matches ? 'movil' : 'desktop');
    setListo(true);
  }, []);

  const { total } = calcularTotales(cart);

  const resumenTexto = () => {
    const lineas = cart.map((ci) => `• ${ci.cantidad}x ${ci.nombre} — $${money(ci.precioUnitario)}`).join('\n');
    return `🛍️ *Pedido Mercadito Denog*\n\nCliente: ${nombre || '(sin nombre)'}\n\n${lineas}\n\nTotal: $${money(total)} MXN`;
  };

  const enviarInvitadoDesktop = async () => {
    if (!nombre.trim() || !telefono.trim()) { setError('Escribe tu nombre y tu número de WhatsApp.'); return; }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/mercadito/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((ci) => ({ producto_id: ci.productoId, cantidad: ci.cantidad })),
          invitado: { nombre: nombre.trim(), telefono: telefono.trim() },
        }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo enviar tu pedido.');
      vaciarCarrito();
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const agregarAProximaEntrega = async () => {
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/mercadito/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((ci) => ({ producto_id: ci.productoId, cantidad: ci.cantidad })),
          cliente_id: cliente.id,
        }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo enviar tu pedido.');
      vaciarCarrito();
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setLoginCargando(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: loginUsuario, password: loginPassword }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo iniciar sesión.');
      const c = { id: datos.id, nombre: datos.nombre, rol: datos.rol };
      localStorage.setItem('cliente', JSON.stringify(c));
      setCliente(c);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginCargando(false);
    }
  };

  if (!listo) return <div style={{ minHeight: '100vh', background: '#0b0818' }} />;

  return (
    <div style={{ minHeight: '100vh', background: '#0b0818', fontFamily: 'var(--font-poppins)' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div onClick={() => router.push('/mercadito/carrito')} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer' }}>←</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(139,124,246,0.5))' }} />
            <div style={{ fontFamily: 'var(--font-baloo2)', color: '#fff', fontWeight: 700, fontSize: 19 }}>Finalizar pedido</div>
          </div>
          <div style={{ width: 20 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600 }}>Total del pedido</span>
          <span style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>${money(total)}</span>
        </div>

        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {cliente ? (
          // ---- Cliente con sesión iniciada ----
          enviado ? (
            <div style={{ textAlign: 'center', color: '#34d399', fontSize: 13, fontWeight: 700, padding: 10 }}>
              ✅ Se agregó a tu próxima entrega — lo verás en tu Estado de Cuenta.
            </div>
          ) : (
            <button type="button" disabled={enviando} onClick={agregarAProximaEntrega} style={botonMorado}>
              {enviando ? 'Enviando…' : '📦 Agregar a mi próxima entrega'}
            </button>
          )
        ) : (
          <>
            {dispositivo === 'movil' ? (
              // ---- Invitado + móvil ----
              <>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre (para el pedido)" style={inputStyle} />
                <a
                  href={`https://wa.me/${NUMERO_DENOG}?text=${encodeURIComponent(resumenTexto())}`}
                  target="_blank" rel="noreferrer" style={botonVerde}
                >
                  💬 Enviar pedido por WhatsApp
                </a>
                <div onClick={() => setDispositivo('desktop')} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                  💻 Estoy en computadora
                </div>
              </>
            ) : (
              // ---- Invitado + computadora ----
              <>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre (para el pedido)" style={inputStyle} />
                <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Tu número de WhatsApp" style={inputStyle} />
                {enviado ? (
                  <div style={{ textAlign: 'center', color: '#34d399', fontSize: 13, fontWeight: 700, padding: 10 }}>
                    ✅ Tu pedido fue enviado a Denog. Te contactaremos por WhatsApp para confirmar.
                  </div>
                ) : (
                  <button type="button" disabled={enviando} onClick={enviarInvitadoDesktop} style={botonVerde}>
                    {enviando ? 'Enviando…' : '📨 Enviar pedido'}
                  </button>
                )}
                <div onClick={() => setDispositivo('movil')} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                  📱 Estoy en el celular
                </div>
              </>
            )}

            {!enviado && (
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginBottom: 10 }}>
                  ¿Ya tienes cuenta con nosotros? Inicia sesión para agregarlo directo a tu próxima entrega.
                </div>
                <form onSubmit={iniciarSesion}>
                  <input type="text" value={loginUsuario} onChange={(e) => setLoginUsuario(e.target.value)} placeholder="Usuario" style={inputStyle} />
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Contraseña" style={inputStyle} />
                  {loginError && <div style={{ color: '#f87171', fontSize: 11.5, marginBottom: 8 }}>{loginError}</div>}
                  <button type="submit" disabled={loginCargando} style={botonMorado}>
                    {loginCargando ? 'Entrando…' : 'Iniciar sesión →'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
