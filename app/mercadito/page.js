'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import ProductoCard from '../components/mercadito/ProductoCard';
import { emojiPara } from '../../lib/mercadito/categorias';
import { leerCarrito, guardarCarrito, agregarAlCarrito, calcularTotales } from '../../lib/mercadito/carritoUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MercaditoCatalogo() {
  const router = useRouter();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [query, setQuery] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [cart, setCart] = useState([]);

  useEffect(() => {
    setCart(leerCarrito());
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
  }, []);

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
    <div style={{ minHeight: '100vh', background: '#0b0818', fontFamily: 'var(--font-poppins)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: totalArticulos > 0 ? 84 : 24 }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0b0818', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div onClick={() => router.push('/')} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, cursor: 'pointer' }}>←</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Image src="/assets/logodenog.png" alt="Denog" width={191} height={120} style={{ height: 120, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(139,124,246,0.5))' }} />
              <div style={{ fontFamily: 'var(--font-baloo2)', color: '#fff', fontWeight: 700, fontSize: 19 }}>Mercadito</div>
            </div>
            <div onClick={() => router.push('/mercadito/carrito')} style={{ position: 'relative', color: '#fff', fontSize: 20, cursor: 'pointer' }}>
              🛒
              {totalArticulos > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -10, background: '#8b7cf6', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 6px' }}>
                  {totalArticulos}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 14px' }}>
            <span style={{ opacity: 0.6, fontSize: 14 }}>🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14 }}
            />
          </div>
        </div>

        {/* Catálogo: riel de categorías + grid */}
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 'none', width: 84, borderRight: '1px solid rgba(255,255,255,0.08)', padding: '14px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {categorias.map((c) => {
              const activa = c === categoriaActiva;
              return (
                <div
                  key={c}
                  onClick={() => setCategoriaActiva(c)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '10px 4px', borderRadius: 12, cursor: 'pointer',
                    background: activa ? 'rgba(139,124,246,0.18)' : 'transparent',
                    color: activa ? '#c4b8ff' : 'rgba(255,255,255,0.55)',
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
              <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Cargando catálogo…</div>
            ) : productosFiltrados.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>No hay productos que coincidan.</div>
            ) : (
              productosFiltrados.map((p) => <ProductoCard key={p.id} producto={p} onAdd={agregar} />)
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
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: 'linear-gradient(135deg,#8b7cf6,#a89af8)', cursor: 'pointer',
          }}
        >
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>🛒 {totalArticulos} artículo(s)</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Ver carrito · ${money(total)} →</div>
        </div>
      )}
    </div>
  );
}
