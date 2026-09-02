'use client'

import { useState } from 'react'

/**
 * Foto de un artículo, con un hueco honesto cuando no se puede mostrar.
 *
 * Antes cada pantalla hacía `src={imagen_url_firmada || imagen_url}`. El
 * problema es que `imagen_url` NO es una URL: es la ruta dentro del bucket
 * privado (`ventas_whatsapp/1788…jpeg`). Cuando la firma fallaba, el navegador
 * resolvía esa ruta contra la página y pedía algo como
 * `localhost:3000/admin/ventas_whatsapp/…`, que no existe. En pantalla se veía
 * un recuadro roto con el texto del producto, y en Empacado eso significa no
 * saber qué va en la bolsa.
 *
 * Aquí la regla es: si no hay URL firmada, o si la imagen falla al cargar, se
 * muestra un marcador que lo dice. Un hueco que se entiende es mejor que una
 * imagen rota que parece que la app está descompuesta.
 */
export default function FotoPedido({ url, descripcion, tam = 64, onAmpliar, style }) {
  const [fallo, setFallo] = useState(false)
  const usable = url && String(url).startsWith('http')

  const base = {
    flex: 'none',
    width: tam,
    height: tam,
    borderRadius: 10,
    border: '1px solid var(--w15)',
    background: 'var(--sup-2)',
    ...style,
  }

  if (!usable || fallo) {
    return (
      <div
        title={fallo ? 'La foto no se pudo cargar' : 'Este artículo no tiene foto'}
        style={{
          ...base,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 2, color: 'var(--w35)', textAlign: 'center', lineHeight: 1.1,
        }}
      >
        <span style={{ fontSize: Math.round(tam * 0.28) }}>{fallo ? '🚫' : '📷'}</span>
        <span style={{ fontSize: Math.max(7, Math.round(tam * 0.13)), fontWeight: 700 }}>
          {fallo ? 'sin cargar' : 'sin foto'}
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={descripcion || ''}
      loading="lazy"
      onError={() => setFallo(true)}
      onClick={onAmpliar}
      style={{ ...base, objectFit: 'cover', cursor: onAmpliar ? 'zoom-in' : 'default' }}
    />
  )
}
