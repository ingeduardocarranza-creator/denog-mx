'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import TarjetaCliente from '../../components/cliente/TarjetaCliente';
import { IconHouse } from '../../components/mercadito/HeaderIcons';
import MenuUsuario from '../../components/mercadito/MenuUsuario';
import { leerCarrito, vaciarCarrito, calcularTotales } from '../../../lib/mercadito/carritoUtils';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMERO_DENOG = '526625486432';

const botonCaja = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const botonGris = { ...botonCaja, background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };
const botonNaranja = { ...botonCaja, background: '#c1502e' };

const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '11px 14px', color: '#2a2118', fontSize: 13, marginBottom: 10, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const botonTerracota = { display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none', background: '#c1553a', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer', fontFamily: 'inherit' };
const botonVerde = { ...botonTerracota, background: '#25D366' };

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

  if (!listo) return <div style={{ minHeight: '100vh', background: '#fbf8f3' }} />;

  return (
    <TarjetaCliente>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div onClick={() => router.push('/mercadito/carrito')} style={{ ...botonGris, fontSize: 20 }}>←</div>
            <div onClick={() => router.push('/cliente')} style={botonNaranja} title="Inicio del cliente">
              <IconHouse size={18} fill="#fff" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(193,85,58,0.35))' }} />
            <div style={{ fontFamily: 'var(--font-baloo2)', color: '#2a2118', fontWeight: 700, fontSize: 19 }}>Finalizar pedido</div>
          </div>
          <MenuUsuario cliente={cliente} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
          <span style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13, fontWeight: 600 }}>Total del pedido</span>
          <span style={{ color: '#2a2118', fontSize: 18, fontWeight: 800 }}>${money(total)}</span>
        </div>

        {error && <div style={{ color: '#c0392b', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        {cliente ? (
          // ---- Cliente con sesión iniciada ----
          enviado ? (
            <div style={{ textAlign: 'center', color: '#2e7d4f', fontSize: 13, fontWeight: 700, padding: 10 }}>
              ✅ Se agregó a tu próxima entrega — lo verás en tu Estado de Cuenta.
            </div>
          ) : (
            <button type="button" disabled={enviando} onClick={agregarAProximaEntrega} style={botonTerracota}>
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
                <div onClick={() => setDispositivo('desktop')} style={{ textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 11, marginTop: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                  💻 Estoy en computadora
                </div>
              </>
            ) : (
              // ---- Invitado + computadora ----
              <>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre (para el pedido)" style={inputStyle} />
                <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Tu número de WhatsApp" style={inputStyle} />
                {enviado ? (
                  <div style={{ textAlign: 'center', color: '#2e7d4f', fontSize: 13, fontWeight: 700, padding: 10 }}>
                    ✅ Tu pedido fue enviado a Denog. Te contactaremos por WhatsApp para confirmar.
                  </div>
                ) : (
                  <button type="button" disabled={enviando} onClick={enviarInvitadoDesktop} style={botonVerde}>
                    {enviando ? 'Enviando…' : '📨 Enviar pedido'}
                  </button>
                )}
                <div onClick={() => setDispositivo('movil')} style={{ textAlign: 'center', color: 'rgba(42,33,24,0.4)', fontSize: 11, marginTop: 10, cursor: 'pointer', textDecoration: 'underline' }}>
                  📱 Estoy en el celular
                </div>
              </>
            )}

            {!enviado && (
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1.5px solid rgba(0,0,0,0.08)' }}>
                <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 12.5, marginBottom: 10 }}>
                  ¿Ya tienes cuenta con nosotros? Inicia sesión para agregarlo directo a tu próxima entrega.
                </div>
                <form onSubmit={iniciarSesion}>
                  <input type="text" value={loginUsuario} onChange={(e) => setLoginUsuario(e.target.value)} placeholder="Usuario" style={inputStyle} />
                  <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Contraseña" style={inputStyle} />
                  {loginError && <div style={{ color: '#c0392b', fontSize: 11.5, marginBottom: 8 }}>{loginError}</div>}
                  <button type="submit" disabled={loginCargando} style={botonTerracota}>
                    {loginCargando ? 'Entrando…' : 'Iniciar sesión →'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </TarjetaCliente>
  );
}
