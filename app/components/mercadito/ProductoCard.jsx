'use client';

import Link from 'next/link';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tarjeta de producto, layout 1A (foto grande). Usada en el grid del
// catálogo (app/mercadito/page.js) y en la tira de la home
// (teaser insertado en app/page.js).
export default function ProductoCard({ producto, onAdd }) {
  const agotado = Number(producto.stock) <= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Link href={`/mercadito/producto/${producto.id}`} style={{ textDecoration: 'none', cursor: 'pointer' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            borderRadius: 16,
            background: producto.imagen_url
              ? `center / cover no-repeat url(${producto.imagen_url})`
              : 'linear-gradient(135deg, rgba(139,124,246,0.18), rgba(168,154,248,0.1))',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}
        >
          {!producto.imagen_url && '🛍️'}
          {agotado && (
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.6)', color: '#fca5a5', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 6 }}>
              AGOTADO
            </div>
          )}
        </div>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.3, height: 34, overflow: 'hidden', fontFamily: 'var(--font-poppins)' }}>
          {producto.nombre}
        </div>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ color: '#a89af8', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-baloo2)' }}>${money(producto.precio_venta)}</div>
        <button
          type="button"
          disabled={agotado}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd?.(producto); }}
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: agotado ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#8b7cf6,#a89af8)',
            color: agotado ? 'rgba(255,255,255,0.3)' : '#fff',
            border: 'none', fontSize: 16, fontWeight: 800, cursor: agotado ? 'not-allowed' : 'pointer',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
