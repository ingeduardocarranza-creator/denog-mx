'use client';

import React, { useState, useEffect, useRef } from 'react';
import { tituloDe, nombreCompleto } from '@/lib/mercadito/variantes';

// Celda numérica editable directo en la tabla. Se ve como un recuadro
// punteado; al salir (Tab, Enter o clic fuera) guarda si el valor cambió.
// Escape cancela y deja el valor que había.
function CeldaNum({ valor, onGuardar, prefijo = '$', ancho = 62, entero = false, etiqueta }) {
  const [txt, setTxt] = useState(String(valor ?? ''));
  const [foco, setFoco] = useState(false);
  const cancelar = useRef(false);
  useEffect(() => { if (!foco) setTxt(String(valor ?? '')); }, [valor, foco]);

  const confirmar = () => {
    setFoco(false);
    if (cancelar.current) { cancelar.current = false; setTxt(String(valor ?? '')); return; }
    const n = Number(txt);
    if (txt.trim() === '' || Number.isNaN(n) || n < 0) { setTxt(String(valor ?? '')); return; }
    const limpio = entero ? Math.round(n) : Math.round(n * 100) / 100;
    if (limpio !== Number(valor || 0)) onGuardar(limpio);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px dashed var(--w20)', borderRadius: 6, padding: '2px 6px', background: foco ? 'var(--w06)' : 'var(--w03)' }}>
      {prefijo && <span style={{ color: 'var(--w40)' }}>{prefijo}</span>}
      <input type="number" inputMode="decimal" step={entero ? 1 : 0.01} min="0" value={txt} aria-label={etiqueta}
        onFocus={e => { setFoco(true); e.target.select(); }}
        onChange={e => setTxt(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') { cancelar.current = true; e.target.blur(); }
        }}
        style={{ width: ancho, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 'inherit', textAlign: 'right', fontWeight: 'inherit' }} />
    </span>
  );
}

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

  // ORDEN, SELECCIÓN EN LOTE Y MENÚ DE ACCIONES
  const [orden, setOrden] = useState({ campo: null, dir: 'asc' });
  const [seleccion, setSeleccion] = useState([]);
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [categoriaLote, setCategoriaLote] = useState('');

  // VARIANTES: cada variante es un artículo con su propio costo, precio y stock
  // (ver lib/mercadito/variantes.js). Estos campos solo los usa el panel.
  const [variante, setVariante] = useState('');
  const [grupoId, setGrupoId] = useState(null);            // id de la cabeza cuando se captura una variante
  const [cabezaSinEtiqueta, setCabezaSinEtiqueta] = useState(false);
  const [etiquetaCabeza, setEtiquetaCabeza] = useState('');
  const [cerrados, setCerrados] = useState({});             // grupos contraídos en la tabla
  const [agrupar, setAgrupar] = useState(null);             // ventana "Agrupar como variantes"
  const [seleccionPend, setSeleccionPend] = useState([]);   // Por aprobar: artículos marcados
  const [cap, setCap] = useState({ nombre: '', codigo: '', precio: '', stock: '' }); // captura rápida
  const [capGuardando, setCapGuardando] = useState(false);
  const [catsAbierto, setCatsAbierto] = useState(false);    // administrador de categorías
  const [catEdit, setCatEdit] = useState(null);             // { viejo, nuevo }
  const [hist, setHist] = useState(null);                   // historial del artículo en edición

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
  const [videoUrl, setVideoUrl] = useState('');
  const [subiendoVideo, setSubiendoVideo] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  // Mercadito: mismos productos, con datos extra opcionales para publicarlos
  // en la tienda pública en línea.
  const [mostrarEnMercadito, setMostrarEnMercadito] = useState(true); // los nuevos salen en el Mercadito
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

  // SUBIR VIDEO CORTO (para la pantalla de la tienda). Misma ruta que las fotos:
  // el archivo va directo del navegador a Supabase Storage.
  const subirVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['video/mp4', 'video/webm'].includes(file.type)) {
      setMensaje({ tipo: 'error', texto: 'El video debe ser MP4 o WEBM. Si es de iPhone, expórtalo como MP4 (CapCut o Fotos lo hacen).' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: 'El video pesa más de 50MB. Usa uno más corto o más ligero (10 a 20 segundos).' });
      return;
    }
    setSubiendoVideo(true);
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: file.type, carpeta: 'videos' }),
      });
      const datos = await res.json();
      if (!datos.ok) throw new Error(datos.mensaje || 'No se pudo preparar la subida.');
      const formData = new FormData();
      formData.append('', file, file.name);
      const subeRes = await fetch(datos.signedUrl, { method: 'PUT', body: formData });
      if (!subeRes.ok) throw new Error('Error al subir el video al servidor.');
      setVideoUrl(datos.publicUrl);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error al subir el video: ' + err.message });
    } finally {
      setSubiendoVideo(false);
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
      let ocultas = [];
      try { ocultas = JSON.parse(localStorage.getItem('cat_ocultas') || '[]'); } catch {}
      setListaCategorias(prev => [...new Set([...prev, ...catsExistentes])].filter(c => catsExistentes.includes(c) || !ocultas.includes(c)));
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
    if (codigoRepetido && !confirm(`El código ${codigoBarras.trim()} ya lo tiene "${codigoRepetido.nombre}". ¿Guardar de todos modos?`)) return;
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    const codigoFinal = codigoBarras.trim() || `GEN-${Date.now().toString().slice(-8)}`;

    const titulo = nombre.trim();
    const etiqueta = variante.trim();
    if (grupoId && !etiqueta) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de la variante (ej. Talla M · Azul).' });
      setLoading(false);
      return;
    }
    if (cabezaSinEtiqueta && !etiquetaCabeza.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe cómo se llama el artículo que ya tienes (ej. Talla S).' });
      setLoading(false);
      return;
    }

    const datosProducto = {
      nombre: nombreCompleto(titulo, etiqueta),
      variante: etiqueta || null,
      codigo_barras: codigoFinal,
      costo: costoMxn,
      costo_usd: precioUsd ? Number(precioUsd) : null,
      costo_tipo_cambio: precioUsd ? Number(tipoCambio) : null,
      costo_impuesto_pct: precioUsd ? Math.round(taxPct * 10000) / 100 : null,
      precio_venta: Number(precioVenta) || 0,
      stock: Number(stock) || 0,
      categoria: categoria,
      imagen_url: imagenUrl.trim() || null,
      video_url: videoUrl.trim() || null,
      activo: true,
      mostrar_en_mercadito: mostrarEnMercadito,
      // La descripción y las fotos extra son del grupo, no de cada variante.
      descripcion: grupoId ? null : (descripcion.trim() || null),
      galeria: grupoId ? [] : galeria.filter(Boolean),
      pendiente_aprobacion: false, // cualquier guardado del admin lo aprueba
    };
    if (!editandoId && grupoId) datosProducto.grupo_id = grupoId;

    const patch = (id, cambios) => fetch('/api/admin/catalogo', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...cambios }),
    }).then(r => r.json());

    try {
      // Primera variante de un artículo suelto: ese artículo también necesita su etiqueta.
      if (cabezaSinEtiqueta && grupoId) {
        const cabeza = productos.find(x => x.id === grupoId);
        const r0 = await patch(grupoId, { variante: etiquetaCabeza.trim(), nombre: nombreCompleto(cabeza.nombre, etiquetaCabeza) });
        if (!r0.ok) throw new Error(r0.mensaje || 'No se pudo actualizar el artículo original');
      }

      const res = await fetch('/api/admin/catalogo', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editandoId ? { id: editandoId, ...datosProducto } : datosProducto),
      }).then(r => r.json());

      if (!res.ok) throw new Error(res.mensaje || 'Error al guardar');

      // Si se cambió el título de la cabeza, el resto del grupo se renombra igual.
      if (editandoId && !grupoId) {
        for (const h of productos.filter(x => x.grupo_id === editandoId)) {
          const nuevoNombre = nombreCompleto(titulo, h.variante);
          if (nuevoNombre !== h.nombre) await patch(h.id, { nombre: nuevoNombre });
        }
      }

      setMensaje({ tipo: 'exito', texto: editandoId ? '¡Artículo actualizado correctamente!' : grupoId ? '¡Variante agregada!' : '¡Artículo registrado en el stock disponible!' });
      limpiarFormulario();
      setMostrarForm(false);
      cargarProductosYCategorias();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // 4. PREPARAR EDICIÓN
  // Deja el cotizador como estaba cuando se calculó el costo de `p`.
  const cargarCotizador = (p) => {
    if (p.costo_usd != null) {
    // Impuesto y tipo de cambio con los que se calculó el costo.
    const pct = p.costo_impuesto_pct != null ? Number(p.costo_impuesto_pct) : 8.6;
    if (Math.abs(pct - 8.6) < 0.001) setTipoTax('arizona');
    else if (Math.abs(pct - 7.75) < 0.001) setTipoTax('california');
    else { setTipoTax('denog'); setTaxDenogPct(String(pct)); }
    if (p.costo_tipo_cambio != null) setTipoCambio(String(p.costo_tipo_cambio));
    else if (Number(p.costo) > 0 && Number(p.costo_usd) > 0) {
      // Artículos viejos sin tipo de cambio guardado: se deduce del costo que ya tienen.
      setTipoCambio((Number(p.costo) / (Number(p.costo_usd) * (1 + pct / 100))).toFixed(2));
    }
  }
  };

  const iniciarEdicion = (p) => {
    setMostrarForm(true);
    setEditandoId(p.id);
    setNombre(tituloDe(p));
    setVariante(p.variante || '');
    setGrupoId(p.grupo_id || null);
    setCabezaSinEtiqueta(false);
    setEtiquetaCabeza('');
    setCodigoBarras(p.codigo_barras || '');
    setPrecioUsd(p.costo_usd != null ? String(p.costo_usd) : '');
    cargarCotizador(p);
    setCosto(p.costo || '');
    setPrecioVenta(p.precio_venta || '');
    setStock(p.stock || '0');
    setCategoria(p.categoria || 'Ropa');
    setImagenUrl(p.imagen_url || '');
    setVideoUrl(p.video_url || '');
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

  // Guarda un cambio suelto (precio, costo, stock…) sin abrir el panel. Se ve
  // al instante y, si el servidor lo rechaza, se recarga lo que de verdad hay.
  const patchProducto = async (id, cambios) => {
    setProductos(prev => prev.map(p => (p.id === id ? { ...p, ...cambios } : p)));
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...cambios }),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo guardar');
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se guardó el cambio: ' + err.message });
      cargarProductosYCategorias();
    }
  };

  const ajustarStock = (p, delta) => {
    const nuevo = Math.max(0, (Number(p.stock) || 0) + delta);
    if (nuevo !== Number(p.stock)) patchProducto(p.id, { stock: nuevo });
  };

  // Acciones sobre los artículos seleccionados (pausar, Mercadito, categoría).
  const accionLote = async (cambios, textoOk) => {
    if (seleccion.length === 0) return;
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: seleccion, ...cambios }),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo aplicar');
      setMensaje({ tipo: 'exito', texto: `${textoOk} (${res.cambiados} artículo${res.cambiados === 1 ? '' : 's'}).` });
      setSeleccion([]);
      setCategoriaLote('');
      cargarProductosYCategorias();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    }
  };

  // Eliminar uno o varios. El servidor se niega a borrar los que ya tienen
  // ventas, reseñas o conteos de inventario y los reporta; para esos, Pausar.
  const eliminarProductos = async (lista) => {
    if (lista.length === 0) return;
    const aviso = lista.length === 1
      ? `¿Eliminar "${lista[0].nombre}"? Se borra por completo y no se puede deshacer.`
      : `¿Eliminar ${lista.length} artículos? Se borran por completo y no se puede deshacer.`;
    if (!confirm(aviso)) return;
    setMensaje({ tipo: '', texto: '' });
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: lista.map(p => p.id) }),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo eliminar');
      const omitidos = res.omitidos || [];
      const conVariantes = res.omitidosVariantes || [];
      if (omitidos.length > 0 || conVariantes.length > 0) {
        const partes = [];
        if (omitidos.length > 0) partes.push(`No se borró: ${omitidos.join(', ')} — ya tiene ventas, reseñas o conteos. Mejor pausa ese artículo.`);
        if (conVariantes.length > 0) partes.push(`No se borró: ${conVariantes.join(', ')} — tiene variantes. Elimina o saca primero sus variantes.`);
        setMensaje({
          tipo: res.eliminados > 0 ? 'exito' : 'error',
          texto: `${res.eliminados} eliminado${res.eliminados === 1 ? '' : 's'}. ${partes.join(' ')}`,
        });
      } else {
        setMensaje({ tipo: 'exito', texto: res.eliminados === 1 ? 'Artículo eliminado.' : `${res.eliminados} artículos eliminados.` });
      }
      setSeleccion(s => s.filter(id => !lista.some(p => p.id === id)));
      cargarProductosYCategorias();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    }
  };

  // Duplicar: copia con stock en 0, pausada y con código nuevo (el código de
  // barras no se puede repetir a propósito); se abre el panel para ajustarla.
  const duplicarProducto = async (p) => {
    setMensaje({ tipo: '', texto: '' });
    const copia = {
      nombre: `${p.nombre} (copia)`,
      codigo_barras: `GEN-${Date.now().toString().slice(-8)}`,
      costo: Number(p.costo) || 0,
      precio_venta: Number(p.precio_venta) || 0,
      stock: 0,
      categoria: p.categoria,
      imagen_url: p.imagen_url || null,
      activo: false,
      mostrar_en_mercadito: false,
      descripcion: p.descripcion || null,
      galeria: p.galeria || [],
      costo_usd: p.costo_usd ?? null,
      costo_tipo_cambio: p.costo_tipo_cambio ?? null,
      costo_impuesto_pct: p.costo_impuesto_pct ?? null,
      pendiente_aprobacion: false,
    };
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copia),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo duplicar');
      await cargarProductosYCategorias();
      iniciarEdicion({ ...copia, id: res.id });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    }
  };

  const alternarSeleccion = (id) => setSeleccion(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const ordenarPor = (campo) => setOrden(o => (o.campo === campo
    ? (o.dir === 'asc' ? { campo, dir: 'desc' } : { campo: null, dir: 'asc' })
    : { campo, dir: 'asc' }));

  // ── Por aprobar: captura rápida y aprobación en lote ──────────────────────
  const capturaRapida = async (e) => {
    e.preventDefault();
    if (!cap.nombre.trim()) { setMensaje({ tipo: 'error', texto: 'Escribe el nombre del artículo.' }); return; }
    setCapGuardando(true);
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: cap.nombre.trim(),
          codigo_barras: cap.codigo.trim() || `GEN-${Date.now().toString().slice(-8)}`,
          precio_venta: Number(cap.precio) || 0,
          costo: 0,
          stock: Number(cap.stock) || 0,
          categoria: filtroCategoria !== 'todas' ? filtroCategoria : (listaCategorias[0] || 'Ropa'),
          activo: true,
          mostrar_en_mercadito: false,
          pendiente_aprobacion: true,
        }),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo agregar');
      setCap({ nombre: '', codigo: '', precio: '', stock: '' });
      setMensaje({ tipo: 'exito', texto: 'Agregado a Por aprobar.' });
      cargarProductosYCategorias();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error: ' + err.message });
    } finally {
      setCapGuardando(false);
    }
  };

  const aprobarPendientes = async (soloEstos) => {
    const lista = soloEstos || productos.filter(p => p.pendiente_aprobacion && seleccionPend.includes(p.id));
    if (lista.length === 0) return;
    const sinPrecio = lista.filter(p => !(Number(p.precio_venta) > 0));
    if (sinPrecio.length > 0) {
      setMensaje({ tipo: 'error', texto: `Falta el precio de venta de: ${sinPrecio.map(p => p.nombre).join(', ')}` });
      return;
    }
    const res = await fetch('/api/admin/catalogo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: lista.map(p => p.id), pendiente_aprobacion: false }),
    }).then(r => r.json());
    if (!res.ok) { setMensaje({ tipo: 'error', texto: res.mensaje || 'No se pudo aprobar' }); return; }
    setSeleccionPend([]);
    setMensaje({ tipo: 'exito', texto: `${lista.length} artículo${lista.length === 1 ? '' : 's'} aprobado${lista.length === 1 ? '' : 's'}.` });
    cargarProductosYCategorias();
  };

  // ── Categorías: renombrar, fusionar, quitar las vacías ────────────────────
  const conteoCat = (c) => productos.filter(p => p.categoria === c).length;

  const renombrarCategoria = async () => {
    const viejo = catEdit.viejo;
    const nuevo = catEdit.nuevo.trim();
    if (!nuevo || nuevo === viejo) { setCatEdit(null); return; }
    const existe = listaCategorias.includes(nuevo);
    const ids = productos.filter(p => p.categoria === viejo).map(p => p.id);
    if (ids.length > 0) {
      const aviso = existe
        ? `Ya existe «${nuevo}». ¿Pasar los ${ids.length} artículos de «${viejo}» a «${nuevo}»?`
        : `¿Renombrar «${viejo}» a «${nuevo}» en ${ids.length} artículo${ids.length === 1 ? '' : 's'}?`;
      if (!confirm(aviso)) return;
      const res = await fetch('/api/admin/catalogo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, categoria: nuevo }),
      }).then(r => r.json());
      if (!res.ok) { setMensaje({ tipo: 'error', texto: res.mensaje || 'No se pudo cambiar la categoría' }); return; }
    }
    setListaCategorias(l => [...new Set(l.map(c => (c === viejo ? nuevo : c)))]);
    if (filtroCategoria === viejo) setFiltroCategoria('todas');
    if (categoria === viejo) setCategoria(nuevo);
    setCatEdit(null);
    setMensaje({ tipo: 'exito', texto: existe ? `«${viejo}» se fusionó con «${nuevo}».` : `«${viejo}» ahora se llama «${nuevo}».` });
    cargarProductosYCategorias();
  };

  const quitarCategoriaVacia = (c) => {
    if (conteoCat(c) > 0) return;
    setListaCategorias(l => l.filter(x => x !== c));
    try {
      const ocultas = JSON.parse(localStorage.getItem('cat_ocultas') || '[]');
      localStorage.setItem('cat_ocultas', JSON.stringify([...new Set([...ocultas, c])]));
    } catch {}
  };

  // ── Historial de un artículo (lo que ya guarda la bitácora) ───────────────
  const ETIQUETAS_HIST = {
    stock: 'Stock', costo: 'Costo', precio_venta: 'Precio', activo: 'Activo', mostrar_en_mercadito: 'En Mercadito',
    nombre: 'Nombre', categoria: 'Categoría', codigo_barras: 'Código', imagen_url: 'Foto', descripcion: 'Descripción',
    galeria: 'Fotos extra', pendiente_aprobacion: 'Por aprobar', costo_usd: 'Costo USD', grupo_id: 'Grupo', variante: 'Variante',
  };
  const verHist = (campo, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    if (['imagen_url', 'descripcion', 'galeria'].includes(campo)) return 'actualizado';
    if (['costo', 'precio_venta', 'costo_usd'].includes(campo)) return `$${Number(v).toFixed(2)}`;
    return String(v);
  };
  const fechaHist = (s) => {
    // La bitácora ya guarda la hora local de Hermosillo: se muestra tal cual.
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    if (!m) return '';
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${Number(m[3])} ${meses[Number(m[2]) - 1]} ${m[4]}`;
  };
  const abrirHistorial = async (id) => {
    if (hist) { setHist(null); return; }
    setHist({ cargando: true, items: [] });
    const res = await fetch(`/api/admin/catalogo?historial=${id}`).then(r => r.json()).catch(() => ({ ok: false }));
    setHist(res.ok ? { cargando: false, items: res.items } : { cargando: false, items: [], error: res.mensaje || 'No se pudo cargar el historial' });
  };

  // Nueva variante de un artículo: abre el panel con costo, precio y foto ya
  // copiados de `base` (la cabeza o la variante que se quiere parecer); lo único
  // que hay que escribir es cómo se llama y cuántas piezas hay.
  const iniciarVariante = (cabeza, base = cabeza) => {
    setMostrarForm(true);
    setEditandoId(null);
    setNombre(tituloDe(cabeza));
    setVariante('');
    setGrupoId(cabeza.id);
    setCabezaSinEtiqueta(!cabeza.variante);
    setEtiquetaCabeza('');
    setCodigoBarras('');
    setPrecioUsd(base.costo_usd != null ? String(base.costo_usd) : '');
    cargarCotizador(base);
    setCosto(base.costo || '');
    setPrecioVenta(base.precio_venta || '');
    setStock('');
    setCategoria(cabeza.categoria || 'Ropa');
    setImagenUrl(base.imagen_url || cabeza.imagen_url || '');
    setVideoUrl(base.video_url || cabeza.video_url || '');
    setMostrarEnMercadito(!!cabeza.mostrar_en_mercadito);
    setDescripcion('');
    setGaleria([]);
  };

  const sacarDelGrupo = async (p) => {
    if (!confirm(`¿Sacar "${p.variante || p.nombre}" del grupo? Queda como artículo suelto con el mismo nombre.`)) return;
    await patchProducto(p.id, { grupo_id: null, variante: null });
    cargarProductosYCategorias();
  };

  const abrirAgrupar = () => {
    const lista = seleccionados;
    setAgrupar({ titulo: lista[0]?.nombre || '', filas: lista.map(x => ({ id: x.id, nombre: x.nombre, variante: '' })), guardando: false, error: '' });
  };

  const confirmarAgrupar = async () => {
    const a = agrupar;
    if (!a.titulo.trim()) { setAgrupar({ ...a, error: 'Escribe el nombre del grupo.' }); return; }
    if (a.filas.some(f => !f.variante.trim())) { setAgrupar({ ...a, error: 'Cada artículo necesita el nombre de su variante.' }); return; }
    setAgrupar({ ...a, guardando: true, error: '' });
    try {
      const res = await fetch('/api/admin/catalogo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'agrupar', titulo: a.titulo, miembros: a.filas.map(f => ({ id: f.id, variante: f.variante })) }),
      }).then(r => r.json());
      if (!res.ok) throw new Error(res.mensaje || 'No se pudo agrupar');
      setAgrupar(null);
      setSeleccion([]);
      setMensaje({ tipo: 'exito', texto: `Listo: ${res.cambiados} artículos agrupados como variantes de «${a.titulo.trim()}».` });
      cargarProductosYCategorias();
    } catch (err) {
      setAgrupar({ ...a, guardando: false, error: err.message });
    }
  };

  const limpiarFormulario = () => {
    setHist(null);
    setEditandoId(null);
    setVariante('');
    setGrupoId(null);
    setCabezaSinEtiqueta(false);
    setEtiquetaCabeza('');
    setNombre('');
    setCodigoBarras('');
    setPrecioUsd('');
    setCosto('');
    setPrecioVenta('');
    setStock('');
    setCategoria(listaCategorias[0] || 'Ropa');
    setImagenUrl('');
    setVideoUrl('');
    setMostrarEnMercadito(true);
    setDescripcion('');
    setGaleria([]);
  };

  // COTIZADOR — cálculos en tiempo real
  const taxPct = tipoTax === 'arizona' ? 0.086 : tipoTax === 'california' ? 0.0775 : (Number(taxDenogPct) / 100 || 0)
  const costoMxn = precioUsd ? Number(precioUsd) * (1 + taxPct) * Number(tipoCambio) : Number(costo) || 0
  const venta = Number(precioVenta) || 0
  const utilidad = venta - costoMxn
  const margen = venta > 0 ? (utilidad / venta) * 100 : 0

  // Aviso de código de barras repetido (el mismo UPC en otro artículo).
  const codigoRepetido = codigoBarras.trim()
    ? productos.find(x => x.id !== editandoId && (x.codigo_barras || '').trim().toLowerCase() === codigoBarras.trim().toLowerCase())
    : null;

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

  // Orden de la tabla (clic en el encabezado: ascendente, descendente, quitar).
  const valorOrden = (p, campo) => {
    if (campo === 'nombre') return (p.nombre || '').toLowerCase();
    if (campo === 'costo') return Number(p.costo) || 0;
    if (campo === 'precio') return Number(p.precio_venta) || 0;
    if (campo === 'stock') return Number(p.stock) || 0;
    if (campo === 'margen') return p.precio_venta > 0 && p.costo ? (p.precio_venta - p.costo) / p.precio_venta : -1;
    return 0;
  };
  const productosOrdenados = orden.campo
    ? [...productosFiltrados].sort((a, b) => {
        const va = valorOrden(a, orden.campo);
        const vb = valorOrden(b, orden.campo);
        const r = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
        return orden.dir === 'asc' ? r : -r;
      })
    : productosFiltrados;
  const idsVisibles = productosOrdenados.map(p => p.id);
  const todosMarcados = idsVisibles.length > 0 && idsVisibles.every(id => seleccion.includes(id));
  const seleccionados = productos.filter(p => seleccion.includes(p.id));

  // Agrupa las filas visibles por publicación: las variantes de un mismo
  // artículo quedan juntas bajo una fila-resumen.
  const filasVisibles = (() => {
    const mapa = new Map();
    for (const p of productosOrdenados) {
      const k = p.grupo_id ?? p.id;
      if (!mapa.has(k)) mapa.set(k, { clave: k, miembros: [] });
      mapa.get(k).miembros.push(p);
    }
    return [...mapa.values()];
  })();

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

  // Una fila de la tabla. `esVariante` la pinta como parte de un grupo.
  const renderFila = (p, esVariante) => (
        <tr key={p.id} className={`hover:bg-slate-800/20 transition-colors ${!p.activo ? 'opacity-40' : ''}`}
          style={seleccion.includes(p.id) ? { background: 'var(--ambar-suave)' } : esVariante ? { background: 'var(--w02)', boxShadow: 'inset 3px 0 0 var(--marca)' } : undefined}>
          <td className="p-3">
            <input type="checkbox" aria-label={`Seleccionar ${p.nombre}`} checked={seleccion.includes(p.id)} onChange={() => alternarSeleccion(p.id)} />
          </td>
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
                  {esVariante ? <span><span style={{ color: 'var(--w30)' }}>↳</span> {p.variante || p.nombre}</span> : p.nombre}
                  {p.mostrar_en_mercadito && <span title={p.stock > 0 ? "Visible en Mercadito" : "Sin stock: oculto en el Mercadito hasta que se reponga"} className="text-[9px] bg-[#4a1b0c]/50 text-[#dd8a6c] border border-[#6d2a19]/60 rounded px-1.5 py-0.5">{p.stock > 0 ? "🛍️ Mercadito" : "🛍️ Oculto: sin stock"}</span>}
                </p>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--w40)' }}>{p.codigo_barras}</p>
              </div>
            </div>
          </td>
          <td className="p-3">
            <span className="px-2 py-0.5 rounded text-[10px] whitespace-nowrap" style={{ background: 'var(--w04)', border: '1px solid var(--w10)', color: 'var(--w60)' }}>{p.categoria}</span>
          </td>
          <td className="p-3 text-right" style={{ color: 'var(--w50)' }}>
            {p.costo ? `$${Number(p.costo).toFixed(2)}` : '—'}
          </td>
          <td className="p-3 text-right font-bold" style={{ color: 'var(--marca-t)' }}>
            {`$${(Number(p.precio_venta) || 0).toFixed(2)}`}
          </td>
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
            <span className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-extrabold text-[11px] whitespace-nowrap" style={{
              background: p.stock > 2 ? 'var(--verde-suave)' : p.stock > 0 ? 'var(--ambar-suave)' : 'rgba(var(--rojo-rgb),0.10)',
              border: `1px solid ${p.stock > 2 ? 'var(--verde-borde)' : p.stock > 0 ? 'var(--ambar-borde)' : 'rgba(var(--rojo-rgb),0.28)'}`,
              color: p.stock > 2 ? 'var(--verde)' : p.stock > 0 ? 'var(--ambar)' : 'var(--rojo-t)',
            }}>
              <button onClick={() => ajustarStock(p, -1)} aria-label={`Quitar una pieza de ${p.nombre}`} style={{ width: 20, height: 20, cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', fontSize: 14, lineHeight: 1 }}>−</button>
              <CeldaNum valor={p.stock} prefijo="" entero ancho={34} etiqueta={`Stock de ${p.nombre}`} onGuardar={v => patchProducto(p.id, { stock: v })} />
              <button onClick={() => ajustarStock(p, 1)} aria-label={`Agregar una pieza a ${p.nombre}`} style={{ width: 20, height: 20, cursor: 'pointer', background: 'transparent', border: 'none', color: 'inherit', fontSize: 14, lineHeight: 1 }}>+</button>
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
              <button
                onClick={e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuAbierto(menuAbierto?.id === p.id ? null : { id: p.id, top: r.bottom + 4, right: window.innerWidth - r.right });
                }}
                aria-label={`Más acciones de ${p.nombre}`} aria-haspopup="menu" aria-expanded={menuAbierto?.id === p.id}
                className="px-2 py-1 rounded-md font-bold text-[13px] border border-slate-700 text-slate-300 bg-[#1e2533]">⋯</button>
            </div>
          </td>
        </tr>
  );

  // Fila resumen de un grupo de variantes: título, rango de precios, stock total.
  const renderCabeceraGrupo = (g) => {
    const cabeza = g.miembros.find(m => m.grupo_id == null) || g.miembros[0];
    const precios = g.miembros.map(m => Number(m.precio_venta) || 0);
    const pMin = Math.min(...precios), pMax = Math.max(...precios);
    const total = g.miembros.reduce((n, m) => n + (Number(m.stock) || 0), 0);
    const ids = g.miembros.map(m => m.id);
    const todos = ids.every(id => seleccion.includes(id));
    const cerrado = !!cerrados[g.clave];
    const foto = cabeza.imagen_url || g.miembros.find(m => m.imagen_url)?.imagen_url;
    return (
      <tr key={`h${g.clave}`} className="border-b border-slate-800/60" style={{ background: 'var(--w04)' }}>
        <td className="p-3">
          <input type="checkbox" aria-label={`Seleccionar todo ${tituloDe(cabeza)}`} checked={todos}
            onChange={() => setSeleccion(todos ? seleccion.filter(id => !ids.includes(id)) : [...new Set([...seleccion, ...ids])])} />
        </td>
        <td className="p-3">
          <button type="button" onClick={() => setCerrados({ ...cerrados, [g.clave]: !cerrado })} className="flex items-center gap-2 text-left" aria-expanded={!cerrado}>
            <span style={{ color: 'var(--w50)', fontSize: 11, width: 12 }}>{cerrado ? '▸' : '▾'}</span>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto} alt="" className="w-8 h-8 rounded object-cover border border-slate-700 flex-none" />
            ) : (
              <div className="w-8 h-8 rounded bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-[11px]">📦</div>
            )}
            <div>
              <p className="font-bold text-slate-200 flex items-center gap-1.5">
                {tituloDe(cabeza)}
                <span className="text-[9px] rounded px-1.5 py-0.5" style={{ background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', color: 'var(--ambar)' }}>{g.miembros.length} variantes</span>
              </p>
            </div>
          </button>
        </td>
        <td className="p-3">
          <span className="px-2 py-0.5 rounded text-[10px] whitespace-nowrap" style={{ background: 'var(--w04)', border: '1px solid var(--w10)', color: 'var(--w60)' }}>{cabeza.categoria}</span>
        </td>
        <td className="p-3 text-right" style={{ color: 'var(--w30)' }}>—</td>
        <td className="p-3 text-right font-bold" style={{ color: 'var(--marca-t)' }}>
          {pMin === pMax ? `$${pMin.toFixed(2)}` : `$${pMin.toFixed(2)} – $${pMax.toFixed(2)}`}
        </td>
        <td className="p-3 text-right" style={{ color: 'var(--w30)' }}>—</td>
        <td className="p-3 text-center font-extrabold text-[11px]" style={{ color: total > 0 ? 'var(--tinta)' : 'var(--rojo-t)' }}>{total} u</td>
        <td className="p-3 text-center">
          <div className="flex justify-center gap-1.5">
            <button onClick={() => iniciarVariante(cabeza)} className="px-2.5 py-1 rounded-md font-bold text-[11px] border transition-all whitespace-nowrap" style={{ background: 'transparent', color: 'var(--marca-t)', borderColor: 'var(--marca)' }}>
              + Variante
            </button>
          </div>
        </td>
      </tr>
    );
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

        {/* POR APROBAR — captura rápida y aprobación en lote */}
        <div style={{ background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', borderRadius: 16, padding: 18 }} className="space-y-3">
          <h2 className="flex items-center gap-2" style={{ color: 'var(--ambar)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4 }}>
            🕓 Por aprobar ({productosPendientes.length})
          </h2>
          <p className="text-[11px]" style={{ color: 'var(--w50)' }}>Aquí llegan los artículos que agregan los colaboradores, y también puedes capturar rápido los tuyos. Pulsa Editar completo para poner dólares, tipo de cambio, precio y stock, y aprobarlo.</p>

          <form onSubmit={capturaRapida} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input value={cap.codigo} onChange={e => setCap({ ...cap, codigo: e.target.value })} placeholder="Código (escanea)" aria-label="Código de barras" style={{ ...campo, flex: '1 1 130px' }} />
            <input value={cap.nombre} onChange={e => setCap({ ...cap, nombre: e.target.value })} placeholder="Nombre del artículo" aria-label="Nombre" style={{ ...campo, flex: '2 1 200px' }} />
            <input type="number" step="0.01" value={cap.precio} onChange={e => setCap({ ...cap, precio: e.target.value })} placeholder="Precio" aria-label="Precio de venta" style={{ ...campo, width: 90 }} />
            <input type="number" value={cap.stock} onChange={e => setCap({ ...cap, stock: e.target.value })} placeholder="Stock" aria-label="Stock" style={{ ...campo, width: 76 }} />
            <button type="submit" disabled={capGuardando} style={{ ...campo, cursor: 'pointer', fontWeight: 800, background: 'var(--marca)', color: 'var(--sup)', borderColor: 'var(--marca)' }}>
              {capGuardando ? 'Agregando…' : 'Agregar'}
            </button>
          </form>

          {productosPendientes.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tinta)', fontWeight: 700 }}>
                  <input type="checkbox" checked={seleccionPend.length === productosPendientes.length}
                    onChange={() => setSeleccionPend(seleccionPend.length === productosPendientes.length ? [] : productosPendientes.map(p => p.id))} />
                  Marcar todos
                </label>
                {seleccionPend.length > 0 && (
                  <>
                    <span style={{ color: 'var(--w50)' }}>{seleccionPend.length} marcado{seleccionPend.length === 1 ? '' : 's'}</span>
                    <button onClick={() => aprobarPendientes()} style={{ ...campo, cursor: 'pointer', fontWeight: 800, color: 'var(--verde)' }}>Aprobar</button>
                    <button onClick={async () => { await eliminarProductos(productosPendientes.filter(p => seleccionPend.includes(p.id))); setSeleccionPend([]); }} style={{ ...campo, cursor: 'pointer', fontWeight: 700, color: 'var(--rojo-t)' }}>Eliminar</button>
                  </>
                )}
              </div>
              <div className="space-y-2">
                {productosPendientes.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-[#161b26] border border-amber-900/40 rounded-xl p-3 flex-wrap">
                    <input type="checkbox" aria-label={`Marcar ${p.nombre}`} checked={seleccionPend.includes(p.id)}
                      onChange={() => setSeleccionPend(seleccionPend.includes(p.id) ? seleccionPend.filter(i => i !== p.id) : [...seleccionPend, p.id])} />
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-700 flex-none" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-lg">📦</div>
                    )}
                    <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
                      <p className="font-bold text-slate-200 text-xs">{p.nombre}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p.categoria} · {p.codigo_barras}
                        {p.creador?.nombre ? ` · agregado por ${p.creador.nombre}` : ''}
                        {p.costo_usd != null ? ' · desde WhatsApp (TIENDA)' : ''}
                      </p>
                    </div>
                    <button onClick={() => iniciarEdicion(p)} title="Abre el formulario completo: dólares, tipo de cambio, foto, Mercadito" className="flex-none bg-amber-600 hover:bg-amber-500 sobre-color px-3 py-1.5 rounded-lg font-bold text-[11px]">
                      Editar completo
                    </button>
                    <button onClick={() => eliminarProductos([p])} title="Eliminar este artículo" className="flex-none px-3 py-1.5 rounded-lg font-bold text-[11px] border transition-all bg-red-950/20 text-red-400 border-red-900/60 hover:bg-red-900/40">
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

          
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
              <button onClick={() => setCatsAbierto(true)} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Categorías…</button>
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

            {/* Barra de acciones en lote: aparece al marcar artículos */}
            {seleccion.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)', borderRadius: 12, padding: '9px 12px' }}>
                <span style={{ color: 'var(--tinta)', fontSize: 12.5, fontWeight: 800 }}>
                  {seleccion.length} seleccionado{seleccion.length === 1 ? '' : 's'}
                </span>
                <span style={{ flex: 1 }} />
                <button onClick={() => accionLote({ activo: false }, 'Pausados')} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Pausar</button>
                <button onClick={() => accionLote({ activo: true }, 'Activados')} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Activar</button>
                <button onClick={() => accionLote({ mostrar_en_mercadito: true }, 'Publicados en el Mercadito')} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Mostrar en Mercadito</button>
                <button onClick={() => accionLote({ mostrar_en_mercadito: false }, 'Quitados del Mercadito')} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Quitar del Mercadito</button>
                <select value={categoriaLote}
                  onChange={e => { const c = e.target.value; setCategoriaLote(c); if (c) accionLote({ categoria: c }, `Categoría cambiada a ${c}`); }}
                  style={campo}>
                  <option value="">Cambiar categoría…</option>
                  {listaCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {seleccion.length >= 2 && (
                  <button onClick={abrirAgrupar} style={{ ...campo, cursor: 'pointer', fontWeight: 700, color: 'var(--marca-t)' }}>Agrupar como variantes</button>
                )}
                <button onClick={() => eliminarProductos(seleccionados)} style={{ ...campo, cursor: 'pointer', fontWeight: 700, color: 'var(--rojo-t)' }}>Eliminar</button>
                <button onClick={() => setSeleccion([])} style={{ ...campo, cursor: 'pointer', color: 'var(--w50)' }}>Quitar selección</button>
              </div>
            )}

            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800/80">
              <table className="w-full text-left border-collapse text-xs" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="bg-[#1f2635] text-slate-300 font-bold border-b border-slate-800">
                    <th className="p-3" style={{ width: 34 }}>
                      <input type="checkbox" aria-label="Seleccionar todos los visibles" checked={todosMarcados}
                        onChange={() => setSeleccion(todosMarcados ? seleccion.filter(id => !idsVisibles.includes(id)) : [...new Set([...seleccion, ...idsVisibles])])} />
                    </th>
                    {[
                      { k: 'nombre', et: 'Artículo / Código', cls: '' },
                      { k: null, et: 'Categoría', cls: '' },
                      { k: 'costo', et: 'Costo', cls: 'text-right' },
                      { k: 'precio', et: 'Precio venta', cls: 'text-right' },
                      { k: 'margen', et: 'Margen', cls: 'text-right' },
                      { k: 'stock', et: 'Stock', cls: 'text-center' },
                    ].map(h => (
                      <th key={h.et} className={`p-3 ${h.cls}`}
                        onClick={h.k ? () => ordenarPor(h.k) : undefined}
                        style={h.k ? { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' } : undefined}
                        aria-sort={h.k && orden.campo === h.k ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {h.et}{h.k && orden.campo === h.k ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 bg-[#111520]">
                  {productosOrdenados.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-6 text-center" style={{ color: 'var(--w38)' }}>Ningún artículo coincide con estos filtros.</td>
                    </tr>
                  ) : (
                    filasVisibles.map((g) => g.miembros.length > 1 ? (
                      <React.Fragment key={`g${g.clave}`}>
                        {renderCabeceraGrupo(g)}
                        {!cerrados[g.clave] && g.miembros.map(m => renderFila(m, true))}
                      </React.Fragment>
                    ) : renderFila(g.miembros[0], false))
                  )}
                </tbody>
              </table>
            </div>
            {/* Celular: tarjetas en lugar de tabla */}
            <div className="md:hidden space-y-2">
              {filasVisibles.length === 0 ? (
                <p className="p-6 text-center" style={{ color: 'var(--w38)' }}>Ningún artículo coincide con estos filtros.</p>
              ) : filasVisibles.map((g) => (
                <React.Fragment key={`m${g.clave}`}>
                  {g.miembros.length > 1 && (
                    <button type="button" onClick={() => setCerrados({ ...cerrados, [g.clave]: !cerrados[g.clave] })}
                      style={{ width: '100%', textAlign: 'left', background: 'var(--w04)', border: '1px solid var(--w10)', borderRadius: 12, padding: '10px 12px', color: 'var(--tinta)', fontWeight: 800, fontSize: 13 }}>
                      {cerrados[g.clave] ? '▸' : '▾'} {tituloDe(g.miembros.find(m => m.grupo_id == null) || g.miembros[0])}
                      <span style={{ color: 'var(--w50)', fontWeight: 600 }}> · {g.miembros.length} variantes</span>
                    </button>
                  )}
                  {!(g.miembros.length > 1 && cerrados[g.clave]) && g.miembros.map(p => (
                    <div key={p.id} style={{ border: '1px solid var(--w10)', borderRadius: 12, padding: 10, marginLeft: g.miembros.length > 1 ? 12 : 0, opacity: p.activo ? 1 : 0.45, background: seleccion.includes(p.id) ? 'var(--ambar-suave)' : 'transparent' }}>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <input type="checkbox" aria-label={`Seleccionar ${p.nombre}`} checked={seleccion.includes(p.id)} onChange={() => alternarSeleccion(p.id)} />
                        {p.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagen_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-700 flex-none" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center">📦</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--tinta)', fontWeight: 800, fontSize: 13 }}>{g.miembros.length > 1 ? (p.variante || p.nombre) : p.nombre}</div>
                          <div style={{ color: 'var(--w45)', fontSize: 11 }}>{p.categoria}{p.mostrar_en_mercadito ? ' · en Mercadito' : ''}</div>
                          <div style={{ color: 'var(--w60)', fontSize: 12, marginTop: 4 }}>
                            Costo ${(Number(p.costo) || 0).toFixed(2)} · <b style={{ color: 'var(--marca-t)' }}>Precio ${(Number(p.precio_venta) || 0).toFixed(2)}</b>
                            {p.costo > 0 && p.precio_venta > 0 ? ` · ${margenDe(p).toFixed(0)}%` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => ajustarStock(p, -1)} aria-label={`Quitar una pieza de ${p.nombre}`} style={{ ...campo, cursor: 'pointer', width: 36, padding: 0 }}>−</button>
                        <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 800, color: p.stock > 2 ? 'var(--verde)' : p.stock > 0 ? 'var(--ambar)' : 'var(--rojo-t)' }}>{p.stock} u</span>
                        <button onClick={() => ajustarStock(p, 1)} aria-label={`Agregar una pieza a ${p.nombre}`} style={{ ...campo, cursor: 'pointer', width: 36, padding: 0 }}>+</button>
                        <span style={{ flex: 1 }} />
                        <button onClick={() => iniciarEdicion(p)} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Editar</button>
                        <button onClick={() => cambiarEstadoActivo(p.id, p.activo)} style={{ ...campo, cursor: 'pointer', fontWeight: 700, color: p.activo ? 'var(--rojo-t)' : 'var(--verde)' }}>{p.activo ? 'Pausar' : 'Activar'}</button>
                        <button
                          onClick={e => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuAbierto(menuAbierto?.id === p.id ? null : { id: p.id, top: r.bottom + 4, right: window.innerWidth - r.right });
                          }}
                          aria-label={`Más acciones de ${p.nombre}`} style={{ ...campo, cursor: 'pointer', fontWeight: 800 }}>⋯</button>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

        {/* Menú "⋯" de cada fila. Va fuera de la tabla, con posición fija,
            para que el scroll horizontal de la tabla no lo recorte. */}
        {menuAbierto && (() => {
          const p = productos.find(x => x.id === menuAbierto.id);
          if (!p) return null;
          const itemBase = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer' };
          return (
            <>
              <div onClick={() => setMenuAbierto(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div role="menu" style={{ position: 'fixed', top: menuAbierto.top, right: menuAbierto.right, zIndex: 50, minWidth: 150, background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                <button role="menuitem" onClick={() => { setMenuAbierto(null); iniciarVariante(p.grupo_id ? (productos.find(x => x.id === p.grupo_id) || p) : p, p); }} style={{ ...itemBase, color: 'var(--tinta)' }}>
                  Agregar variante
                </button>
                {p.grupo_id && (
                  <button role="menuitem" onClick={() => { setMenuAbierto(null); sacarDelGrupo(p); }} style={{ ...itemBase, color: 'var(--tinta)', borderTop: '1px solid var(--w06)' }}>
                    Sacar del grupo
                  </button>
                )}
                <button role="menuitem" onClick={() => { setMenuAbierto(null); duplicarProducto(p); }} style={{ ...itemBase, color: 'var(--tinta)', borderTop: '1px solid var(--w06)' }}>
                  Duplicar
                </button>
                <button role="menuitem" onClick={() => { setMenuAbierto(null); eliminarProductos([p]); }} style={{ ...itemBase, color: 'var(--rojo-t)', borderTop: '1px solid var(--w06)' }}>
                  Eliminar
                </button>
              </div>
            </>
          );
        })()}

        {catsAbierto && (
          <div onClick={() => { setCatsAbierto(false); setCatEdit(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 16, padding: 20 }} className="space-y-3 text-xs">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'var(--tinta)', fontSize: 16, fontWeight: 800 }}>Categorías</div>
                <button onClick={() => { setCatsAbierto(false); setCatEdit(null); }} style={{ background: 'transparent', border: '1px solid var(--w12)', borderRadius: 9, padding: '6px 12px', color: 'var(--w50)', fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
              </div>
              <p style={{ color: 'var(--w50)' }}>Para fusionar dos categorías, renombra una con el nombre exacto de la otra.</p>
              {listaCategorias.map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--w06)', paddingTop: 8 }}>
                  {catEdit?.viejo === c ? (
                    <>
                      <input autoFocus value={catEdit.nuevo} onChange={e => setCatEdit({ ...catEdit, nuevo: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renombrarCategoria(); if (e.key === 'Escape') setCatEdit(null); }}
                        style={{ ...campo, flex: 1 }} />
                      <button onClick={renombrarCategoria} style={{ ...campo, cursor: 'pointer', fontWeight: 800, color: 'var(--verde)' }}>Guardar</button>
                      <button onClick={() => setCatEdit(null)} style={{ ...campo, cursor: 'pointer', color: 'var(--w50)' }}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, color: 'var(--tinta)', fontWeight: 700 }}>{c}</span>
                      <span style={{ color: 'var(--w45)' }}>{conteoCat(c)} artículo{conteoCat(c) === 1 ? '' : 's'}</span>
                      <button onClick={() => setCatEdit({ viejo: c, nuevo: c })} style={{ ...campo, cursor: 'pointer', fontWeight: 700 }}>Renombrar</button>
                      {conteoCat(c) === 0 && (
                        <button onClick={() => quitarCategoriaVacia(c)} style={{ ...campo, cursor: 'pointer', fontWeight: 700, color: 'var(--rojo-t)' }}>Quitar</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {agrupar && (
          <div onClick={() => !agrupar.guardando && setAgrupar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(42,33,24,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--sup)', border: '1px solid var(--w10)', borderRadius: 16, padding: 20 }} className="space-y-3 text-xs">
              <div style={{ color: 'var(--tinta)', fontSize: 16, fontWeight: 800 }}>Agrupar como variantes</div>
              <p style={{ color: 'var(--w50)' }}>Estos artículos se verán como una sola publicación en el Mercadito. Cada uno conserva su costo, precio, stock y código.</p>
              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Nombre del grupo *</label>
                <input type="text" value={agrupar.titulo} onChange={e => setAgrupar({ ...agrupar, titulo: e.target.value })} className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-slate-400 font-bold">¿En qué se distingue cada uno? *</label>
                {agrupar.filas.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate" style={{ color: 'var(--w60)' }} title={f.nombre}>{i === 0 ? '★ ' : ''}{f.nombre}</span>
                    <input type="text" value={f.variante} placeholder="Ej. Talla M"
                      onChange={e => setAgrupar({ ...agrupar, filas: agrupar.filas.map(x => x.id === f.id ? { ...x, variante: e.target.value } : x) })}
                      className="w-40 bg-[#1e2533] border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none" />
                  </div>
                ))}
                <p className="text-[10px]" style={{ color: 'var(--w40)' }}>★ es el artículo principal: de él salen la descripción y las fotos extra del grupo.</p>
              </div>
              {agrupar.error && <p style={{ color: 'var(--rojo-t)', fontWeight: 700 }}>{agrupar.error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={agrupar.guardando} onClick={confirmarAgrupar} className="flex-1 bg-[#c1553a] hover:bg-[#9b3f28] sobre-color font-bold py-2.5 rounded-xl">
                  {agrupar.guardando ? 'Agrupando…' : 'Agrupar'}
                </button>
                <button type="button" disabled={agrupar.guardando} onClick={() => setAgrupar(null)} className="bg-slate-800 text-slate-300 font-bold px-4 rounded-xl border border-slate-700">Cancelar</button>
              </div>
            </div>
          </div>
        )}

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
                  {editandoId ? (grupoId ? 'Editar variante' : 'Editar artículo') : grupoId ? 'Nueva variante' : 'Nuevo artículo'}
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
                <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={!!grupoId} placeholder="Ej. Chamarra Columbia Hombre" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none disabled:opacity-60" />
                {grupoId && <p className="text-[10px]" style={{ color: 'var(--w40)' }}>Es el nombre del grupo; se cambia desde el artículo principal.</p>}
              </div>

              {/* VARIANTE: lo que distingue a este artículo de los demás del grupo */}
              {(grupoId || variante || cabezaSinEtiqueta) && (
                <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--ambar-suave)', border: '1px solid var(--ambar-borde)' }}>
                  {cabezaSinEtiqueta && (
                    <div className="space-y-1">
                      <label className="text-slate-400 font-bold">¿Cómo se llama el artículo que ya tienes? *</label>
                      <input type="text" value={etiquetaCabeza} onChange={(e) => setEtiquetaCabeza(e.target.value)} placeholder="Ej. Talla S · Azul" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold">{grupoId ? 'Nombre de esta variante *' : 'Nombre de su variante'}</label>
                    <input type="text" value={variante} onChange={(e) => setVariante(e.target.value)} placeholder="Ej. Talla M · Rojo" className="w-full bg-[#1e2533] border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none" />
                    <p className="text-[10px]" style={{ color: 'var(--w40)' }}>Costo, precio, stock y código son propios de esta variante. En el Mercadito se verán juntas.</p>
                  </div>
                </div>
              )}

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
                {codigoRepetido && (
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ambar)' }}>
                    Ese código ya lo tiene «{codigoRepetido.nombre}». Si es otra talla o color, déjalo así; si no, revísalo.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Foto<span className="text-[10px] text-slate-500">(referencia para el POS)</span></label>
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

              {/* VIDEO PARA LA PANTALLA DE LA TIENDA */}
              <div className="space-y-1">
                <label className="text-slate-400 font-bold">Video <span className="text-[10px] text-slate-500">(opcional, para la pantalla de la tienda)</span></label>
                <div className="flex items-center gap-3">
                  {videoUrl ? (
                    <video src={videoUrl} muted playsInline className="w-16 h-16 rounded-lg object-cover border border-slate-700 flex-none bg-black" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-[#1e2533] border border-slate-700 flex-none flex items-center justify-center text-xl">🎬</div>
                  )}
                  <div className="flex-1 space-y-1.5">
                    <label className="block w-full text-center bg-[#c1553a] hover:bg-[#9b3f28] sobre-color font-bold py-2.5 rounded-xl cursor-pointer transition-all">
                      {subiendoVideo ? 'Subiendo video…' : videoUrl ? '🎬 Cambiar video' : '🎬 Subir video corto'}
                      <input type="file" accept="video/mp4,video/webm" onChange={subirVideo} disabled={subiendoVideo} className="hidden" />
                    </label>
                    {videoUrl && (
                      <button type="button" onClick={() => setVideoUrl('')} className="w-full text-center text-[11px] text-red-400 hover:underline">
                        Quitar video
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

                {grupoId ? (
                  <p className="text-[10px]" style={{ color: 'var(--w40)' }}>La descripción y las fotos extra se editan en el artículo principal del grupo. La foto de arriba es la de esta variante.</p>
                ) : (<>
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
                </>)}
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
                  {loading ? 'Guardando...' : editandoId ? 'Guardar Cambios' : grupoId ? 'Agregar variante' : 'Subir al Catálogo'}
                </button>
                {(editandoId || grupoId) && (
                  <button type="button" onClick={limpiarFormulario} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 rounded-xl border border-slate-700">
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {editandoId && (
              <div className="rounded-xl p-3" style={{ border: '1px solid var(--w10)' }}>
                <button type="button" onClick={() => abrirHistorial(editandoId)} className="text-[11px] font-bold" style={{ color: 'var(--marca-t)' }}>
                  {hist ? '▾ Ocultar historial de cambios' : '▸ Ver historial de cambios'}
                </button>
                {hist && (
                  <div className="mt-2 space-y-2 text-[11px]">
                    {hist.cargando && <p style={{ color: 'var(--w45)' }}>Cargando…</p>}
                    {hist.error && <p style={{ color: 'var(--rojo-t)' }}>{hist.error}</p>}
                    {!hist.cargando && !hist.error && hist.items.length === 0 && <p style={{ color: 'var(--w45)' }}>Todavía no hay cambios registrados.</p>}
                    {hist.items.map(h => (
                      <div key={h.id} style={{ borderTop: '1px solid var(--w06)', paddingTop: 6 }}>
                        <div style={{ color: 'var(--w45)' }}>{fechaHist(h.ocurrio_en)} · {h.actor_nombre || 'Sistema'}{h.operacion === 'INSERT' ? ' · creó el artículo' : ''}</div>
                        {(h.cambios || []).map(c => (
                          <div key={c} style={{ color: 'var(--tinta)' }}>
                            {ETIQUETAS_HIST[c] || c}: {verHist(c, h.antes?.[c])} <span style={{ color: 'var(--w40)' }}>→</span> <b>{verHist(c, h.despues?.[c])}</b>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}