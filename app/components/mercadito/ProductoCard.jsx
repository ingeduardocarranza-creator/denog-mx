'use client';

import Link from 'next/link';

const money = (n) => (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tarjeta de producto, layout 1A (foto grande). Usada en el grid del
// catálogo (app/mercadito/page.js) y en la tira de la home
// (teaser insertado en app/page.js).
export default function ProductoCard({ producto, onAdd, enCarrito = 0 }) {
  const stock = Number(producto.stock) || 0;
  const agotado = stock <= 0;
  const enTope = !agotado && enCarrito >= stock;

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
              : 'rgba(193,85,58,0.1)',
            border: '1.5px solid rgba(0,0,0,0.08)',
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
        <div style={{ color: '#2a2118', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.3, height: 34, overflow: 'hidden', fontFamily: 'var(--font-poppins)' }}>
          {producto.nombre}
        </div>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ color: '#c1553a', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-baloo2)' }}>${money(producto.precio_venta)}</div>
        <button
          type="button"
          disabled={agotado || enTope}
          title={enTope ? `Ya tienes ${enCarrito} en tu carrito (todo el stock disponible)` : undefined}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd?.(producto); }}
          style={{
            width: 30, height: 30, borderRadius: 9,
            background: agotado || enTope ? 'rgba(0,0,0,0.06)' : '#c1553a',
            color: agotado || enTope ? 'rgba(42,33,24,0.3)' : '#fff',
            border: 'none', fontSize: 16, fontWeight: 800, cursor: agotado || enTope ? 'not-allowed' : 'pointer',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
      {enTope && !agotado && (
        <div style={{ color: 'rgba(42,33,24,0.4)', fontSize: 10, marginTop: 4 }}>Ya tienes todo el stock ({stock}) en tu carrito</div>
      )}
    </div>
  );
}
