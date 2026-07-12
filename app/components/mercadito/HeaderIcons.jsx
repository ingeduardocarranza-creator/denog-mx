// Íconos SVG del header de Mercadito (casa, usuario, carrito) — se usan como
// componentes en vez de emoji para poder controlar el color de relleno
// exactamente (los emoji a color no respetan `color` de CSS).
export const IconHouse = ({ size = 18, fill = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <path d="M12 2.1L1 12h3v9h6v-6h4v6h6v-9h3z" />
  </svg>
);

export const IconUser = ({ size = 18, fill = '#2a2118' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.5c-3.5 0-10.5 1.8-10.5 5.3v2h21v-2c0-3.5-7-5.3-10.5-5.3z" />
  </svg>
);

export const IconCart = ({ size = 18, fill = '#c1502e' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.6-1.4 2.5c-.2.3-.2.6-.2 1 0 1.1.9 2 2 2h12v-2H7.4c-.1 0-.2-.1-.2-.2v-.1l.9-1.7h7.4c.8 0 1.4-.4 1.8-1l3.6-6.5c.1-.2.1-.3.1-.5 0-.6-.4-1-1-1H5.2l-.9-2H1zm16 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);
