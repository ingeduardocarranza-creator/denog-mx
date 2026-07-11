'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { leerCarrito, guardarCarrito, agregarAlCarrito } from '../../../../lib/mercadito/carritoUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const estrellasLabel = (n) => '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));

export default function FichaProducto() {
  const { id } = useParams();
  const router = useRouter();

  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [fotoActiva, setFotoActiva] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

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
  }, [id]);

  if (cargando) {
    return <div style={{ minHeight: '100vh', background: '#0b0818' }} />;
  }
  if (!producto) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0818', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-poppins)' }}>
        Producto no encontrado.
      </div>
    );
  }

  const stock = Number(producto.stock) || 0;
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
    <div style={{ minHeight: '100vh', background: '#0b0818', fontFamily: 'var(--font-poppins)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: 18 }}>
        <div onClick={() => router.back()} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer', marginBottom: 14 }}>←</div>

        <div
          style={{
            width: '100%', aspectRatio: '1 / 1', borderRadius: 20,
            background: fotoActiva ? `center / cover no-repeat url(${fotoActiva})` : 'linear-gradient(135deg, rgba(139,124,246,0.18), rgba(168,154,248,0.1))',
            border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
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
                  border: url === fotoActiva ? '2px solid #8b7cf6' : '1px solid rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </div>
        )}

        <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 20, lineHeight: 1.35, fontFamily: 'var(--font-baloo2)' }}>{producto.nombre}</div>
        <div style={{ color: '#a89af8', fontSize: 26, fontWeight: 800, marginTop: 8, fontFamily: 'var(--font-baloo2)' }}>${money(producto.precio_venta)}</div>

        {resenas.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ color: '#facc15', fontSize: 14, letterSpacing: 1 }}>{estrellasLabel(avgStars)}</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5 }}>{avgStars.toFixed(1)} · {resenas.length} opinión(es)</div>
          </div>
        )}

        <div style={{ color: stock <= 0 ? '#f87171' : stock <= 3 ? '#facc15' : '#34d399', fontSize: 11.5, fontWeight: 700, marginTop: 6 }}>{stockLabel}</div>

        {producto.descripcion && (
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 1.7, marginTop: 14 }}>{producto.descripcion}</div>
        )}

        <a
          href={`https://wa.me/?text=${shareText}`}
          target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.4)', color: '#4ade80', fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: 10, marginTop: 14 }}
        >
          💬 Compartir este producto por WhatsApp
        </a>

        {stock > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600 }}>Cantidad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => setCantidad((c) => Math.max(1, c - 1))} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</div>
                <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, width: 20, textAlign: 'center' }}>{cantidad}</div>
                <div onClick={() => setCantidad((c) => Math.min(stock, c + 1))} style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</div>
              </div>
            </div>
            <button
              type="button"
              onClick={agregarAlCarritoYVolver}
              style={{ width: '100%', textAlign: 'center', background: 'linear-gradient(135deg,#8b7cf6,#a89af8)', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: 13, marginTop: 14, cursor: 'pointer' }}
            >
              {agregado ? '✅ Agregado al carrito' : 'Agregar al carrito'}
            </button>
          </>
        )}

        {/* Reseñas */}
        <div style={{ marginTop: 26, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 18 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Opiniones de clientes</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 18 }}>
            {resenas.length === 0 && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11.5 }}>Todavía no hay opiniones de este producto.</div>}
            {resenas.map((r, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 700 }}>{r.clientes?.nombre || 'Cliente'}</div>
                  <div style={{ color: '#facc15', fontSize: 12, letterSpacing: 1 }}>{estrellasLabel(r.estrellas)}</div>
                </div>
                {r.comentario && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, lineHeight: 1.5 }}>{r.comentario}</div>}
              </div>
            ))}
          </div>

          {cliente ? (
            resenaEnviada ? (
              <div style={{ color: '#34d399', fontSize: 12.5, fontWeight: 700 }}>✅ Gracias por tu opinión.</div>
            ) : (
              <>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, marginBottom: 8 }}>Disponible si compraste este producto.</div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} onClick={() => setMisEstrellas(n)} style={{ fontSize: 22, color: n <= misEstrellas ? '#facc15' : 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>★</div>
                  ))}
                </div>
                <textarea
                  value={miComentario}
                  onChange={(e) => setMiComentario(e.target.value)}
                  placeholder="Cuéntanos qué tal el producto…"
                  style={{ width: '100%', minHeight: 64, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 12.5, marginBottom: 10, outline: 'none', fontFamily: 'inherit', resize: 'none' }}
                />
                {errorResena && <div style={{ color: '#f87171', fontSize: 11.5, marginBottom: 8 }}>{errorResena}</div>}
                <div
                  onClick={enviandoResena ? undefined : enviarResena}
                  style={{ textAlign: 'center', background: 'rgba(139,124,246,0.18)', border: '1px solid rgba(139,124,246,0.4)', color: '#c4b8ff', fontWeight: 700, fontSize: 12.5, borderRadius: 10, padding: 11, cursor: enviandoResena ? 'default' : 'pointer' }}
                >
                  {enviandoResena ? 'Enviando…' : 'Enviar opinión'}
                </div>
              </>
            )
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11.5 }}>Inicia sesión y compra el producto para poder dejar tu opinión.</div>
          )}
        </div>
      </div>
    </div>
  );
}
