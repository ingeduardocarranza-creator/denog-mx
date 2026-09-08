'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// Modal de escaneo: abre la cámara, busca un QR en cada cuadro y avisa en
// cuanto encuentra uno. Si la cámara no arranca (permiso negado, o la
// pantalla no tiene cámara — pasa en algunas computadoras de mostrador), se
// cae a un campo de texto: el código también se imprime en letra grande en
// el estado de cuenta, así que siempre hay cómo teclearlo a mano.
export default function EscanearQR({ onDetectado, onCerrar, colaborador }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState('');
  // El escaneo con cámara lee el QR de verdad — eso ya es suficiente prueba.
  // Lo escrito a mano no: cualquiera puede teclear un código sin ver el papel,
  // así que antes de aceptarlo se pide que el colaborador en turno lo autorice.
  const [autorizando, setAutorizando] = useState(false);

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
        setError('No se pudo abrir la cámara. Puedes escribir el código a mano.');
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
          {!autorizando ? (
            <>
              <div style={{ color: 'var(--w40)', fontSize: 11.5, marginBottom: 6 }}>
                {error ? 'Escribe el código que aparece en el estado de cuenta del cliente:' : 'O escríbelo a mano si la cámara no lo lee:'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={manual}
                  onChange={e => setManual(e.target.value.toUpperCase())}
                  placeholder="D-XXXXX"
                  onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) setAutorizando(true) }}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--w12)', background: 'var(--w03)', color: 'var(--tinta)', fontSize: 14, fontWeight: 700, letterSpacing: 1 }}
                />
                <button
                  onClick={() => manual.trim() && setAutorizando(true)}
                  disabled={!manual.trim()}
                  style={{ padding: '10px 18px', borderRadius: 10, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', color: 'var(--marca-t)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: manual.trim() ? 1 : 0.5 }}
                >
                  Buscar
                </button>
              </div>
            </>
          ) : (
            <div style={{ background: 'var(--w03)', border: '1px solid var(--w12)', borderRadius: 10, padding: 12 }}>
              <div style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                Código escrito a mano: {manual.trim()}
              </div>
              <div style={{ color: 'var(--w40)', fontSize: 11.5, marginBottom: 10 }}>
                Esto no pasó por la cámara. Confirma que tú, {colaborador?.nombre || 'colaborador en turno'}, autorizas entregar con este código.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setAutorizando(false)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'transparent', border: '1px solid var(--w12)', color: 'var(--w40)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onDetectado(manual.trim())}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', color: 'var(--marca-t)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Autorizo, buscar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
