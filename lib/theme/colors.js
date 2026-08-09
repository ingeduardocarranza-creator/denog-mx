// Paleta de marca Denog — mismos tokens que mobile/lib/theme/colors.js,
// portados al sitio web para que admin, POS, y app móvil compartan una
// sola identidad visual en vez de colores ad-hoc por pantalla.

export const clay = {
  50: '#f9ece7',
  100: '#f0cfc4',
  300: '#dd8a6c',
  500: '#c1553a',
  700: '#9b3f28',
  800: '#6d2a19',
  900: '#4a1b0c',
}

export const ink = {
  50: '#fbf8f3',
  100: '#f1e9dd',
  300: '#c0ad95',
  500: '#9b8d7c',
  700: '#6b5d4d',
  800: '#3d3125',
  900: '#211a12',
}

export const gold = {
  100: '#f3ecd9',
  500: '#c9a84c',
  800: '#6b5411',
}

export const status = {
  success: { bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
  warning: { bg: 'rgba(250,204,21,0.15)', fg: '#facc15' },
  danger: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
  info: { bg: 'rgba(193,85,58,0.15)', fg: '#dd8a6c' },
}

const colors = { clay, ink, gold, status }
export default colors
