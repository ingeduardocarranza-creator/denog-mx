'use client';

import { useState, useEffect } from 'react';

export default function CatalogoTienda() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  // NUEVAS LISTAS Y BUSCADORES
  const [listaCategorias, setListaCategorias] = useState(['Ropa', 'Calzado', 'Comida / Snacks', 'Artículos de Hogar', 'Cuidado Personal']);
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [mostrarCreadorCat, setMostrarCreadorCat] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // COTIZADOR — persiste en sesión, no se resetea al limpiar formulario
  const [tipoCambio, setTipoCambio] = useState('18.50');
  const [tipoTax, setTipoTax] = useState('arizona');
  const [taxDenogPct, setTaxDenogPct] = useState('');

  // CAMPOS DEL FORMULARIO
  const [nombre, setNombre] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [precioUsd, setPrecioUsd] = useState('');
  const [costo, setCosto] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [stock, setStock] = useState('');
  const [categoria, setCategoria] = useState('Ropa');
  const [imagenUrl, setImagenUrl] = useState('');
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  // Mercadito: mismos productos, con datos extra opcionales para publicarlos
  // en la tienda pública en línea.
  const [mostrarEnMercadito, setMostrarEnMercadito] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [galeria, setGaleria] = useState([]);
  const [subiendoGaleriaSlot, setSubiendoGaleriaSlot] = useState(null);
  const GALERIA_SLOTS = 2; // + foto principal = 3 fotos en total

  // SUBIR FOTO: pide una URL firmada al servidor y sube el archivo directo
  // del navegador a Supabase Storage (no pasa por nuestra función serverless,
  // así no choca con el límite de tamaño de body de Vercel).
  const subirFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: 'La foto pesa más de 15MB. Usa una más ligera.' });
      return;
    }

    setSubiendoImagen(true);
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: file.type }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo preparar la subida.');

      const formData = new FormData();
      formData.append('', file, file.name);
      const subeRes = await fetch(datos.signedUrl, { method: 'PUT', body: formData });
      if (!subeRes.ok) throw new Error('Error al subir la foto al servidor.');

      setImagenUrl(datos.publicUrl);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error al subir la foto: ' + err.message });
    } finally {
      setSubiendoImagen(false);
    }
  };

  // SUBIR FOTOS DE GALERÍA (miniaturas extra para la ficha del Mercadito)
  const subirFotoGaleria = (idx) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: 'La foto pesa más de 15MB. Usa una más ligera.' });
      return;
    }
    setSubiendoGaleriaSlot(idx);
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: file.type, carpeta: 'mercadito' }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo preparar la subida.');
      const formData = new FormData();
      formData.append('', file, file.name);
      const subeRes = await fetch(datos.signedUrl, { method: 'PUT', body: formData });
      if (!subeRes.ok) throw new Error('Error al subir la foto al servidor.');
      setGaleria((g) => { const next = [...g]; next[idx] = datos.publicUrl; return next; });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error al subir la foto: ' + err.message });
    } finally {
      setSubiendoGaleriaSlot(null);
    }
  };
  const quitarFotoGaleria = (idx) => setGaleria((g) => g.filter((_, i) => i !== idx));

  // 1. CARGAR DATOS Y EXTRAER CATEGORÍAS EXISTENTES
  const cargarProductosYCategorias = async () => {
    const res = await fetch('/api/admin/catalogo').then(r => r.json());
    if (res.ok) {
      setProductos(res.productos);
      const catsExistentes = res.productos.map(p => p.categoria).filter(Boolean);
      const categoriasUnicas = [...new Set([...listaCategorias, ...catsExistentes])];
      setListaCategorias(categoriasUnicas);
    }
  };

  useEffect(() => {
    cargarProductosYCategorias();
  }, []);

  // 2. AGREGAR NUEVA CATEGORÍA A LA LISTA DESPLEGABLE
  const agregarCategoriaALista = (e) => {
    e.preventDefault();
    if (!nuevaCategoriaInput.trim()) return;
    
    const nuevaCat = nuevaCategoriaInput.trim();
    if (!listaCategorias.includes(nuevaCat)) {
      setListaCategorias([...listaCategorias, nuevaCat]);
    }
    setCategoria(nuevaCat); // La selecciona automáticamente
    setNuevaCategoriaInput('');
    setMostrarCreadorCat(false);
  };

  // 3. GUARDAR O ACTUALIZAR PRODUCTO
  const guardarProducto = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    const codigoFinal = codigoBarras.trim() || `GEN-${Date.now().toString().slice(-8)}`;

    const datosProducto = {
      nombre: nombre.trim(),
      codigo_barras: codigoFinal,
      costo: costoMxn,
      precio_venta: Number(precioVenta) || 0,
      stock: Number(stock) || 0,
      categoria: categoria,
      imagen_url: imagenUrl.trim() || null,
      activo: true,
      mostrar_en_mercadito: mostrarEnMercadito,
      descripcion: descripcion.trim() || null,
      galeria: galeria.filter(Boolean),
      pendiente_aprobacion: false, // cualquier guardado del admin lo aprueba
    };

    try {
      const res = await fetch('/api/admin/catalogo', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editandoId ? { id: editandoId, ...datosProducto } : datosProducto),
      }).then(r => r.json());

      if (!res.ok) throw new Error(res.mensaje || 'Error al guardar');
      setMensaje({ tipo: 'exito', texto: editandoId ? '¡Artículo actualizado correctamente!' : '¡Artículo registrado en el stock disponible!' });
      limpiarFormulario();
      cargarProductosYCategorias();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // 4. PREPARAR EDICIÓN
  const iniciarEdicion = (p) => {
    setEditandoId(p.id);
    setNombre(p.nombre);
    setCodigoBarras(p.codigo_barras || '');
    setPrecioUsd('');
    setCosto(p.costo || '');
    setPrecioVenta(p.precio_venta || '');
    setStock(p.stock || '0');
    setCategoria(p.categoria || 'Ropa');
    setImagenUrl(p.imagen_url || '');
    setMostrarEnMercadito(!!p.mostrar_en_mercadito);
    setDescripcion(p.descripcion || '');
    setGaleria(p.galeria || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cambiarEstadoActivo = async (id, estadoActual) => {
    await fetch('/api/admin/catalogo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo: !estadoActual }),
    });
    cargarProductosYCategorias();
  };

  const toggleMercadito = async (id, estadoActual) => {
    await fetch('/api/admin/catalogo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mostrar_en_mercadito: !estadoActual }),
    });
    cargarProductosYCategorias();
  };

  const limpiarFormulario = () => {
    setEditandoId(null);
    setNombre('');
    setCodigoBarras('');
    setPrecioUsd('');
    setCosto('');
    setPrecioVenta('');
    setStock('');
    setCategoria(listaCategorias[0] || 'Ropa');
    setImagenUrl('');
    setMostrarEnMercadito(false);
    setDescripcion('');
    setGaleria([]);
  };

  // COTIZADOR — cálculos en tiempo real
  const taxPct = tipoTax === 'arizona' ? 0.086 : tipoTax === 'california' ? 0.0775 : (Number(taxDenogPct) / 100 || 0)
  const costoMxn = precioUsd ? Number(precioUsd) * (1 + taxPct) * Number(tipoCambio) : Number(costo) || 0
  const venta = Number(precioVenta) || 0
  const utilidad = venta - costoMxn
  const margen = venta > 0 ? (utilidad / venta) * 100 : 0

  // 5. FILTRADO DINÁMICO MEDIANTE EL BUSCADOR DE LA TABLA
  const productosPendientes = productos.filter(p => p.pendiente_aprobacion);
  const productosFiltrados = productos.filter(p => !p.pendiente_aprobacion).filter(p =>
    p.nombre?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    p.codigo_barras?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(filtroBusqueda.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* ENCABEZADO */}
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Catálogo de Mercancía Física — Denog</h1>
          <p className="text-xs text-slate-400 mt-1">Alta de saldos, ropa de liquidación, snacks y artículos importados listos para entrega inmediata</p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-xl text-xs font-bold text-center border ${mensaje.tipo === 'exito' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900' : 'bg-red-950/40 text-red-400 border-red-900'}`}>
            {mensaje.texto}
          </div>
        )}

        {/* POR APROBAR — productos que agregaron/editaron colaboradores, les falta costo/precio/stock */}
        {productosPendientes.length > 0 && (
          <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
              🕓 Por aprobar ({productosPendientes.length})
            </h2>
            <p className="text-[11px] text-amber-400/70">Agregados por colaboradores — falta capturar costo, precio de venta y stock antes de que aparezcan en el catálogo.</p>
            <div className="space-y-2">
              {productosPendientes.map((p) => (
                <div key={p.id} className="flex items-center gap-3 bg-[#161b26] border border-amber-900/40 rounded-xl p-3">
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagen_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-700 flex-none" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-lg">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-200 text-xs">{p.nombre}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {p.categoria} · {p.codigo_barras}{p.creador?.nombre ? ` · agregado por ${p.creador.nombre}` : ''}
                    </p>
                  </div>
                  <button onClick={() => iniciarEdicion(p)} className="flex-none bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg font-bold text-[11px]">
                    Completar y aprobar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* FORMULARIO DE CAPTURA CON EJEMPLOS DE ARTÍCULOS AMERICANOS */}
          <div className="bg-[#161b26] p-5 rounded-2xl border border-slate-800 h-fit space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
              {editandoId ? '📝 Editar Artículo' : '📦 Registrar Mercancía'}
            </h2>
            
            <form onSubmit={guardarProducto} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Descripción / Artículo *</label>
                <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Chamarra Columbia Hombre Talla M" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none" />
              </div>

              {/* SECCIÓN DE CATEGORÍA CON CREADOR INTEGRADO */}
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 font-bold">Categoría</label>
                  <button type="button" onClick={() => setMostrarCreadorCat(!mostrarCreadorCat)} className="text-[11px] text-[#dd8a6c] hover:underline font-bold">
                    {mostrarCreadorCat ? 'Cancelar' : '+ Nueva Categoría'}
                  </button>
                </div>

                {mostrarCreadorCat ? (
                  <div className="flex gap-2 p-2 bg-[#111520] rounded-xl border border-slate-800 animate-fadeIn">
                    <input type="text" placeholder="Nombre de categoría..." value={nuevaCategoriaInput} onChange={(e) => setNuevaCategoriaInput(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs" />
                    <button type="button" onClick={agregarCategoriaALista} className="bg-[#c1553a] text-white font-bold px-3 py-1.5 rounded-lg">Añadir</button>
                  </div>
                ) : (
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none">
                    {listaCategorias.map((cat, index) => (
                      <option key={index} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Código de Barras <span className="text-[10px] text-slate-500">(UPC / Scan)</span></label>
                <input type="text" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Escanea el código de barras de Ross/Walmart" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Foto <span className="text-[10px] text-slate-500">(referencia para el POS)</span></label>
                <div className="flex items-center gap-3">
                  {imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagenUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-700 flex-none" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-xl">📦</div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <label className="block w-full text-center bg-[#c1553a] hover:bg-[#9b3f28] text-white font-bold py-2.5 rounded-xl cursor-pointer transition-all">
                      {subiendoImagen ? 'Subiendo…' : imagenUrl ? '📷 Cambiar foto' : '📷 Tomar / subir foto'}
                      <input type="file" accept="image/*" onChange={subirFoto} disabled={subiendoImagen} className="hidden" />
                    </label>
                    {imagenUrl && (
                      <button type="button" onClick={() => setImagenUrl('')} className="w-full text-center text-[11px] text-red-400 hover:underline">
                        Quitar foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* MERCADITO */}
              <div className="space-y-3 bg-[#111520] rounded-xl p-3 border border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">🛍️ Mostrar en Mercadito</span>
                  <button type="button" onClick={() => setMostrarEnMercadito((v) => !v)}
                    className={`w-10 h-6 rounded-full relative transition-all ${mostrarEnMercadito ? 'bg-[#c1553a]' : 'bg-slate-700'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${mostrarEnMercadito ? 'left-4.5' : 'left-0.5'}`} style={{ left: mostrarEnMercadito ? 18 : 2 }} />
                  </button>
                </label>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold">Descripción (para la ficha pública del Mercadito)</label>
                  <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción visible en el Mercadito" rows={3} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none resize-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold">Fotos adicionales <span className="text-[10px] text-slate-500">(hasta {GALERIA_SLOTS}, más la foto principal = {GALERIA_SLOTS + 1} en total)</span></label>
                  <div className="flex gap-2">
                    {Array.from({ length: GALERIA_SLOTS }).map((_, idx) => (
                      <div key={idx} className="flex-1">
                        {galeria[idx] ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={galeria[idx]} alt="" className="w-full h-14 rounded-lg object-cover border border-slate-700" />
                            <button type="button" onClick={() => quitarFotoGaleria(idx)} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-4 h-4 text-[9px] leading-none">✕</button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center w-full h-14 rounded-lg bg-[#1e2533] border border-dashed border-slate-700 cursor-pointer text-slate-500 text-[10px]">
                            {subiendoGaleriaSlot === idx ? '…' : '+'}
                            <input type="file" accept="image/*" onChange={subirFotoGaleria(idx)} disabled={subiendoGaleriaSlot !== null} className="hidden" />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* COTIZADOR */}
              <div className="space-y-3 bg-[#111520] rounded-xl p-3 border border-slate-800">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">💱 Cotizador</div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold">Precio USD</label>
                    <input type="number" step="0.01" value={precioUsd} onChange={(e) => setPrecioUsd(e.target.value)} placeholder="Ej. 14.99" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold">Tipo de cambio</label>
                    <input type="number" step="0.01" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold">Impuesto</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: 'arizona', label: 'Arizona 8.6%' },
                      { key: 'california', label: 'California 7.75%' },
                      { key: 'denog', label: 'Tax Denog' },
                    ].map(op => (
                      <button key={op.key} type="button" onClick={() => setTipoTax(op.key)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${tipoTax === op.key ? 'bg-[#4a1b0c]/30 border-[#9b3f28] text-[#dd8a6c]' : 'bg-[#1e2533] border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                        {op.label}
                      </button>
                    ))}
                  </div>
                  {tipoTax === 'denog' && (
                    <input type="number" step="0.01" value={taxDenogPct} onChange={(e) => setTaxDenogPct(e.target.value)} placeholder="Porcentaje Ej. 10.5"
                      className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none mt-1" />
                  )}
                </div>

                {precioUsd && (
                  <div className="text-[11px] space-y-1 bg-[#0b0f19] rounded-lg p-2.5 border border-slate-800/80">
                    <div className="flex justify-between text-slate-500">
                      <span>Precio USD</span>
                      <span className="font-mono">${Number(precioUsd).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>+ Impuesto ({(taxPct * 100).toFixed(2)}%)</span>
                      <span className="font-mono">+${(Number(precioUsd) * taxPct).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>× Tipo de cambio</span>
                      <span className="font-mono">× {tipoCambio}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold border-t border-slate-700 pt-1.5">
                      <span>= Costo MXN</span>
                      <span className="font-mono text-amber-400">${costoMxn.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {editandoId && !precioUsd && costo && (
                  <div className="text-[11px] text-slate-500 bg-[#0b0f19] rounded-lg px-2.5 py-2 border border-slate-800/80">
                    Costo guardado: <span className="font-mono text-slate-300">${Number(costo).toFixed(2)} MXN</span> — ingresa Precio USD para recalcular
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Precio Venta MXN *</label>
                <input type="number" step="0.01" required value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} placeholder="Ej. 450" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                {precioVenta && costoMxn > 0 && (
                  <div className="flex gap-4 text-[11px] mt-1.5 px-1">
                    <span className={utilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      Utilidad: ${utilidad.toFixed(2)}
                    </span>
                    <span className={margen >= 20 ? 'text-emerald-400' : margen >= 0 ? 'text-amber-400' : 'text-red-400'}>
                      Margen: {margen.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Stock en Bodega (Piezas disponibles)</label>
                <input type="number" required value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ej. 3" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
              </div>

              <div className="pt-2 flex gap-2">
                <button type="submit" disabled={loading} className="w-full bg-[#c1553a] hover:bg-[#9b3f28] text-white font-bold py-3 rounded-xl transition-all uppercase tracking-wider shadow-md">
                  {loading ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Subir al Catálogo'}
                </button>
                {editandoId && (
                  <button type="button" onClick={limpiarFormulario} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 rounded-xl border border-slate-700">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* TABLA CON BUSCADOR DE ARTÍCULOS INTEGRADO */}
          <div className="lg:col-span-2 bg-[#161b26] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 overflow-hidden">
            
            {/* NUEVA BARRA DE BÚSQUEDA RÁPIDA */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                📋 Registro de Stock Vivo ({productosFiltrados.length} listados)
              </h2>
              <div className="w-full sm:w-64">
                <input 
                  type="text" 
                  placeholder="🔍 Filtrar por nombre, UPC o categoría..." 
                  value={filtroBusqueda}
                  onChange={(e) => setFiltroBusqueda(e.target.value)}
                  className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none placeholder-slate-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1f2635] text-slate-300 font-bold border-b border-slate-800">
                    <th className="p-3">Artículo / Código</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Costo</th>
                    <th className="p-3 text-right">Precio Venta</th>
                    <th className="p-3 text-center">Stock</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 bg-[#111520]">
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 font-medium">No se encontraron artículos con ese filtro de búsqueda.</td>
                    </tr>
                  ) : (
                    productosFiltrados.map((p) => (
                      <tr key={p.id} className={`hover:bg-slate-800/20 transition-colors ${!p.activo ? 'opacity-40' : ''}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {p.imagen_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-cover border border-slate-700 flex-none" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-[11px]">📦</div>
                            )}
                            <div>
                              <p className="font-bold text-slate-200 flex items-center gap-1.5">
                                {p.nombre}
                                {p.mostrar_en_mercadito && <span title="Visible en Mercadito" className="text-[9px] bg-[#4a1b0c]/50 text-[#dd8a6c] border border-[#6d2a19]/60 rounded px-1.5 py-0.5">🛍️ Mercadito</span>}
                              </p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{p.codigo_barras}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="bg-[#1e2533] px-2 py-0.5 rounded text-[10px] text-slate-300 border border-slate-700/60">{p.categoria}</span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">${Number(p.costo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-[#dd8a6c] font-bold">${Number(p.precio_venta).toFixed(2)}</td>
                        <td className="p-3 text-center font-mono">
                          <span className={`px-2 py-0.5 rounded font-black text-[11px] ${p.stock > 2 ? 'bg-slate-900 text-emerald-400' : p.stock > 0 ? 'bg-amber-950/60 text-amber-400' : 'bg-red-950 text-red-400'}`}>
                            {p.stock} u
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            <button onClick={() => iniciarEdicion(p)} className="bg-[#1e2533] hover:bg-[#c1553a] hover:text-white border border-slate-700 text-slate-300 px-2.5 py-1 rounded-md font-bold transition-all">
                              Editar
                            </button>
                            <button onClick={() => cambiarEstadoActivo(p.id, p.activo)} className={`px-2 py-1 rounded-md font-bold text-[11px] border transition-all ${p.activo ? 'bg-red-950/20 text-red-400 border-red-900/60 hover:bg-red-900/40' : 'bg-emerald-950/20 text-emerald-400 border-emerald-900/60 hover:bg-emerald-900/40'}`}>
                              {p.activo ? 'Pausar' : 'Activar'}
                            </button>
                            <button onClick={() => toggleMercadito(p.id, p.mostrar_en_mercadito)} title={p.mostrar_en_mercadito ? 'Quitar del Mercadito' : 'Mostrar en Mercadito'} className={`px-2 py-1 rounded-md font-bold text-[11px] border transition-all ${p.mostrar_en_mercadito ? 'bg-[#4a1b0c]/40 text-[#dd8a6c] border-[#9b3f28]/60 hover:bg-[#4a1b0c]/60' : 'bg-[#1e2533] text-slate-400 border-slate-700 hover:border-[#9b3f28]/60 hover:text-[#dd8a6c]'}`}>
                              🛍️ {p.mostrar_en_mercadito ? 'En Mercadito' : 'Mostrar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}