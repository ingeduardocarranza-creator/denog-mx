// Transiciones de caricatura para cambiar de producto en la pantalla de la
// tienda: el vidrio se estrella y cae en pedazos, o la página se rasga.
//
// Cómo funcionan: se hace una COPIA de lo que se ve en pantalla y se pone
// encima; debajo ya se cambia al siguiente producto. Luego la copia se rompe
// o se rasga y deja ver el producto nuevo. Todo con Web Animations (sin
// librerías), para que corra ligero en la computadora de la tienda.
//
// El perrito actúa en las dos (clips de Gemini sin fondo verde): se estampa
// contra el vidrio, y jala la página hasta rasgarla. Los segundos de cada clip
// (cuándo se estampa, cuándo suelta) están aquí abajo. Si el clip no se puede
// reproducir (Safari no muestra el fondo transparente), la transición se hace
// sin el perrito.
const CLIP_VIDRIO = { src: '/assets/mascota/estamparse.webm', golpe: 2.3, sale: 9.3, cara: [0.5, 0.45] };
const CLIP_JALAR = { src: '/assets/mascota/jalar.webm', rasga: 1.6, suelta: 5.4, fin: 9.9 };

const NS = 'http://www.w3.org/2000/svg';
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Copia "congelada" de la pantalla: las animaciones se quedan en su estado
// final (si no, la copia volvería a animar la entrada y parpadearía).
function copiar(marco) {
  const copia = marco.cloneNode(true);
  copia.removeAttribute('id');
  copia.classList.add('pn-copia');
  copia.querySelectorAll('[data-efectos]').forEach((n) => n.remove());
  // El fondo difuminado es caro de mover en pedazos: en la copia se quita.
  copia.querySelectorAll('[data-fondo]').forEach((n) => n.remove());
  copia.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch {} });
  Object.assign(copia.style, { position: 'absolute', left: '0', top: '0', margin: '0' });
  return copia;
}

// Espera a que la copia ya esté pintada (fotos decodificadas) antes de cambiar
// de producto debajo; si no, por un instante se alcanza a ver el nuevo.
async function listaParaTapar(...copias) {
  const imgs = copias.flatMap((c) => [...c.querySelectorAll('img')]);
  await Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
}

const esSafari = () => typeof navigator !== 'undefined' && /Apple/.test(navigator.vendor || '');

// Pone un clip del perrito encima de la copia, a todo lo ancho de la pantalla.
async function ponerClip(capa, src, W, top) {
  if (esSafari()) return null;
  const v = document.createElement('video');
  v.src = src; v.muted = true; v.playsInline = true; v.preload = 'auto';
  Object.assign(v.style, {
    position: 'absolute', left: '0', top: `${top}px`, width: `${W}px`, height: `${(W * 9) / 16}px`,
    pointerEvents: 'none', filter: 'drop-shadow(0 1.5cqw 2.5cqw rgba(0,0,0,.45))',
  });
  capa.appendChild(v);
  const ok = await new Promise((res) => {
    const t = setTimeout(() => res(false), 2500);
    v.addEventListener('playing', () => { clearTimeout(t); res(true); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); res(false); }, { once: true });
    v.play().catch(() => { clearTimeout(t); res(false); });
  });
  if (!ok) { v.remove(); return null; }
  return v;
}
// Espera a que el clip llegue a cierto segundo (o termine, o pase el tope).
const hasta = (v, seg, maxMs) => new Promise((ok) => {
  const t0 = performance.now();
  const tick = () => ((v.currentTime >= seg || v.ended || performance.now() - t0 > maxMs) ? ok() : requestAnimationFrame(tick));
  tick();
});
function quitarClip(v) {
  if (!v) return;
  v.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => v.remove(), () => v.remove());
}

const recorte = (pts) => `polygon(${pts.map((p) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`;

// ── Vidrio estrellado ─────────────────────────────────────────────────
export async function romperVidrio(marco, capa, alCambiar) {
  const { width: W, height: H } = marco.getBoundingClientRect();
  const copia = copiar(marco);
  capa.appendChild(copia);
  await listaParaTapar(copia);
  alCambiar();

  // El perrito corre hacia la cámara y se estampa: ahí se estrella el vidrio.
  const caraY = H * 0.4;
  const clipTop = caraY - CLIP_VIDRIO.cara[1] * ((W * 9) / 16);
  const perro = await ponerClip(capa, CLIP_VIDRIO.src, W, clipTop);
  if (perro) await hasta(perro, CLIP_VIDRIO.golpe, 5000);

  const cx = perro ? W * CLIP_VIDRIO.cara[0] : W * (0.35 + Math.random() * 0.3);
  const cy = perro ? caraY : H * (0.3 + Math.random() * 0.25);
  const n = 9;
  const rayos = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5).sort((a, b) => a - b);
  const r1 = W * (0.13 + Math.random() * 0.05);
  const anillo = rayos.map((a) => [cx + Math.cos(a) * r1 * (0.8 + Math.random() * 0.4), cy + Math.sin(a) * r1 * (0.8 + Math.random() * 0.4)]);
  const lejos = H * 1.5;

  // Las grietas se dibujan desde el golpe hacia afuera.
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const linea = (pts, ancho) => {
    const p = document.createElementNS(NS, 'polyline');
    p.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#fff');
    p.setAttribute('stroke-width', ancho);
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('opacity', '0.9');
    p.style.filter = 'drop-shadow(0 0 2px rgba(0,0,0,.8))';
    svg.appendChild(p);
    const L = 3000;
    p.style.strokeDasharray = L;
    p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' });
  };
  rayos.forEach((a) => {
    const pts = [[cx, cy]];
    for (let k = 1; k <= 6; k++) {
      const d = (lejos / 6) * k, j = (Math.random() - 0.5) * 0.12;
      pts.push([cx + Math.cos(a + j) * d, cy + Math.sin(a + j) * d]);
    }
    linea(pts, W * 0.005);
  });
  linea([...anillo, anillo[0]], W * 0.004);
  const golpe = document.createElementNS(NS, 'circle');
  golpe.setAttribute('cx', cx); golpe.setAttribute('cy', cy); golpe.setAttribute('r', W * 0.025); golpe.setAttribute('fill', '#fff');
  svg.appendChild(golpe);
  capa.appendChild(svg);
  marco.animate(
    [{ transform: 'translateX(-1.8%)' }, { transform: 'translateX(1.4%)' }, { transform: 'translateX(-0.8%)' }, { transform: 'translateX(0.3%)' }, { transform: 'none' }],
    { duration: 450, easing: 'ease-out' }
  );
  // Se queda pegado, mareado, y se resbala hasta salir por abajo.
  if (perro) { await hasta(perro, CLIP_VIDRIO.sale, 9000); quitarClip(perro); }
  else await espera(1100);

  // ¡Se cae en pedazos!
  const piezas = [];
  rayos.forEach((a, i) => {
    const b = rayos[(i + 1) % n];
    const p1 = anillo[i], p2 = anillo[(i + 1) % n];
    piezas.push([[cx, cy], p1, p2]);
    piezas.push([p1, [cx + Math.cos(a) * lejos, cy + Math.sin(a) * lejos], [cx + Math.cos(b) * lejos, cy + Math.sin(b) * lejos], p2]);
  });
  const animaciones = piezas.map((pts) => {
    const pedazo = copia.cloneNode(true);
    pedazo.style.clipPath = recorte(pts);
    capa.appendChild(pedazo);
    const mx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
    const my = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    pedazo.style.transformOrigin = `${mx}px ${my}px`;
    const dist = Math.hypot(mx - cx, my - cy);
    const anim = pedazo.animate(
      [{ transform: 'none' }, { transform: `translate(${(mx - cx) * 0.25}px, ${H * 1.3}px) rotate(${(Math.random() - 0.5) * 60}deg)` }],
      { duration: 1000 + Math.random() * 400, delay: (dist / H) * 500, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }
    );
    return anim.finished.then(() => pedazo.remove(), () => pedazo.remove());
  });
  copia.remove();
  svg.remove();
  await Promise.all(animaciones);
}

// ── Página rasgada ────────────────────────────────────────────────────
export async function rasgarPagina(marco, capa, alCambiar) {
  const { width: W, height: H } = marco.getBoundingClientRect();
  // Primero una copia entera; el perrito agarra la orilla y jala.
  const entera = copiar(marco);
  capa.appendChild(entera);
  await listaParaTapar(entera);
  alCambiar();
  const perro = await ponerClip(capa, CLIP_JALAR.src, W, H * 0.3);
  if (perro) {
    await hasta(perro, CLIP_JALAR.rasga, 4000);
    return rasgarConPerro(capa, entera, perro, W, H);
  }
  return rasgarSola(capa, entera, W, H);
}

function mitades(base, W, H) {
  const zig = [];
  for (let k = 0; k <= 16; k++) zig.push([W * 0.5 + (k % 2 ? W * 0.035 : -W * 0.035) + (Math.random() - 0.5) * W * 0.02, (H / 16) * k]);
  const izq = base.cloneNode(true), der = base.cloneNode(true);
  izq.style.clipPath = recorte([[0, 0], ...zig, [0, H]]);
  der.style.clipPath = recorte([[W, 0], ...zig, [W, H]]);
  [izq, der].forEach((c) => { c.style.filter = 'drop-shadow(0 0 1.5cqw rgba(0,0,0,.6))'; });
  der.style.transformOrigin = '100% 100%';
  izq.style.transformOrigin = '0% 0%';
  return [izq, der];
}

// Con el perrito: mientras jala, el papel se rasga y tiembla; cuando suelta,
// los dos pedazos se caen y él se va corriendo.
async function rasgarConPerro(capa, entera, perro, W, H) {
  const [izq, der] = mitades(entera, W, H);
  capa.insertBefore(izq, perro);
  capa.insertBefore(der, perro);
  entera.remove();
  const tiembla = [
    izq.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: `translateX(${-W * 0.012}px) rotate(-0.6deg)` }], { duration: 110, iterations: Infinity, direction: 'alternate' }),
    der.animate([{ transform: 'translateX(0) rotate(0deg)' }, { transform: `translateX(${W * 0.012}px) rotate(0.8deg)` }], { duration: 95, iterations: Infinity, direction: 'alternate' }),
  ];
  await hasta(perro, CLIP_JALAR.suelta, 6000);
  tiembla.forEach((a) => a.cancel());
  const vuela = der.animate(
    [{ transform: 'none' }, { transform: `translate(${W * 1.1}px, ${H * 0.15}px) rotate(20deg)` }],
    { duration: 800, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }
  );
  const cae = izq.animate(
    [{ transform: 'none', offset: 0 }, { transform: 'rotate(-4deg)', offset: 0.2 }, { transform: `translateY(${H * 1.25}px) rotate(-25deg)`, offset: 1 }],
    { duration: 1100, easing: 'ease-in', fill: 'forwards' }
  );
  await Promise.all([vuela.finished.catch(() => {}), cae.finished.catch(() => {})]);
  izq.remove();
  der.remove();
  await hasta(perro, CLIP_JALAR.fin, 6000);
  quitarClip(perro);
}

// Sin el perrito: dos jaloncitos y ¡zas!
async function rasgarSola(capa, entera, W, H) {
  const [izq, der] = mitades(entera, W, H);
  capa.appendChild(izq);
  capa.appendChild(der);
  entera.remove();
  await espera(150);
  // Dos jaloncitos... y ¡zas!
  for (let i = 1; i <= 2; i++) {
    await der.animate(
      [{ transform: `translateX(${W * 0.015 * (i - 1)}px) rotate(${1.5 * (i - 1)}deg)` }, { transform: `translateX(${W * 0.015 * i}px) rotate(${1.5 * i}deg)` }],
      { duration: 140, easing: 'ease-out', fill: 'forwards' }
    ).finished.catch(() => {});
    await espera(120);
  }
  const vuela = der.animate(
    [{ transform: `translateX(${W * 0.03}px) rotate(3deg)` }, { transform: `translate(${W * 1.1}px, ${H * 0.1}px) rotate(18deg)` }],
    { duration: 850, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' }
  );
  const cae = izq.animate(
    [{ transform: 'none', offset: 0 }, { transform: 'rotate(-4deg)', offset: 0.2 }, { transform: 'rotate(3deg)', offset: 0.35 }, { transform: `translateY(${H * 1.25}px) rotate(-25deg)`, offset: 1 }],
    { duration: 1300, delay: 150, easing: 'ease-in', fill: 'forwards' }
  );
  await Promise.all([vuela.finished.catch(() => {}), cae.finished.catch(() => {})]);
  izq.remove();
  der.remove();
}

export const TRANSICIONES = { vidrio: romperVidrio, rasga: rasgarPagina };
