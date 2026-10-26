'use client';

import { useEffect, useRef, useState } from 'react';

// La mascota de Denog en la pantalla de la tienda. Cada tantos productos
// aparece, hace UNA gracia y se va. No habla: se expresa como mimo.
//
// Cada gracia es un clip animado en Gemini (Veo) con fondo verde. Al fondo
// verde se le quita con ffmpeg y queda un .webm transparente en
// public/assets/mascota/. El .webm con transparencia lo reproduce Chrome
// (la computadora de la tienda); Safari no lo muestra transparente.
//
// ¿Gracia nueva? Sube su .webm a public/assets/mascota/ y agrega un renglón:
//   id     → nombre corto (sirve para probarla: /pantalla?accion=saludar)
//   clip   → ruta del video
//   x      → dónde se para, de 0 (izquierda) a 1 (derecha) de la pantalla
//   ancho  → qué tan grande, como fracción del ancho de la pantalla
//   aspecto→ ancho ÷ alto del video (1 si es cuadrado)
//   subir  → (opcional) lo sube sobre el piso, como fracción del alto de la pantalla
//   peso   → qué tan seguido sale comparada con las demás (1 = normal)
//   aplica → (ctx) => true/false, cuándo puede salir (ctx: { pocas, hayGrupo })
export const ACCIONES = [
  { id: 'saludar', clip: '/assets/mascota/saludar.webm', x: 0.3, ancho: 0.62, aspecto: 1, peso: 1, aplica: () => true },
  // Se sorprende y señala hacia la derecha, donde está el precio.
  { id: 'senalar', clip: '/assets/mascota/senalar.webm', x: 0.42, ancho: 0.78, aspecto: 688 / 616, subir: 0.07, peso: 1.3, aplica: () => true },
];

// Las patas del perrito quedan casi hasta abajo del clip recortado.
const PATAS = 0.98;

export function elegirAccion(ctx, anterior) {
  // Safari no muestra transparente el .webm: ahí el perrito no sale.
  if (typeof navigator !== 'undefined' && /Apple/.test(navigator.vendor || '')) return null;
  // Para probar una gracia: denog.mx/pantalla?accion=saludar (siempre hace esa).
  try {
    const forzada = new URLSearchParams(window.location.search).get('accion');
    const f = forzada && ACCIONES.find((x) => x.id === forzada);
    if (f) return f;
  } catch {}
  let posibles = ACCIONES.filter((a) => a.aplica(ctx));
  if (posibles.length > 1) posibles = posibles.filter((a) => a.id !== anterior);
  if (!posibles.length) return null;
  const total = posibles.reduce((n, a) => n + (a.peso || 1), 0);
  let r = Math.random() * total;
  for (const a of posibles) { r -= a.peso || 1; if (r <= 0) return a; }
  return posibles[0];
}

export default function Mascota({ accion, marcoRef, qrRef, onFin }) {
  const [lugar, setLugar] = useState(null);
  const [saliendo, setSaliendo] = useState(false);
  const videoRef = useRef(null);
  const onFinRef = useRef(onFin);
  useEffect(() => { onFinRef.current = onFin; }, [onFin]);

  // Dónde se para: con las patas sobre la cinta de abajo.
  useEffect(() => {
    const marco = marcoRef.current;
    if (!marco || !accion) return;
    const m = marco.getBoundingClientRect();
    const q = qrRef?.current?.getBoundingClientRect();
    const piso = q ? q.bottom - m.top : m.height * 0.93;
    const ancho = m.width * accion.ancho;
    const alto = ancho / (accion.aspecto || 1);
    setLugar({ left: m.width * accion.x - ancho / 2, top: piso - alto * PATAS - m.height * (accion.subir || 0), ancho, alto });
  }, [accion, marcoRef, qrRef]);

  // Se va con un brinquito al terminar el clip (o a los 20 s, por si algo falla).
  const terminar = () => {
    if (saliendo) return;
    setSaliendo(true);
    setTimeout(() => onFinRef.current?.(), 450);
  };
  useEffect(() => {
    const t = setTimeout(terminar, 20000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lugar) return null;
  return (
    <div
      style={{
        position: 'absolute', zIndex: 20, pointerEvents: 'none',
        left: lugar.left, top: lugar.top, width: lugar.ancho, height: lugar.alto,
        transformOrigin: '50% 98%',
        animation: saliendo ? 'pn-mascota-sale 0.45s ease-in both' : 'pn-mascota-entra 0.55s cubic-bezier(.2,.9,.3,1.35) both',
        filter: 'drop-shadow(0 1.5cqw 2.5cqw rgba(0,0,0,.45))',
      }}
    >
      <video
        ref={videoRef}
        src={accion.clip}
        autoPlay muted playsInline
        onEnded={terminar}
        onError={terminar}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}

