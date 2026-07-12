'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import ProductoCard from '../components/mercadito/ProductoCard';
import TarjetaCliente from '../components/cliente/TarjetaCliente';
import { IconHouse, IconCart } from '../components/mercadito/HeaderIcons';
import MenuUsuario from '../components/mercadito/MenuUsuario';
import { emojiPara } from '../../lib/mercadito/categorias';
import { leerCarrito, guardarCarrito, agregarAlCarrito, calcularTotales, CARRITO_EVENTO } from '../../lib/mercadito/carritoUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const botonCaja = { flex: 'none', width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
const botonGris = { ...botonCaja, background: 'rgba(0,0,0,0.05)', border: '1.5px solid rgba(0,0,0,0.08)', color: '#2a2118' };
const botonNaranja = { ...botonCaja, background: '#c1502e' };

export default function MercaditoCatalogo() {
  const router = useRouter();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [query, setQuery] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [cliente, setCliente] = useState(null);

  useEffect(() => {
    setCart(leerCarrito());
    const datos = localStorage.getItem('cliente');
    if (datos) { try { setCliente(JSON.parse(datos)) } catch {} }
    (async () => {
      const { data } = await supabase
        .from('productos_tienda')
        .select('*')
        .eq('activo', true)
        .eq('mostrar_en_mercadito', true)
        .order('id', { ascending: false });
      setProductos(data || []);
      setCargando(false);
    })();

    // El carrito puede cambiar desde otra pestaña (evento "storage") o desde
    // esta misma sin recargar (evento propio que dispara guardarCarrito) —
    // en ambos casos refrescamos el badge/cantidades al instante.
    const onCambio = () => setCart(leerCarrito());
    window.addEventListener(CARRITO_EVENTO, onCambio);
    window.addEventListener('storage', onCambio);
    return () => {
      window.removeEventListener(CARRITO_EVENTO, onCambio);
      window.removeEventListener('storage', onCambio);
    };
  }, []);

  const cantidadEnCarrito = (productoId) => cart.find((l) => l.productoId === productoId)?.cantidad || 0;

  const categorias = useMemo(() => {
    const unicas = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
    return ['Todos', ...unicas];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) =>
      (categoriaActiva === 'Todos' || p.categoria === categoriaActiva) &&
      (q === '' || p.nombre.toLowerCase().includes(q))
    );
  }, [productos, categoriaActiva, query]);

  const agregar = (producto) => {
    const next = agregarAlCarrito(cart, producto, 1);
    setCart(next);
    guardarCarrito(next);
  };

  const { totalArticulos, total } = calcularTotales(cart);

  return (
    <TarjetaCliente maxWidth={1100}>
      <div style={{ paddingBottom: totalArticulos > 0 ? 84 : 24 }}>
        {/* Header */}
        <div style={{ background: '#fbf8f3', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div onClick={() => router.push('/')} style={{ ...botonGris, fontSize: 20 }}>←</div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.03)', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 14px' }}>
            <span style={{ opacity: 0.5, fontSize: 14 }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#2a2118', fontSize: 14 }}
            />
          </div>
        </div>

        {/* Catálogo: riel de categorías + grid */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 'none', width: 84, borderRight: '1px solid rgba(0,0,0,0.08)', padding: '14px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {categorias.map((c) => {
              const activa = c === categoriaActiva;
              return (
                <div
                  key={c}
                  onClick={() => setCategoriaActiva(c)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 4px', borderRadius: 12, cursor: 'pointer',
                    background: activa ? 'rgba(193,85,58,0.1)' : 'transparent',
                    color: activa ? '#a3432b' : 'rgba(42,33,24,0.55)',
                  }}
                >
                  <div style={{ fontSize: 17 }}>{c === 'Todos' ? '✨' : emojiPara(c)}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>{c}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ flex: 1, minWidth: 0, padding: 16, gap: 16 }}>
            {cargando ? (
              <div style={{ gridColumn: '1 / -1', color: 'rgba(42,33,24,0.4)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Cargando catálogo…</div>
            ) : productosFiltrados.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', color: 'rgba(42,33,24,0.4)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No hay productos que coincidan.</div>
            ) : (
              productosFiltrados.map((p) => <ProductoCard key={p.id} producto={p} onAdd={agregar} enCarrito={cantidadEnCarrito(p.id)} />)
            )}
          </div>
        </div>
      </div>

      {/* Barra inferior fija del carrito */}
      {totalArticulos > 0 && (
        <div
          onClick={() => router.push('/mercadito/carrito')}
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
            maxWidth: 1100, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: '#c1553a', cursor: 'pointer',
          }}
        >
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>🛒 {totalArticulos} artículo(s)</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Ver carrito · ${money(total)} →</div>
        </div>
      )}
    </TarjetaCliente>
  );
}
