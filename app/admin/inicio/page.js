'use client';

import { useState, useEffect } from 'react';

export default function InicioMenu() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const datos = localStorage.getItem('cliente');
    if (datos) setUsuario(JSON.parse(datos));
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-3">👋</div>
        <div className="text-white text-2xl font-bold mb-1">
          Hola{usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : ''}
        </div>
        <div className="text-slate-400 text-sm">Elige una opción del menú para comenzar.</div>
      </div>
    </div>
  );
}
