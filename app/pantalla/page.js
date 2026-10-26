'use client';

// Pantalla vertical de la tienda física (TV en vertical, sin sonido) — v2.
// Muestra, uno por uno, los productos que están en el Mercadito: de 1 a 3
// fotos (la principal + la galería) con fundido y acercamiento lento, o su
// video corto si tiene. Cada tantos productos sale una lámina para unirse al
// grupo de WhatsApp. Se actualiza sola cada pocos minutos — no hay que tocar
// nada cuando se agrega un producto al catálogo.
//
// Es una página pública (igual que /mercadito): solo lee productos_tienda con
// la llave anónima, con los mismos filtros que el catálogo del Mercadito.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { create as crearMatrizQR } from 'qrcode/lib/core/qrcode.js';
import { agruparPublicaciones } from '../../lib/mercadito/variantes';
import { emojiPara } from '../../lib/mercadito/categorias';
import Mascota, { elegirAccion } from './Mascota';
import { TRANSICIONES } from './transiciones';

// ─── Ajustes fáciles de cambiar ───────────────────────────────────────────
const LINK_GRUPO_WHATSAPP = 'https://chat.whatsapp.com/IV2gJFYKrnX0eWYMk4xoB9'; // pega aquí el link de invitación (https://chat.whatsapp.com/...)
const LINK_SITIO = 'https://denog.mx';
const FRASES_CINTA = [
  'Pedidos de USA cada 15 días',
  'Pregunta en caja',
  'Compra en línea en denog.mx',
  'Únete a nuestro grupo de WhatsApp',
];
const SEGUNDOS_POR_FOTO = { 1: 8, 2: 5, 3: 4 }; // un producto dura 8 a 12 s
const SEGUNDOS_LAMINA = 10; // lámina del grupo de WhatsApp
const LAMINA_CADA = 6; // cada cuántos productos sale la lámina
const MAX_SEGUNDOS_VIDEO = 40; // tope por si un video no termina de cargar
const MINUTOS_REFRESCO = 5; // cada cuánto se vuelve a leer el catálogo
const MASCOTA_CADA = [2, 3]; // la mascota sale cada 2 o 3 productos (al azar)
const TRANSICION_CADA = 4; // cada cuántos cambios de producto: vidrio estrellado o página rasgada
// ──────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const C = { cafe: '#2a2118', cafeOsc: '#120d08', terracota: '#c1553a', terracotaOsc: '#a3432b', crema: '#fbf8f3', arena: '#DDBCA6', azul: '#466D9B' };

const precioTexto = (n) => {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};

const videoDe = (p) => p.video_url || (p.variantes || []).find((v) => v.video_url)?.video_url || null;

const fotosDe = (p) => {
  const todas = [p.imagen_url, ...(Array.isArray(p.galeria) ? p.galeria : [])].filter(Boolean);
  return [...new Set(todas)].slice(0, 3);
};

// QR en SVG: nítido a cualquier tamaño (en la TV se ve perfecto).
function QR({ texto, color = C.cafe }) {
  const ruta = useMemo(() => {
    try {
      const { size, data } = crearMatrizQR(texto, { errorCorrectionLevel: 'M' }).modules;
      let d = '';
      for (let f = 0; f < size; f++) for (let c = 0; c < size; c++) if (data[f * size + c]) d += `M${c} ${f}h1v1h-1z`;
      return { d, size };
    } catch { return null; }
  }, [texto]);
  if (!ruta) return null;
  return (
    <svg viewBox={`-2 -2 ${ruta.size + 4} ${ruta.size + 4}`} style={{ width: '100%', height: '100%', display: 'block', background: '#fff', borderRadius: '6%' }} shapeRendering="crispEdges">
      <path d={ruta.d} fill={color} />
    </svg>
  );
}

// Logo en letras solas (sin la mascota: ella anda suelta por la pantalla).
function Logo({ ancho }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/assets/wordmark-v2.png" alt="Denog" style={{ width: ancho, height: 'auto', display: 'block' }} />;
}

export default function PantallaTienda() {
  const [productos, setProductos] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [idxActual, setIdxActual] = useState(0);
  const [fotoIdx, setFotoIdx] = useState(0);
  const idActualRef = useRef(null);

  // Lee el catálogo ahora y cada pocos minutos.
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const { data } = await supabase
          .from('productos_tienda')
          .select('*')
          .eq('activo', true)
          .eq('mostrar_en_mercadito', true)
          .gt('stock', 0)
          .order('id', { ascending: false });
        if (vivo && Array.isArray(data)) setProductos(data);
      } catch {}
      if (vivo) setCargado(true);
    };
    cargar();
    const t = setInterval(cargar, MINUTOS_REFRESCO * 60 * 1000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // Una diapositiva por publicación (las variantes de un artículo son una
  // sola) y, cada tantos productos, la lámina del grupo de WhatsApp.
  const slides = useMemo(() => {
    const prods = agruparPublicaciones(productos)
      .map((p) => ({ ...p, tipo: 'producto', fotos: fotosDe(p), video: videoDe(p) }))
      .filter((p) => p.fotos.length || p.video);
    if (!LINK_GRUPO_WHATSAPP || prods.length === 0) return prods;
    const out = [];
    prods.forEach((p, i) => {
      out.push(p);
      if ((i + 1) % LAMINA_CADA === 0) out.push({ tipo: 'lamina', id: `lamina-${i}` });
    });
    if (prods.length < LAMINA_CADA) out.push({ tipo: 'lamina', id: 'lamina-fin' });
    return out;
  }, [productos]);

  // Si el catálogo se refresca, seguimos en el mismo producto si todavía existe.
  useEffect(() => {
    if (slides.length === 0) return;
    const i = slides.findIndex((s) => s.id === idActualRef.current);
    if (i >= 0) setIdxActual(i);
    else setIdxActual((x) => (x >= slides.length ? 0 : x));
  }, [slides]);

  const slide = slides[idxActual] || null;
  const esProducto = slide?.tipo === 'producto';
  const video = esProducto ? slide.video : null;
  const fotos = esProducto ? slide.fotos : [];
  const segFoto = SEGUNDOS_POR_FOTO[fotos.length] || 4;

  const siguiente = () => {
    setFotoIdx(0);
    setIdxActual((i) => (slides.length ? (i + 1) % slides.length : 0));
  };

  // Cada tantos cambios, el producto se va rompiendo el vidrio o rasgando la
  // página (se alternan). Para probar una: /pantalla?transicion=vidrio (o rasga).
  const efectosRef = useRef(null);
  const transRef = useRef({ cuenta: 0, toca: 'vidrio', corriendo: false });
  const avanzar = async () => {
    const t = transRef.current;
    if (t.corriendo) { setTimeout(avanzar, 800); return; } // espera a que termine la transición
    let forzada = null;
    try { forzada = new URLSearchParams(window.location.search).get('transicion'); } catch {}
    t.cuenta += 1;
    const tipo = TRANSICIONES[forzada] ? forzada : (t.cuenta % TRANSICION_CADA === 0 ? t.toca : null);
    if (!tipo || !marcoRef.current || !efectosRef.current || slides.length < 2) return siguiente();
    if (!forzada) t.toca = t.toca === 'vidrio' ? 'rasga' : 'vidrio';
    t.corriendo = true;
    try { await TRANSICIONES[tipo](marcoRef.current, efectosRef.current, siguiente); }
    catch { siguiente(); }
    finally { t.corriendo = false; }
  };

  useEffect(() => { idActualRef.current = slide?.id ?? null; }, [slide]);

  // Mascota: cada 2 o 3 productos sale, hace una gracia y se va.
  const marcoRef = useRef(null);
  const precioRef = useRef(null);
  const qrRef = useRef(null);
  const [mascota, setMascota] = useState(null);
  const mascotaRef = useRef({ cuenta: 0, toca: MASCOTA_CADA[0], anterior: null });
  useEffect(() => {
    if (!esProducto || mascota) return;
    const m = mascotaRef.current;
    m.cuenta += 1;
    if (m.cuenta < m.toca) return;
    m.cuenta = 0;
    m.toca = MASCOTA_CADA[0] + Math.floor(Math.random() * (MASCOTA_CADA[1] - MASCOTA_CADA[0] + 1));
    const ctx = { pocas: (Number(slide.stock) || 0) <= 3, hayGrupo: !!LINK_GRUPO_WHATSAPP, hayPrecio: true };
    const accion = elegirAccion(ctx, m.anterior);
    if (!accion) return;
    m.anterior = accion.id;
    // Espera a que el precio termine de entrar para medir dónde quedó.
    // (si hay una transición con el perrito en curso, esta vez no sale)
    const t = setTimeout(() => { if (!transRef.current.corriendo) setMascota({ ...accion, clave: Date.now() }); }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id]);

  // Avance: fotos una por una y luego el siguiente producto; video al
  // terminar (o al tope); la lámina por tiempo.
  useEffect(() => {
    if (!slide) return;
    let ms;
    let accion = avanzar;
    if (slide.tipo === 'lamina') ms = SEGUNDOS_LAMINA * 1000;
    else if (video) ms = MAX_SEGUNDOS_VIDEO * 1000;
    else {
      ms = segFoto * 1000;
      if (fotoIdx < fotos.length - 1) accion = () => setFotoIdx((f) => f + 1);
    }
    if (slides.length <= 1 && (slide.tipo !== 'producto' || video || fotoIdx >= fotos.length - 1)) {
      accion = () => setFotoIdx(0); // un solo producto: solo repite sus fotos
    }
    const t = setTimeout(accion, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide?.id, fotoIdx, video, slides.length]);

  // Que la pantalla no se apague ni se active el protector.
  useEffect(() => {
    let lock = null;
    const pedir = async () => {
      try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch {}
    };
    pedir();
    const vuelve = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', vuelve);
    return () => { document.removeEventListener('visibilitychange', vuelve); try { lock?.release(); } catch {} };
  }, []);

  const sig = slides.length > 1 ? slides[(idxActual + 1) % slides.length] : null;
  const pocas = esProducto && (Number(slide.stock) || 0) <= 3;
  const fondo = esProducto ? (fotos[fotoIdx] || fotos[0] || null) : null;
  const palabras = esProducto ? String(slide.nombre || '').split(/\s+/).filter(Boolean) : [];
  const cinta = FRASES_CINTA.join('   ✦   ') + '   ✦   ';

  return (
    <div style={{ background: '#000', minHeight: '100vh', display: 'flex', justifyContent: 'center', cursor: 'none' }}>
      <style>{`
        @keyframes pn-entra { from { opacity: 0; transform: translateY(3cqw) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes pn-palabra { from { opacity: 0; transform: translateY(4cqw); } to { opacity: 1; transform: none; } }
        @keyframes pn-zoom { from { transform: scale(1.0); } to { transform: scale(1.09); } }
        @keyframes pn-sello { 0% { opacity: 0; transform: rotate(-4deg) scale(0.4); } 60% { opacity: 1; transform: rotate(-4deg) scale(1.08); } 100% { opacity: 1; transform: rotate(-4deg) scale(1); } }
        @keyframes pn-brillo { 0%, 55% { transform: translateX(-130%) skewX(-20deg); } 85%, 100% { transform: translateX(260%) skewX(-20deg); } }
        @keyframes pn-pulso { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
        @keyframes pn-cinta { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes pn-flota { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.2cqw); } }
        @keyframes pn-mascota-entra { 0% { opacity: 0; transform: translateY(12%) scale(0.5, 0.3); } 60% { opacity: 1; transform: translateY(-4%) scale(0.95, 1.12); } 100% { opacity: 1; transform: none; } }
        @keyframes pn-mascota-sale { 0% { transform: none; } 35% { transform: scale(1.1, 0.85); } 100% { opacity: 0; transform: translateY(10%) scale(0.4, 0.2); } }
        .pn-marco { container-type: inline-size; }
        .pn-copia, .pn-copia * { animation-delay: -60s !important; animation-play-state: paused !important; transition: none !important; }
      `}</style>

      <div
        className="pn-marco"
        ref={marcoRef}
        style={{
          position: 'relative', overflow: 'hidden',
          height: '100vh', width: 'min(100vw, calc(100vh * 9 / 16))',
          background: C.cafe,
          fontFamily: 'var(--font-baloo2), var(--font-poppins), sans-serif',
          color: C.crema, display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Fondo: la misma foto del producto, difuminada — cada producto pinta la pantalla de su color */}
        {fondo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={fondo} data-fondo="" src={fondo} alt="" style={{ position: 'absolute', inset: '-10%', width: '120%', height: '120%', objectFit: 'cover', filter: 'blur(9cqw) saturate(1.5)', opacity: 0.6, transition: 'opacity 1s', animation: 'pn-entra 1.2s ease-out both' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(42,33,24,0.25) 0%, rgba(42,33,24,0.55) 55%, rgba(18,13,8,0.92) 100%)` }} />

        {/* Encabezado: logo grande sobre crema */}
        <div style={{ position: 'relative', background: C.crema, borderRadius: '0 0 6cqw 6cqw', padding: '2cqw 0 1.6cqw', display: 'flex', justifyContent: 'center', boxShadow: '0 1.5cqw 5cqw rgba(0,0,0,0.35)' }}>
          <div style={{ animation: 'pn-flota 6s ease-in-out infinite' }}><Logo ancho="21cqw" /></div>
        </div>

        {!slide ? (
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4cqw', textAlign: 'center' }}>
            <div style={{ fontSize: '7cqw', fontWeight: 700 }}>{cargado ? 'Pronto, nuevos productos' : 'Cargando…'}</div>
            <div style={{ fontSize: '4.5cqw', color: C.arena }}>denog.mx</div>
          </div>
        ) : slide.tipo === 'lamina' ? (
          /* Lámina: únete al grupo de WhatsApp */
          <div key={slide.id} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4.5cqw', padding: '5cqw 6cqw', textAlign: 'center', animation: 'pn-entra 0.9s ease-out both' }}>
            <div style={{ fontSize: '8.6cqw', fontWeight: 800, lineHeight: 1.05 }}>Únete a nuestro<br />grupo de <span style={{ color: '#5fe08f' }}>WhatsApp</span></div>
            <div style={{ fontSize: '4.6cqw', color: C.arena }}>Novedades y ofertas antes que nadie</div>
            <div style={{ width: '56cqw', height: '56cqw', padding: '3cqw', background: '#fff', borderRadius: '6cqw', boxShadow: `0 0 0 1.5cqw ${C.terracota}`, animation: 'pn-pulso 2.4s ease-in-out infinite' }}>
              <QR texto={LINK_GRUPO_WHATSAPP} />
            </div>
            <div style={{ fontSize: '5.2cqw', fontWeight: 700 }}>📱 Abre tu cámara y escanéame</div>
          </div>
        ) : (
          <div key={slide.id} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Foto(s) o video */}
            <div style={{ flex: 1, margin: '4cqw 4cqw 0', position: 'relative', minHeight: 0, animation: 'pn-entra 0.9s ease-out both' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '6cqw', overflow: 'hidden', background: C.crema, boxShadow: '0 2cqw 7cqw rgba(0,0,0,0.45)' }}>
                {video ? (
                  <video
                    key={video}
                    src={video}
                    poster={fotos[0] || undefined}
                    autoPlay muted playsInline
                    onEnded={avanzar}
                    onError={() => setTimeout(siguiente, 800)}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
                  />
                ) : (
                  fotos.map((f, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={f}
                      src={f}
                      alt={i === 0 ? slide.nombre : ''}
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '3cqw', boxSizing: 'border-box',
                        opacity: i === fotoIdx ? 1 : 0, transition: 'opacity 0.9s ease',
                        animation: i === fotoIdx ? `pn-zoom ${segFoto + 1}s ease-out both` : 'none',
                      }}
                    />
                  ))
                )}
              </div>

              {/* Categoría y últimas piezas */}
              {slide.categoria && (
                <div style={{ position: 'absolute', top: '3.5cqw', left: '3.5cqw', background: 'rgba(42,33,24,0.85)', color: C.crema, borderRadius: '10cqw', padding: '1.3cqw 3.6cqw', fontSize: '3.8cqw', fontWeight: 600 }}>
                  {emojiPara(slide.categoria)} {slide.categoria}
                </div>
              )}
              {pocas && (
                <div style={{ position: 'absolute', top: '3.5cqw', right: '3.5cqw', background: C.terracota, color: '#fff', borderRadius: '10cqw', padding: '1.3cqw 3.6cqw', fontSize: '3.8cqw', fontWeight: 700, animation: 'pn-pulso 1.6s ease-in-out infinite' }}>
                  ¡Últimas piezas!
                </div>
              )}

              {/* Puntitos: en qué foto vamos */}
              {!video && fotos.length > 1 && (
                <div style={{ position: 'absolute', bottom: '3.5cqw', left: '4cqw', display: 'flex', gap: '1.4cqw' }}>
                  {fotos.map((f, i) => (
                    <span key={f} style={{ height: '1.6cqw', width: i === fotoIdx ? '7cqw' : '1.6cqw', borderRadius: '1cqw', background: i === fotoIdx ? C.terracota : 'rgba(42,33,24,0.35)', transition: 'all 0.5s' }} />
                  ))}
                </div>
              )}

              {/* Precio tipo etiqueta, montado sobre la esquina de la foto */}
              <div ref={precioRef} style={{ position: 'absolute', right: '-1cqw', bottom: '-6cqw', animation: 'pn-sello 0.8s 0.35s cubic-bezier(.2,.9,.3,1.3) both' }}>
                <div style={{ position: 'relative', overflow: 'hidden', background: C.terracota, color: C.crema, borderRadius: '4cqw', padding: '1.6cqw 5cqw 0.8cqw', boxShadow: '0 2cqw 5cqw rgba(0,0,0,0.45)', border: `0.8cqw solid ${C.crema}` }}>
                  {slide.precioVaria && <div style={{ fontSize: '3.8cqw', fontWeight: 600, lineHeight: 1, color: '#ffe3d6' }}>desde</div>}
                  <div style={{ fontSize: '15cqw', fontWeight: 800, lineHeight: 1 }}>{precioTexto(slide.precio_venta)}</div>
                  <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'pn-brillo 3.2s ease-in-out infinite' }} />
                </div>
              </div>
            </div>

            {/* Nombre, palabra por palabra */}
            <div style={{ padding: '8cqw 6cqw 0', minHeight: '17cqw' }}>
              <div style={{ fontSize: '6.6cqw', fontWeight: 700, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textShadow: '0 0.5cqw 2cqw rgba(0,0,0,0.5)' }}>
                {palabras.map((w, i) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: '1.6cqw', animation: `pn-palabra 0.6s ${0.5 + i * 0.08}s ease-out both` }}>{w}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* QRs fijos: grupo de WhatsApp y sitio web (en la lámina ya está el grande) */}
        {slide?.tipo !== 'lamina' && <div ref={qrRef} style={{ position: 'relative', display: 'flex', gap: '4cqw', padding: '4cqw 6cqw 3.5cqw' }}>
          {LINK_GRUPO_WHATSAPP && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '3cqw', background: 'rgba(251,248,243,0.1)', borderRadius: '4cqw', padding: '2.5cqw' }}>
              <div style={{ width: '16cqw', height: '16cqw', flex: 'none' }}><QR texto={LINK_GRUPO_WHATSAPP} /></div>
              <div style={{ fontSize: '3.5cqw', lineHeight: 1.2 }}><b style={{ color: '#5fe08f' }}>Únete al grupo</b><br />de WhatsApp</div>
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '3cqw', background: 'rgba(251,248,243,0.1)', borderRadius: '4cqw', padding: '2.5cqw' }}>
            <div style={{ width: '16cqw', height: '16cqw', flex: 'none' }}><QR texto={LINK_SITIO} /></div>
            <div style={{ fontSize: '3.5cqw', lineHeight: 1.2 }}><b style={{ color: C.arena }}>Compra en línea</b><br />denog.mx</div>
          </div>
        </div>}

        {/* Cinta corriendo */}
        <div style={{ position: 'relative', background: C.terracota, padding: '1.8cqw 0', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-block', animation: 'pn-cinta 28s linear infinite', fontSize: '4cqw', fontWeight: 700, color: C.crema }}>
            <span>{cinta}</span><span>{cinta}</span>
          </div>
        </div>

        {/* Aquí se pintan el vidrio que se estrella y la página que se rasga */}
        <div ref={efectosRef} data-efectos="" style={{ position: 'absolute', inset: 0, zIndex: 25, pointerEvents: 'none' }} />

        {/* La mascota, suelta por toda la pantalla */}
        {mascota && (
          <Mascota key={mascota.clave} accion={mascota} marcoRef={marcoRef} precioRef={precioRef} qrRef={qrRef} onFin={() => setMascota(null)} />
        )}

        {/* Precarga de las fotos del siguiente producto */}
        {sig?.tipo === 'producto' && sig.fotos.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f} src={f} alt="" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        ))}
      </div>
    </div>
  );
}
