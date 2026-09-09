'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Modal de escaneo: abre la cámara, busca un QR en cada cuadro y avisa en
// cuanto encuentra uno. Como en las computadoras de mostrador normalmente
// no hay cámara, también hay un campo de texto siempre listo (con el foco
// puesto ahí desde que se abre) para que una pistola lectora USB dispare
// directo — una pistola no es más que un teclado que escribe muy rápido y
// manda Enter solo, así que no necesita nada especial del lado del código.
// Ese mismo campo también sirve para teclear el código a mano si hace
// falta: el código va impreso en letra grande en el estado de cuenta.
export default function EscanearQR({ onDetectado, onCerrar }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelado = false;

    async function arrancar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        buscar();
      } catch (e) {
        setError('No se pudo abrir la cámara. Usa tu lector o escribe el código.');
      }
    }

    function buscar() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(buscar);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const resultado = jsQR(imagen.data, imagen.width, imagen.height);
      if (resultado?.data) {
        onDetectado(resultado.data.trim());
        return; // se detiene: onDetectado normalmente cierra el modal
      }
      rafRef.current = requestAnimationFrame(buscar);
    }

    arrancar();

    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El foco va al campo desde que se abre el modal: una pistola lectora
  // escribe donde esté el cursor, y así dispara sin que nadie tenga que
  // hacer clic primero.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscarManual = () => {
    if (manual.trim()) onDetectado(manual.trim());
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--sup)', borderRadius: 16, padding: 20, maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: 'var(--tinta)', fontWeight: 700, fontSize: 15 }}>📷 Escanear código del cliente</span>
          <button onClick={onCerrar} style={{ background: 'transparent', border: 'none', color: 'var(--w40)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {!error ? (
          <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
          </div>
        ) : (
          <div style={{ color: 'var(--rojo-t)', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <div style={{ marginTop: 14 }}>
          <div style={{ color: 'var(--w40)', fontSize: 11.5, marginBottom: 6 }}>
            {error ? 'Dispara tu lector aquí, o escribe el código:' : 'O usa tu lector / escríbelo a mano aquí:'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={manual}
              onChange={e => setManual(e.target.value.toUpperCase())}
              placeholder="D-XXXXX"
              onKeyDown={e => { if (e.key === 'Enter') buscarManual() }}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--w12)', background: 'var(--w03)', color: 'var(--tinta)', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}
            />
            <button
              onClick={buscarManual}
              disabled={!manual.trim()}
              style={{ padding: '10px 18px', borderRadius: 10, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', color: 'var(--marca-t)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: manual.trim() ? 1 : 0.5 }}
            >
              Buscar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
