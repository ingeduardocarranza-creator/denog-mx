// Ayudas de navegación compartidas por las 4 pantallas del Mercadito, para
// que el botón "Inicio" y el botón "Volver" se comporten igual en todas.

// El ícono de casa debe respetar si hay sesión: un invitado no tiene cuenta
// que mostrar, así que su "inicio" es la Portada, no /cliente.
export function irAInicio(router, cliente) {
  router.push(cliente ? '/cliente' : '/');
}

// El botón "Volver" debe regresar a la pantalla real de la que vino el
// cliente (historial del navegador) en vez de a un destino fijo — y solo usa
// el destino de respaldo cuando no hay a dónde regresar (ej. llegó por link
// directo, sin historial dentro del sitio).
export function volverSeguro(router, fallback) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
  } else {
    router.push(fallback);
  }
}
