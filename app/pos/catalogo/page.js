'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const GALERIA_SLOTS = 2; // + foto principal = 3 fotos en total

export default function CatalogoColaborador() {
  const router = useRouter();
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const datos = localStorage.getItem('cliente');
    if (!datos) { router.push('/'); return; }
    setUsuario(JSON.parse(datos));
  }, []);

  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [listaCategorias, setListaCategorias] = useState(['Ropa', 'Calzado', 'Comida / Snacks', 'Artículos de Hogar', 'Cuidado Personal']);
  const [nuevaCategoriaInput, setNuevaCategoriaInput] = useState('');
  const [mostrarCreadorCat, setMostrarCreadorCat] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Ropa');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [galeria, setGaleria] = useState([]);
  const [subiendoSlot, setSubiendoSlot] = useState(null); // 'principal' | number | null
  const [editandoId, setEditandoId] = useState(null);
  const [editandoEraPendiente, setEditandoEraPendiente] = useState(false);

  const cargarProductos = async () => {
    const { data, error } = await supabase
      .from('productos_tienda')
      .select('id, nombre, categoria, codigo_barras, descripcion, imagen_url, galeria, pendiente_aprobacion')
      .order('id', { ascending: false });
    if (!error && data) {
      setProductos(data);
      const catsExistentes = data.map((p) => p.categoria).filter(Boolean);
      setListaCategorias((prev) => [...new Set([...prev, ...catsExistentes])]);
    }
  };

  useEffect(() => { cargarProductos(); }, []);

  const agregarCategoriaALista = (e) => {
    e.preventDefault();
    if (!nuevaCategoriaInput.trim()) return;
    const nuevaCat = nuevaCategoriaInput.trim();
    if (!listaCategorias.includes(nuevaCat)) setListaCategorias([...listaCategorias, nuevaCat]);
    setCategoria(nuevaCat);
    setNuevaCategoriaInput('');
    setMostrarCreadorCat(false);
  };

  const subirFoto = (slot) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: 'La foto pesa más de 15MB. Usa una más ligera.' });
      return;
    }
    setSubiendoSlot(slot);
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: file.type, carpeta: 'mercadito' }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo preparar la subida.');
      const { error: subeError } = await supabase.storage.from('productos').uploadToSignedUrl(datos.path, datos.token, file);
      if (subeError) throw subeError;
      if (slot === 'principal') setImagenUrl(datos.publicUrl);
      else setGaleria((g) => { const next = [...g]; next[slot] = datos.publicUrl; return next; });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error al subir la foto: ' + err.message });
    } finally {
      setSubiendoSlot(null);
    }
  };

  const quitarFotoGaleria = (idx) => setGaleria((g) => g.filter((_, i) => i !== idx));

  const limpiarFormulario = () => {
    setEditandoId(null);
    setEditandoEraPendiente(false);
    setNombre('');
    setCategoria(listaCategorias[0] || 'Ropa');
    setCodigoBarras('');
    setDescripcion('');
    setImagenUrl('');
    setGaleria([]);
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    // Solo estos campos — costo, precio, stock y "mostrar en Mercadito" los
    // completa/decide el admin al aprobar.
    const datosProducto = {
      nombre: nombre.trim(),
      categoria,
      codigo_barras: codigoBarras.trim() || `GEN-${Date.now().toString().slice(-8)}`,
      descripcion: descripcion.trim() || null,
      imagen_url: imagenUrl.trim() || null,
      galeria: galeria.filter(Boolean),
    };

    try {
      if (editandoId) {
        const { error } = await supabase.from('productos_tienda').update(datosProducto).eq('id', editandoId);
        if (error) throw error;
        setMensaje({ tipo: 'exito', texto: '¡Producto actualizado!' });
      } else {
        const { error } = await supabase.from('productos_tienda').insert([{
          ...datosProducto,
          costo: 0,
          precio_venta: 0,
          stock: 0,
          activo: false,
          pendiente_aprobacion: true,
          creado_por: usuario?.id || null,
        }]);
        if (error) throw error;
        setMensaje({ tipo: 'exito', texto: '¡Producto enviado! Un admin debe completar el precio y el stock antes de que aparezca en el catálogo.' });
      }
      limpiarFormulario();
      cargarProductos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const iniciarEdicion = (p) => {
    setEditandoId(p.id);
    setEditandoEraPendiente(!!p.pendiente_aprobacion);
    setNombre(p.nombre);
    setCategoria(p.categoria || 'Ropa');
    setCodigoBarras(p.codigo_barras || '');
    setDescripcion(p.descripcion || '');
    setImagenUrl(p.imagen_url || '');
    setGaleria(p.galeria || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const productosFiltrados = productos.filter((p) =>
    p.nombre?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    p.codigo_barras?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(filtroBusqueda.toLowerCase())
  );

  if (!usuario) return null;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">🏷️ Catálogo</h1>
          <p className="text-xs text-slate-400 mt-1">
            Puedes agregar productos nuevos y editar el título, categoría, código de barras, fotos y descripción. El costo, precio y stock los completa un admin antes de que el producto quede activo.
          </p>
        </div>

        {mensaje.texto && (
          <div className={`p-4 rounded-xl text-xs font-bold text-center border ${mensaje.tipo === 'exito' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900' : 'bg-red-950/40 text-red-400 border-red-900'}`}>
            {mensaje.texto}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulario */}
          <div className="bg-[#161b26] p-5 rounded-2xl border border-slate-800 h-fit space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
              {editandoId ? (editandoEraPendiente ? '📝 Editar (pendiente de aprobación)' : '📝 Editar producto') : '➕ Nuevo producto'}
            </h2>

            <form onSubmit={guardarProducto} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Título *</label>
                <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Taza Térmica Stanley 40oz Rosa" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none" />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 font-bold">Categoría</label>
                  <button type="button" onClick={() => setMostrarCreadorCat(!mostrarCreadorCat)} className="text-[11px] text-blue-400 hover:underline font-bold">
                    {mostrarCreadorCat ? 'Cancelar' : '+ Nueva categoría'}
                  </button>
                </div>
                {mostrarCreadorCat ? (
                  <div className="flex gap-2 p-2 bg-[#111520] rounded-xl border border-slate-800">
                    <input type="text" placeholder="Nombre de categoría…" value={nuevaCategoriaInput} onChange={(e) => setNuevaCategoriaInput(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs" />
                    <button type="button" onClick={agregarCategoriaALista} className="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-lg">Añadir</button>
                  </div>
                ) : (
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none">
                    {listaCategorias.map((cat, i) => <option key={i} value={cat}>{cat}</option>)}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Código de Barras <span className="text-[10px] text-slate-500">(UPC / Scan)</span></label>
                <input type="text" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Escanea el código de barras" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción del producto" rows={3} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none resize-none" />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Foto principal</label>
                <div className="flex items-center gap-3">
                  {imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagenUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-700 flex-none" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-xl">📦</div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <label className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl cursor-pointer transition-all">
                      {subiendoSlot === 'principal' ? 'Subiendo…' : imagenUrl ? '📷 Cambiar foto' : '📷 Tomar / subir foto'}
                      <input type="file" accept="image/*" onChange={subirFoto('principal')} disabled={subiendoSlot !== null} className="hidden" />
                    </label>
                    {imagenUrl && <button type="button" onClick={() => setImagenUrl('')} className="w-full text-center text-[11px] text-red-400 hover:underline">Quitar foto</button>}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Fotos adicionales <span className="text-[10px] text-slate-500">(hasta {GALERIA_SLOTS}, {GALERIA_SLOTS + 1} en total)</span></label>
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
                          {subiendoSlot === idx ? '…' : '+'}
                          <input type="file" accept="image/*" onChange={subirFoto(idx)} disabled={subiendoSlot !== null} className="hidden" />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-wider shadow-md">
                  {loading ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Enviar producto'}
                </button>
                {editandoId && (
                  <button type="button" onClick={limpiarFormulario} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 rounded-xl border border-slate-700">Cancelar</button>
                )}
              </div>
            </form>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2 bg-[#161b26] p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">📋 Catálogo ({productosFiltrados.length})</h2>
              <div className="w-full sm:w-64">
                <input type="text" placeholder="🔍 Filtrar por nombre, UPC o categoría…" value={filtroBusqueda} onChange={(e) => setFiltroBusqueda(e.target.value)} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none placeholder-slate-500" />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1f2635] text-slate-300 font-bold border-b border-slate-800">
                    <th className="p-3">Producto / Código</th>
                    <th className="p-3">Categoría</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 bg-[#111520]">
                  {productosFiltrados.length === 0 ? (
                    <tr><td colSpan="4" className="p-6 text-center text-slate-500 font-medium">No se encontraron artículos.</td></tr>
                  ) : productosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {p.imagen_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imagen_url} alt="" className="w-8 h-8 rounded object-cover border border-slate-700 flex-none" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-[11px]">📦</div>
                          )}
                          <div>
                            <p className="font-bold text-slate-200">{p.nombre}</p>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{p.codigo_barras}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3"><span className="bg-[#1e2533] px-2 py-0.5 rounded text-[10px] text-slate-300 border border-slate-700/60">{p.categoria}</span></td>
                      <td className="p-3 text-center">
                        {p.pendiente_aprobacion ? (
                          <span className="bg-amber-950/40 text-amber-400 border border-amber-900 px-2 py-0.5 rounded-full text-[10px] font-bold">🕓 Por aprobar</span>
                        ) : (
                          <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded-full text-[10px] font-bold">✅ Activo</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => iniciarEdicion(p)} className="bg-[#1e2533] hover:bg-blue-600 hover:text-white border border-slate-700 text-slate-300 px-2.5 py-1 rounded-md font-bold transition-all">
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
