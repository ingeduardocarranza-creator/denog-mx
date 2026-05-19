'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function CatalogoTienda() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  // NUEVAS LISTAS Y BUSCADORES
  const [listaCategorias, setListaCategorias] = useState(['Ropa', 'Calzado', 'Comida / Snacks', 'Artículos de Hogar', 'Cuidado Personal']);
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [mostrarCreadorCat, setMostrarCreadorCat] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  // CAMPOS DEL FORMULARIO
  const [nombre, setNombre] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [costo, setCosto] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [stock, setStock] = useState('');
  const [categoria, setCategoria] = useState('Ropa');
  const [editandoId, setEditandoId] = useState(null);

  // 1. CARGAR DATOS DESDE SUPABASE Y EXTRAER CATEGORÍAS EXISTENTES
  const cargarProductosYCategorias = async () => {
    const { data, error } = await supabase
      .from('productos_tienda')
      .select('*')
      .order('id', { ascending: false });
    
    if (!error && data) {
      setProductos(data);
      
      // Recolectar las categorías que ya existan en la base de datos para que nunca se borren de la lista
      const catsExistentes = data.map(p => p.categoria).filter(Boolean);
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
      costo: Number(costo) || 0,
      precio_venta: Number(precioVenta) || 0,
      stock: Number(stock) || 0,
      categoria: categoria,
      activo: true
    };

    try {
      if (editandoId) {
        const { error } = await supabase
          .from('productos_tienda')
          .update(datosProducto)
          .eq('id', editandoId);

        if (error) throw error;
        setMensaje({ tipo: 'exito', texto: '¡Artículo actualizado correctamente!' });
      } else {
        const { error } = await supabase
          .from('productos_tienda')
          .insert([datosProducto]);

        if (error) throw error;
        setMensaje({ tipo: 'exito', texto: '¡Artículo registrado en el stock disponible!' });
      }

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
    setCosto(p.costo || '');
    setPrecioVenta(p.precio_venta || '');
    setStock(p.stock || '0');
    setCategoria(p.categoria || 'Ropa');
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Te sube al formulario de inmediato
  };

  const cambiarEstadoActivo = async (id, estadoActual) => {
    const { error } = await supabase
      .from('productos_tienda')
      .update({ activo: !estadoActual })
      .eq('id', id);

    if (!error) cargarProductosYCategorias();
  };

  const limpiarFormulario = () => {
    setEditandoId(null);
    setNombre('');
    setCodigoBarras('');
    setCosto('');
    setPrecioVenta('');
    setStock('');
    setCategoria(listaCategorias[0] || 'Ropa');
  };

  // 5. FILTRADO DINÁMICO MEDIANTE EL BUSCADOR DE LA TABLA
  const productosFiltrados = productos.filter(p => 
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
                  <button type="button" onClick={() => setMostrarCreadorCat(!mostrarCreadorCat)} className="text-[11px] text-blue-400 hover:underline font-bold">
                    {mostrarCreadorCat ? 'Cancelar' : '+ Nueva Categoría'}
                  </button>
                </div>

                {mostrarCreadorCat ? (
                  <div className="flex gap-2 p-2 bg-[#111520] rounded-xl border border-slate-800 animate-fadeIn">
                    <input type="text" placeholder="Nombre de categoría..." value={nuevaCategoriaInput} onChange={(e) => setNuevaCategoriaInput(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs" />
                    <button type="button" onClick={agregarCategoriaALista} className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg">Añadir</button>
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

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold">Costo en USA ($USD/MXN)</label>
                  <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Ej. 14.99" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold">Precio Venta MXN *</label>
                  <input type="number" step="0.01" required value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} placeholder="Ej. 450" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Stock en Bodega (Piezas disponibles)</label>
                <input type="number" required value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ej. 3" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
              </div>

              <div className="pt-2 flex gap-2">
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-wider shadow-md">
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
                          <p className="font-bold text-slate-200">{p.nombre}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{p.codigo_barras}</p>
                        </td>
                        <td className="p-3">
                          <span className="bg-[#1e2533] px-2 py-0.5 rounded text-[10px] text-slate-300 border border-slate-700/60">{p.categoria}</span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">${Number(p.costo).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-blue-400 font-bold">${Number(p.precio_venta).toFixed(2)}</td>
                        <td className="p-3 text-center font-mono">
                          <span className={`px-2 py-0.5 rounded font-black text-[11px] ${p.stock > 2 ? 'bg-slate-900 text-emerald-400' : p.stock > 0 ? 'bg-amber-950/60 text-amber-400' : 'bg-red-950 text-red-400'}`}>
                            {p.stock} u
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            <button onClick={() => iniciarEdicion(p)} className="bg-[#1e2533] hover:bg-blue-600 hover:text-white border border-slate-700 text-slate-300 px-2.5 py-1 rounded-md font-bold transition-all">
                              Editar
                            </button>
                            <button onClick={() => cambiarEstadoActivo(p.id, p.activo)} className={`px-2 py-1 rounded-md font-bold text-[11px] border transition-all ${p.activo ? 'bg-red-950/20 text-red-400 border-red-900/60 hover:bg-red-900/40' : 'bg-emerald-950/20 text-emerald-400 border-emerald-900/60 hover:bg-emerald-900/40'}`}>
                              {p.activo ? 'Pausar' : 'Activar'}
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