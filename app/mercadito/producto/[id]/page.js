'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import TarjetaCliente from '../../../components/cliente/TarjetaCliente';
import { IconHouse, IconCart } from '../../../components/mercadito/HeaderIcons';
import MenuUsuario from '../../../components/mercadito/MenuUsuario';
import { leerCarrito, guardarCarrito, agregarAlCarrito, calcularTotales, CARRITO_EVENTO } from '../../../../lib/mercadito/carritoUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const botonCaja = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const botonGris = { ...botonCaja, background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };
const botonNaranja = { ...botonCaja, background: '#c1502e' };

const estrellasLabel = (n) => '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));

export default function FichaProducto() {
  const { id } = useParams();
  const router = useRouter();

  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fotoActiva, setFotoActiva] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);
  const [enCarrito, setEnCarrito] = useState(0);
  const [totalArticulos, setTotalArticulos] = useState(0);

  const [resenas, setResenas] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [misEstrellas, setMisEstrellas] = useState(0);
  const [miComentario, setMiComentario] = useState('');
  const [enviandoResena, setEnviandoResena] = useState(false);
  const [resenaEnviada, setResenaEnviada] = useState(false);
  const [errorResena, setErrorResena] = useState('');

  useEffect(() => {
    const datos = localStorage.getItem('cliente');
    if (datos) setCliente(JSON.parse(datos));

    (async () => {
      const { data } = await supabase.from('productos_tienda').select('*').eq('id', id).eq('mostrar_en_mercadito', true).single();
      setProducto(data || null);
      setFotoActiva(data?.imagen_url || null);
      setCargando(false);

      const { data: r } = await supabase
        .from('mercadito_resenas')
        .select('*, clientes(nombre)')
        .eq('producto_id', id)
        .order('creado_en', { ascending: false });
      setResenas(r || []);
    })();

    const actualizarEnCarrito = () => {
      const cart = leerCarrito();
      const linea = cart.find((l) => String(l.productoId) === String(id));
      setEnCarrito(linea?.cantidad || 0);
      setTotalArticulos(calcularTotales(cart).totalArticulos);
    };
    actualizarEnCarrito();
    window.addEventListener(CARRITO_EVENTO, actualizarEnCarrito);
    window.addEventListener('storage', actualizarEnCarrito);
    return () => {
      window.removeEventListener(CARRITO_EVENTO, actualizarEnCarrito);
      window.removeEventListener('storage', actualizarEnCarrito);
    };
  }, [id]);

  if (cargando) {
    return <div style={{ minHeight: '100vh', background: '#fbf8f3' }} />;
  }
  if (!producto) {
    return (
      <div style={{ minHeight: '100vh', background: '#fbf8f3', color: 'rgba(42,33,24,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-poppins)' }}>
        Producto no encontrado.
      </div>
    );
  }

  const stock = Number(producto.stock) || 0;
  const disponibleParaAgregar = Math.max(0, stock - enCarrito);
  const stockLabel = stock <= 0 ? '❌ Agotado' : stock <= 3 ? `⚠️ Últimas piezas (${stock})` : '✅ En stock';
  const miniaturas = [producto.imagen_url, ...(producto.galeria || [])].filter(Boolean);
  const avgStars = resenas.length ? resenas.reduce((a, r) => a + r.estrellas, 0) / resenas.length : 0;

  const agregarAlCarritoYVolver = () => {
    const cart = agregarAlCarrito(leerCarrito(), producto, cantidad);
    guardarCarrito(cart);
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1600);
  };

  const shareText = encodeURIComponent(`Mira este producto en el Mercadito de Denog: ${producto.nombre} — $${money(producto.precio_venta)} MXN\n${typeof window !== 'undefined' ? window.location.href : ''}`);

  const enviarResena = async () => {
    if (!misEstrellas) { setErrorResena('Selecciona una calificación en estrellas.'); return; }
    setEnviandoResena(true);
    setErrorResena('');
    try {
      const res = await fetch('/api/mercadito/resenas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto_id: id, cliente_id: cliente.id, estrellas: misEstrellas, comentario: miComentario.trim() }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo enviar tu opinión.');
      setResenaEnviada(true);
      setResenas((r) => [{ estrellas: misEstrellas, comentario: miComentario.trim(), clientes: { nombre: cliente.nombre } }, ...r]);
    } catch (err) {
      setErrorResena(err.message);
    } finally {
      setEnviandoResena(false);
    }
  };

  return (
    <TarjetaCliente>
      {/* Header */}
      <div style={{ background: '#fbf8f3', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div onClick={() => router.back()} style={{ ...botonGris, fontSize: 20 }}>←</div>
            <div onClick={() => router.push('/cliente')} style={botonNaranja} title="Inicio del cliente">
              <IconHouse size={18} fill="#fff" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(193,85,58,0.35))' }} />
            <div style={{ fontFamily: 'var(--font-baloo2)', color: '#2a2118', fontWeight: 700, fontSize: 19 }}>Mercadito</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div onClick={() => router.push('/mercadito/carrito')} style={{ ...botonCaja, position: 'relative', background: 'rgba(193,80,46,0.13)' }} title="Carrito">
              <IconCart size={18} fill="#c1502e" />
              {totalArticulos > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, background: '#c1502e', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fbf8f3' }}>
                  {totalArticulos}
                </span>
              )}
            </div>
            <MenuUsuario cliente={cliente} />
          </div>
        </div>
      </div>

      <div style={{ padding: 18 }}>

        <div
          style={{
            width: '100%', aspectRatio: '1 / 1', borderRadius: 20,
            background: fotoActiva ? `center / cover no-repeat url(${fotoActiva})` : 'rgba(193,85,58,0.1)',
            border: '1.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
          }}
        >
          {!fotoActiva && '🛍️'}
        </div>

        {miniaturas.length > 1 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {miniaturas.map((url, i) => (
              <div
                key={i}
                onClick={() => setFotoActiva(url)}
                style={{
                  width: 56, height: 56, borderRadius: 10, cursor: 'pointer',
                  background: `center / cover no-repeat url(${url})`,
                  border: url === fotoActiva ? '2px solid #c1553a' : '1.5px solid rgba(0,0,0,0.1)',
                }}
              />
            ))}
          </div>
        )}

        <div style={{ color: '#2a2118', fontSize: 20, fontWeight: 700, marginTop: 20, lineHeight: 1.35, fontFamily: 'var(--font-baloo2)' }}>{producto.nombre}</div>
        <div style={{ color: '#c1553a', fontSize: 26, fontWeight: 800, marginTop: 8, fontFamily: 'var(--font-baloo2)' }}>${money(producto.precio_venta)}</div>

        {resenas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ color: '#facc15', fontSize: 14, letterSpacing: 1 }}>{estrellasLabel(avgStars)}</div>
            <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 11.5 }}>{avgStars.toFixed(1)} · {resenas.length} opinión(es)</div>
          </div>
        )}

        <div style={{ color: stock <= 0 ? '#c0392b' : stock <= 3 ? '#b8860b' : '#2e7d4f', fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>{stockLabel}</div>

        {producto.descripcion && (
          <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13.5, lineHeight: 1.7, marginTop: 14 }}>{producto.descripcion}</div>
        )}

        <a
          href={`https://wa.me/?text=${shareText}`}
          target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'rgba(37,211,102,0.1)', border: '1.5px solid rgba(37,211,102,0.4)', color: '#1f8a4c', fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: 10, marginTop: 14 }}
        >
          💬 Compartir este producto por WhatsApp
        </a>

        {disponibleParaAgregar > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
              <div style={{ color: 'rgba(42,33,24,0.65)', fontSize: 13, fontWeight: 600 }}>Cantidad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => setCantidad((c) => Math.max(1, c - 1))} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,0.06)', color: '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</div>
                <div style={{ color: '#2a2118', fontSize: 15, fontWeight: 700, width: 20, textAlign: 'center' }}>{Math.min(cantidad, disponibleParaAgregar)}</div>
                <div onClick={() => setCantidad((c) => Math.min(disponibleParaAgregar, c + 1))} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(0,0,0,0.06)', color: '#2a2118', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</div>
              </div>
            </div>
            {enCarrito > 0 && (
              <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 11, marginTop: 6 }}>Ya tienes {enCarrito} en tu carrito · quedan {disponibleParaAgregar} disponibles</div>
            )}
            <button
              type="button"
              onClick={agregarAlCarritoYVolver}
              style={{ width: '100%', textAlign: 'center', background: '#c1553a', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: 13, marginTop: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {agregado ? '✅ Agregado al carrito' : 'Agregar al carrito'}
            </button>
          </>
        ) : stock > 0 && (
          <div style={{ color: 'rgba(42,33,24,0.5)', fontSize: 12.5, marginTop: 20, textAlign: 'center', background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: 12 }}>
            Ya tienes todo el stock disponible ({stock}) en tu carrito.
          </div>
        )}

        {/* Reseñas */}
        <div style={{ marginTop: 26, borderTop: '1.5px solid rgba(0,0,0,0.08)', paddingTop: 18 }}>
          <div style={{ color: '#2a2118', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Opiniones de clientes</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            {resenas.length === 0 && <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 11.5 }}>Todavía no hay opiniones de este producto.</div>}
            {resenas.map((r, i) => (
              <div key={i} style={{ background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ color: '#2a2118', fontSize: 12.5, fontWeight: 700 }}>{r.clientes?.nombre || 'Cliente'}</div>
                  <div style={{ color: '#facc15', fontSize: 12, letterSpacing: 1 }}>{estrellasLabel(r.estrellas)}</div>
                </div>
                {r.comentario && <div style={{ color: 'rgba(42,33,24,0.6)', fontSize: 12.5, lineHeight: 1.5 }}>{r.comentario}</div>}
              </div>
            ))}
          </div>

          {cliente ? (
            resenaEnviada ? (
              <div style={{ color: '#2e7d4f', fontSize: 12.5, fontWeight: 700 }}>✅ Gracias por tu opinión.</div>
            ) : (
              <>
                <div style={{ color: 'rgba(42,33,24,0.45)', fontSize: 11.5, marginBottom: 8 }}>Disponible si compraste este producto.</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} onClick={() => setMisEstrellas(n)} style={{ fontSize: 22, color: n <= misEstrellas ? '#facc15' : 'rgba(0,0,0,0.15)', cursor: 'pointer' }}>★</div>
                  ))}
                </div>
                <textarea
                  value={miComentario}
                  onChange={(e) => setMiComentario(e.target.value)}
                  placeholder="Cuéntanos qué tal el producto…"
                  style={{ width: '100%', minHeight: 64, background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '10px 12px', color: '#2a2118', fontSize: 12.5, marginBottom: 10, outline: 'none', fontFamily: 'inherit', resize: 'none' }}
                />
                {errorResena && <div style={{ color: '#c0392b', fontSize: 11.5, marginBottom: 8 }}>{errorResena}</div>}
                <div
                  onClick={enviandoResena ? undefined : enviarResena}
                  style={{ textAlign: 'center', background: 'rgba(193,85,58,0.1)', border: '1.5px solid rgba(193,85,58,0.4)', color: '#a3432b', fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: 11, cursor: enviandoResena ? 'default' : 'pointer' }}
                >
                  {enviandoResena ? 'Enviando…' : 'Enviar opinión'}
                </div>
              </>
            )
          ) : (
            <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 11.5 }}>Inicia sesión y compra el producto para poder dejar tu opinión.</div>
          )}
        </div>
      </div>
    </TarjetaCliente>
  );
}
