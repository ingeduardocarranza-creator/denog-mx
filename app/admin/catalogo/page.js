'use client';

import { useState, useEffect } from 'react';

// Sin decimales cuando el precio es entero; con centavos sólo si los hay.
const fmtMx = (n) => {
  const v = Number(n || 0)
  const centavos = Math.abs(v % 1) > 0.004
  return `$${v.toLocaleString('es-MX', { minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: 2 })}`
}

export default function CatalogoTienda() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  // NUEVAS LISTAS Y BUSCADORES
  const [listaCategorias, setListaCategorias] = useState(['Ropa', 'Calzado', 'Comida / Snacks', 'Artículos de Hogar', 'Cuidado Personal']);
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [mostrarCreadorCat, setMostrarCreadorCat] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  // El formulario deja de ocupar media pantalla: se abre cuando se pide.
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroExistencia, setFiltroExistencia] = useState('todas');
  const [filtroFoto, setFiltroFoto] = useState('todas');
  const [filtroMercadito, setFiltroMercadito] = useState('todos');
  const [filtroCosto, setFiltroCosto] = useState('todos');

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
    setMostrarForm(true);
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
  const activos = productos.filter(p => !p.pendiente_aprobacion);

  const productosFiltrados = activos.filter(p => {
    const q = filtroBusqueda.toLowerCase();
    if (q && !(p.nombre?.toLowerCase().includes(q) || p.codigo_barras?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q))) return false;
    if (filtroCategoria !== 'todas' && p.categoria !== filtroCategoria) return false;
    if (filtroExistencia === 'con' && !(p.stock > 0)) return false;
    if (filtroExistencia === 'agotados' && p.stock > 0) return false;
    if (filtroExistencia === 'poco' && !(p.stock > 0 && p.stock <= 2)) return false;
    if (filtroFoto === 'sin' && p.imagen_url) return false;
    if (filtroFoto === 'con' && !p.imagen_url) return false;
    if (filtroMercadito === 'si' && !p.mostrar_en_mercadito) return false;
    if (filtroMercadito === 'no' && p.mostrar_en_mercadito) return false;
    if (filtroCosto === 'sin' && p.costo) return false;
    return true;
  });

  // Indicadores. Los de dinero informan; los de pendientes son una lista de
  // tareas — por eso son botones que filtran la tabla, no sólo números.
  const margenDe = (p) => (p.precio_venta > 0 ? ((p.precio_venta - (p.costo || 0)) / p.precio_venta) * 100 : 0);
  const piezas = activos.reduce((n, p) => n + (Number(p.stock) || 0), 0);
  const valorCosto = activos.reduce((n, p) => n + (Number(p.costo) || 0) * (Number(p.stock) || 0), 0);
  const valorVenta = activos.reduce((n, p) => n + (Number(p.precio_venta) || 0) * (Number(p.stock) || 0), 0);
  const conPrecio = activos.filter(p => p.precio_venta > 0);
  const margenProm = conPrecio.length ? conPrecio.reduce((n, p) => n + margenDe(p), 0) / conPrecio.length : 0;
  const sinFoto = activos.filter(p => !p.imagen_url).length;
  const sinCosto = activos.filter(p => !p.costo).length;
  const agotados = activos.filter(p => !(p.stock > 0)).length;
  const enMercadito = activos.filter(p => p.mostrar_en_mercadito).length;

  const limpiarFiltros = () => {
    setFiltroBusqueda(''); setFiltroCategoria('todas');
    setFiltroExistencia('todas'); setFiltroFoto('todas'); setFiltroMercadito('todos'); setFiltroCosto('todos');
  };
  const hayFiltro = filtroBusqueda || filtroCategoria !== 'todas' || filtroExistencia !== 'todas' || filtroFoto !== 'todas' || filtroMercadito !== 'todos' || filtroCosto !== 'todos';

  const campo = {
    background: 'var(--w03)', border: '1px solid var(--w10)', borderRadius: 10,
    padding: '9px 11px', color: 'var(--tinta)', fontSize: 12.5, outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }} className="space-y-5">
        
        {/* ENCABEZADO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <div>
            <h1 style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Catálogo</h1>
            <p style={{ color: 'var(--w40)', fontSize: 12.5, marginTop: 3 }}>
              {activos.length} artículos · {enMercadito} a la venta en el Mercadito
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { limpiarFormulario(); setMostrarForm(true); }}
              style={{ background: 'var(--marca)', border: 'none', borderRadius: 11, padding: '11px 18px', color: 'var(--sup)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Agregar artículo
            </button>
          </div>
        </div>

        {/* ── Indicadores ───────────────────────────────────────────────
            Arriba el dinero, que informa. Abajo los pendientes, que son
            tareas: cada uno filtra la tabla a los artículos del problema. */}
        <div className="cifras-catalogo" style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { et: 'Piezas', v: piezas.toLocaleString('es-MX') },
            { et: 'Valor a costo', v: fmtMx(valorCosto) },
            { et: 'A precio venta', v: fmtMx(valorVenta), tono: 'var(--verde)' },
            { et: 'Margen promedio', v: `${margenProm.toFixed(0)}%`, tono: margenProm >= 40 ? 'var(--verde)' : margenProm >= 20 ? 'var(--ambar)' : 'var(--rojo-t)' },
          ].map((m, i) => (
            <div key={i}>
              <div style={{ color: 'var(--w32)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{m.et}</div>
              <div className="monto" style={{ color: m.tono || 'var(--tinta)', fontSize: 20, fontWeight: 800, marginTop: 5, letterSpacing: -0.5 }}>{m.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { et: 'sin foto', n: sinFoto, on: filtroFoto === 'sin', click: () => { limpiarFiltros(); setFiltroFoto('sin') } },
            { et: 'sin costo capturado', n: sinCosto, on: filtroCosto === 'sin', click: () => { limpiarFiltros(); setFiltroCosto('sin') } },
            { et: 'agotados', n: agotados, on: filtroExistencia === 'agotados', click: () => { limpiarFiltros(); setFiltroExistencia('agotados') } },
          ].filter(x => x.n > 0).map((x, i) => (
            <button key={i} onClick={x.click}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                background: x.on ? 'var(--ambar-suave)' : 'transparent',
                border: `1px solid ${x.on ? 'var(--ambar-borde)' : 'var(--w10)'}`,
                borderRadius: 20, padding: '6px 13px', fontSize: 12, color: 'var(--w55)',
              }}>
              <span className="monto" style={{ color: 'var(--ambar)', fontWeight: 800 }}>{x.n}</span> {x.et}
            </button>
          ))}
        </div>

        <div style={{ display: 'none' }}>
          <p className="text-xs text-slate-400 mt-1">Alta de saldos, ropa de liquidación, snacks y artículos importados listos para entrega inmediata</p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-xl text-xs font-bold text-center border ${mensaje.tipo === 'exito' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900' : 'bg-red-950/40 text-red-400 border-red-900'}`}>
            {mensaje.texto}
          </div>
        )}

        {/* POR APROBAR — productos que agregaron/editaron colaboradores, les falta costo/precio/stock */}
        {productosPendientes.length > 0 && (
          <div style={{ background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', borderRadius: 16, padding: 18 }} className="space-y-3">
            <h2 className="flex items-center gap-2" style={{ color: 'var(--ambar)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 }}>
              🕓 Por aprobar ({productosPendientes.length})
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--w50)' }}>Agregados por colaboradores — falta capturar costo, precio de venta y stock antes de que aparezcan en el catálogo.</p>
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
                  <button onClick={() => iniciarEdicion(p)} className="flex-none bg-amber-600 hover:bg-amber-500 sobre-color px-3 py-1.5 rounded-lg font-bold text-[11px]">
                    Completar y aprobar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

          
          {/* TABLA CON BUSCADOR DE ARTÍCULOS INTEGRADO */}
          <div style={{ background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 18, padding: 18 }} className="space-y-4 overflow-hidden">
            
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Buscar por nombre, código o categoría…"
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                style={{ ...campo, flex: '1 1 240px' }}
              />
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={campo}>
                <option value="todas">Categoría: todas</option>
                {listaCategorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroExistencia} onChange={e => setFiltroExistencia(e.target.value)} style={campo}>
                <option value="todas">Existencia: toda</option>
                <option value="con">Con existencia</option>
                <option value="poco">Queda poco (1-2)</option>
                <option value="agotados">Agotados</option>
              </select>
              <select value={filtroFoto} onChange={e => setFiltroFoto(e.target.value)} style={campo}>
                <option value="todas">Foto: todas</option>
                <option value="con">Con foto</option>
                <option value="sin">Sin foto</option>
              </select>
              <select value={filtroMercadito} onChange={e => setFiltroMercadito(e.target.value)} style={campo}>
                <option value="todos">Mercadito: todos</option>
                <option value="si">En el Mercadito</option>
                <option value="no">Fuera del Mercadito</option>
              </select>
              {hayFiltro && (
                <button onClick={limpiarFiltros} style={{ ...campo, cursor: 'pointer', color: 'var(--marca-t)', fontWeight: 700 }}>
                  Quitar filtros
                </button>
              )}
            </div>

            <div style={{ color: 'var(--w40)', fontSize: 11.5 }}>
              {productosFiltrados.length === activos.length
                ? `${activos.length} artículos en catálogo`
                : `${productosFiltrados.length} de ${activos.length} artículos`}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left border-collapse text-xs" style={{ minWidth: 880 }}>
                <thead>
                  <tr className="bg-[#1f2635] text-slate-300 font-bold border-b border-slate-800">
                    <th className="p-3">Artículo / Código</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-right">Costo</th>
                    <th className="p-3 text-right">Precio Venta</th>
                    <th className="p-3 text-right">Margen</th>
                    <th className="p-3 text-center">Stock</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 bg-[#111520]">
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-6 text-center" style={{ color: 'var(--w38)' }}>Ningún artículo coincide con estos filtros.</td>
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
                              <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--w40)' }}>{p.codigo_barras}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] whitespace-nowrap" style={{ background: 'var(--w04)', border: '1px solid var(--w10)', color: 'var(--w60)' }}>{p.categoria}</span>
                        </td>
                        <td className="p-3 text-right" style={{ color: 'var(--w50)' }}>{fmtMx(p.costo)}</td>
                        <td className="p-3 text-right font-bold" style={{ color: 'var(--marca-t)' }}>{fmtMx(p.precio_venta)}</td>
                        <td className="p-3 text-right font-bold" style={{
                          color: !p.costo || !p.precio_venta ? 'var(--w30)'
                            : margenDe(p) >= 40 ? 'var(--verde)'
                            : margenDe(p) >= 20 ? 'var(--ambar)' : 'var(--rojo-t)',
                        }}>
                          {!p.costo || !p.precio_venta ? '—' : `${margenDe(p).toFixed(0)}%`}
                        </td>
                        <td className="p-3 text-center">
                          {/* Verde hay, ámbar queda poco, rojo se acabó. Con
                              etiqueta ("u"), nunca sólo el color. */}
                          <span className="px-2 py-1 rounded-md font-extrabold text-[11px] whitespace-nowrap" style={{
                            background: p.stock > 2 ? 'var(--verde-suave)' : p.stock > 0 ? 'var(--ambar-suave)' : 'rgba(var(--rojo-rgb),0.10)',
                            border: `1px solid ${p.stock > 2 ? 'var(--verde-borde)' : p.stock > 0 ? 'var(--ambar-borde)' : 'rgba(var(--rojo-rgb),0.28)'}`,
                            color: p.stock > 2 ? 'var(--verde)' : p.stock > 0 ? 'var(--ambar)' : 'var(--rojo-t)',
                          }}>
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
                            <button onClick={() => toggleMercadito(p.id, p.mostrar_en_mercadito)} title={p.mostrar_en_mercadito ? 'Quitar del Mercadito' : 'Mostrar en Mercadito'} className="px-2 py-1 rounded-md font-bold text-[11px] border transition-all whitespace-nowrap"
                              style={p.mostrar_en_mercadito
                                ? { background: 'var(--marca)', color: 'var(--sup)', borderColor: 'var(--marca)' }
                                : { background: 'transparent', color: 'var(--w45)', borderColor: 'var(--w12)' }}>
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

        {/* ── Panel de captura ──────────────────────────────────────────
            Se abre encima de la lista en vez de partir la pantalla en dos:
            capturas concentrado y al cerrar el catálogo vuelve entero. */}
        {mostrarForm && (
          <div onClick={() => { setMostrarForm(false); limpiarFormulario(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,0.35)', backdropFilter: 'blur(2px)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(560px, 100%)', height: '100%', background: 'var(--sup)', borderLeft: '1px solid var(--w10)', boxShadow: '-20px 0 60px rgba(42,33,24,0.18)', overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, position: 'sticky', top: -20, background: 'var(--sup)', paddingTop: 20, marginTop: -20, zIndex: 2, borderBottom: '1px solid var(--w06)', paddingBottom: 12 }}>
                <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 800 }}>
                  {editandoId ? 'Editar artículo' : 'Nuevo artículo'}
                </div>
                <button onClick={() => { setMostrarForm(false); limpiarFormulario(); }}
                  style={{ background: 'transparent', border: '1px solid var(--w12)', borderRadius: 9, padding: '6px 12px', color: 'var(--w50)', fontSize: 12, cursor: 'pointer' }}>
                  Cerrar
                </button>
              </div>
          {/* FORMULARIO DE CAPTURA CON EJEMPLOS DE ARTÍCULOS AMERICANOS */}
          <div className="space-y-4">
            
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
                    <button type="button" onClick={agregarCategoriaALista} className="bg-[#c1553a] sobre-color font-bold px-3 py-1.5 rounded-lg">Añadir</button>
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
                    <label className="block w-full text-center bg-[#c1553a] hover:bg-[#9b3f28] sobre-color font-bold py-2.5 rounded-xl cursor-pointer transition-all">
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
                            <button type="button" onClick={() => quitarFotoGaleria(idx)} className="absolute -top-1.5 -right-1.5 bg-red-600 sobre-color rounded-full w-4 h-4 text-[9px] leading-none">✕</button>
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
                <button type="submit" disabled={loading} className="w-full bg-[#c1553a] hover:bg-[#9b3f28] sobre-color font-bold py-3 rounded-xl transition-all uppercase tracking-wider shadow-md">
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
            </div>
          </div>
        )}

      </div>
    </div>
  );
}