'use client';

const PALETA_CATEGORIAS = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#facc15', '#fb7185', '#a78bfa', '#f59e0b'];

export const colorParaCategoria = (categoria) => {
  const str = categoria || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETA_CATEGORIAS[hash % PALETA_CATEGORIAS.length];
};

export default function ProductoFoto({ imagenUrl, categoria, size = 46 }) {
  const color = colorParaCategoria(categoria);
  if (imagenUrl) {
    return (
      <img
        src={imagenUrl}
        alt=""
        style={{ flex: 'none', width: size, height: size, borderRadius: 10, objectFit: 'cover', border: `1px solid ${color}55` }}
      />
    );
  }
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: 10, background: color + '22', border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45 }}>
      📦
    </div>
  );
}
