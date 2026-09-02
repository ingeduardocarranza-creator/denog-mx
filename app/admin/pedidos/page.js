'use client'
import { useState, useEffect } from 'react'
import PedidosWhatsApp from '../../components/PedidosWhatsApp'
import PorAprobar from '../../components/PorAprobar'
import Link from 'next/link'

export default function Pedidos() {
  const hoy = new Date().toISOString().split('T')[0]
  const [clientes, setClientes] = useState([])
  const [entregas, setEntregas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [tc, setTc] = useState(19.45)
  const [estado, setEstado] = useState('az')
  const [form, setForm] = useState({
    cliente_id: '', entrega_id: '', descripcion: '', categoria: '',
    lugar_compra: 'Ross', cantidad: 1, fecha_compra: hoy,
    precio_usd: '', precio_venta_unitario: '', notas: '',
    vendedor_id: '', imagen_url: ''
  })
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [sugiriendoIA, setSugiriendoIA] = useState(false)
  const [calc, setCalc] = useState({
    costo_unitario: 0, impuesto: 0,
    costo_total: 0, venta_total: 0,
    utilidad: 0, margen: 0
  })
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(false)

  // Pestañas
  // Dos mundos distintos en la misma pantalla: lo que TÚ capturas y lo que
  // llega DEL CLIENTE. Antes eran cinco pestañas al mismo nivel y no se
  // distinguía cuál era cuál.
  const [modo, setModo] = useState('captura')
  const [pestana, setPestana] = useState('capturar')
  const [nSolicitudes, setNSolicitudes] = useState(0)
  const [nPorAprobar, setNPorAprobar] = useState(0)

  // Pestaña Ver/Editar
  const [todosPedidos, setTodosPedidos] = useState([])
  const [cargandoTabla, setCargandoTabla] = useState(false)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroDescripcion, setFiltroDescripcion] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [filtroEntrega, setFiltroEntrega] = useState('')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 30
  const [editandoPedido, setEditandoPedido] = useState(null)
  const [editFormPedido, setEditFormPedido] = useState({})
  const [guardandoPedido, setGuardandoPedido] = useState(false)
  const [pedidoMsg, setPedidoMsg] = useState('')
  const [editTaxTipo, setEditTaxTipo] = useState('arizona')
  const [editTaxDenogPct, setEditTaxDenogPct] = useState('')
  const [categorias, setCategorias] = useState([])
  const [filtroCategoria, setFiltroCategoria] = useState('')

  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => {
      if (d.ok) {
        setClientes(d.clientes)
        setVendedores(d.clientes.filter(c => c.rol === 'admin' || c.rol === 'vendedor'))
      }
    })
    // Más reciente primero, igual que en el resto del panel.
    fetch('/api/pendientes/count').then(r => r.json()).then(d => { if (d.ok) setNSolicitudes(d.count || 0) })
    fetch('/api/reportes/pedidos?pendiente_aprobacion=true').then(r => r.json())
      .then(d => setNPorAprobar((d.pedidos || []).length))

    fetch('/api/entregas').then(r => r.json()).then(d => { if (d.ok) setEntregas([...(d.entregas || [])].sort((a, b) => (b.fecha_entrega || '').localeCompare(a.fecha_entrega || ''))) })
    fetch('/api/categorias').then(r => r.json()).then(d => {
      console.log('[categorias]', d)
      if (d.ok) setCategorias(d.categorias)
      else console.error('[categorias] Error:', d.mensaje)
    })
  }, [])

  useEffect(() => {
    const imp = estado === 'az' ? 0.086 : 0.0775
    const usd = parseFloat(form.precio_usd) || 0
    const ventaUnitaria = parseFloat(form.precio_venta_unitario) || 0
    const cantidad = parseInt(form.cantidad) || 1

    const costoBaseUnitario = usd * tc
    const impMonto = costoBaseUnitario * imp
    const costoUnitario = costoBaseUnitario + impMonto

    const costoTotal = costoUnitario * cantidad
    const ventaTotal = ventaUnitaria * cantidad
    const util = ventaTotal - costoTotal
    const margen = ventaTotal > 0 ? (util / ventaTotal) * 100 : 0

    setCalc({
      costo_unitario: costoUnitario,
      impuesto: impMonto,
      costo_total: costoTotal,
      venta_total: ventaTotal,
      utilidad: util,
      margen
    })
  }, [form.precio_usd, form.precio_venta_unitario, form.cantidad, tc, estado])

  const sugerirConIA = async (url) => {
    const imagenUrl = url || form.imagen_url
    if (!imagenUrl) return
    setSugiriendoIA(true)
    try {
      const res = await fetch('/api/pedidos/sugerir-nombre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen_url: imagenUrl }),
      }).then(r => r.json())
      if (res.ok) {
        setForm(f => ({
          ...f,
          descripcion: res.descripcion || f.descripcion,
          categoria: res.categoria || f.categoria,
        }))
      } else {
        setMsg('Error IA: ' + (res.mensaje || 'Sin respuesta'))
      }
    } catch (err) {
      setMsg('No se pudo conectar con IA: ' + err.message)
    } finally {
      setSugiriendoIA(false)
    }
  }

  const subirFotoPedido = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    if (file.size > 15 * 1024 * 1024) { setMsg('La foto pesa más de 15MB.'); return }
    setSubiendoFoto(true)
    try {
      const datos = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: file.type, carpeta: 'pedidos' }),
      }).then(r => r.json())
      if (!datos.ok) throw new Error(datos.mensaje)
      const formData = new FormData()
      formData.append('', file, file.name)
      const up = await fetch(datos.signedUrl, { method: 'PUT', body: formData })
      if (!up.ok) throw new Error('Error al subir')
      setForm(f => ({ ...f, imagen_url: datos.publicUrl }))
      sugerirConIA(datos.publicUrl)
    } catch (err) {
      setMsg('Error al subir la foto: ' + err.message)
    } finally {
      setSubiendoFoto(false)
    }
  }

  const guardar = async (capturarOtro = false) => {
    if (!form.cliente_id || !form.entrega_id || !form.descripcion) {
      setMsg('Cliente, entrega y descripción son obligatorios'); return
    }
    setCargando(true)
    const imp = estado === 'az' ? 0.086 : 0.0775
    const res = await fetch('/api/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: form.cliente_id,
        entrega_id: form.entrega_id,
        descripcion: form.descripcion,
        categoria: form.categoria || null,
        lugar_compra: form.lugar_compra,
        cantidad: parseInt(form.cantidad) || 1,
        fecha_compra: form.fecha_compra || hoy,
        precio_usd: parseFloat(form.precio_usd) || 0,
        tipo_cambio: tc,
        impuesto_pct: imp * 100,
        costo_mxn: calc.costo_total,
        precio_venta: calc.venta_total,
        utilidad: calc.utilidad,
        notas: form.notas,
        vendedor_id: form.vendedor_id || null,
        imagen_url: form.imagen_url || null
      })
    })
    const data = await res.json()
    if (data.ok) {
      setMsg('✓ Pedido guardado')
      if (capturarOtro) {
        setForm({
          cliente_id: form.cliente_id,
          entrega_id: form.entrega_id,
          descripcion: '',
          categoria: form.categoria,
          lugar_compra: form.lugar_compra,
          cantidad: 1,
          fecha_compra: form.fecha_compra,
          precio_usd: '',
          precio_venta_unitario: '',
          notas: '',
          vendedor_id: form.vendedor_id,
          imagen_url: ''
        })
      } else {
        setForm({
          cliente_id: '', entrega_id: '', descripcion: '', categoria: '',
          lugar_compra: 'Ross', cantidad: 1, fecha_compra: hoy,
          precio_usd: '', precio_venta_unitario: '', notas: '',
          vendedor_id: '', imagen_url: ''
        })
      }
    } else {
      setMsg(data.mensaje || 'Error')
    }
    setCargando(false)
  }

  // Cargar todos los pedidos cuando se abre la pestaña Ver/Editar
  useEffect(() => {
    if (pestana === 'ver') cargarTodosPedidos()
  }, [pestana])

  const cargarTodosPedidos = async () => {
    setCargandoTabla(true)
    const res = await fetch('/api/reportes/pedidos')
    const data = await res.json()
    if (data.ok) {
      const ordenados = (data.pedidos || []).sort((a, b) =>
        (b.fecha_compra || '').localeCompare(a.fecha_compra || '')
      )
      setTodosPedidos(ordenados)
    }
    setCargandoTabla(false)
  }

  const pedidosFiltrados = todosPedidos.filter(p => {
    if (filtroCliente && !p.clientes?.nombre?.toLowerCase().includes(filtroCliente.toLowerCase())) return false
    if (filtroDescripcion && !p.descripcion?.toLowerCase().includes(filtroDescripcion.toLowerCase())) return false
    if (filtroFecha && p.fecha_compra !== filtroFecha) return false
    if (filtroEstado !== 'Todos' && p.estado !== filtroEstado) return false
    if (filtroEntrega === 'sin_entrega' && p.entrega_id) return false
    if (filtroEntrega && filtroEntrega !== 'sin_entrega' && String(p.entrega_id) !== String(filtroEntrega)) return false
    if (filtroCategoria && p.categoria !== filtroCategoria) return false
    return true
  })

  const totalPedidos = pedidosFiltrados.length
  const totalPaginas = Math.ceil(totalPedidos / POR_PAGINA)
  const pedidosPagina = pedidosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const abrirEditarPedido = (p) => {
    const imp = parseFloat(p.impuesto_pct) || 0
    const taxTipo = Math.abs(imp - 8.6) < 0.01 ? 'arizona' : Math.abs(imp - 7.75) < 0.01 ? 'california' : 'denog'
    setEditTaxTipo(taxTipo)
    setEditTaxDenogPct(taxTipo === 'denog' && imp > 0 ? String(imp) : '')
    setEditandoPedido(p.id)
    setEditFormPedido({
      cliente_id: p.cliente_id || '',
      entrega_id: p.entrega_id || '',
      descripcion: p.descripcion || '',
      lugar_compra: p.lugar_compra || '',
      cantidad: p.cantidad ?? 1,
      fecha_compra: p.fecha_compra || '',
      precio_usd: p.precio_usd ?? '',
      tipo_cambio: p.tipo_cambio ?? '',
      impuesto_pct: p.impuesto_pct ?? '',
      costo_mxn: p.costo_mxn ?? '',
      precio_venta: p.precio_venta ?? '',
      utilidad: p.utilidad ?? '',
      notas: p.notas || '',
      estado: p.estado || '',
      vendedor_id: p.vendedor_id || '',
      categoria: p.categoria || '',
      apartado_fragil: p.apartado_fragil || false,
      imagen_url: p.imagen_url || '',
    })
    setPedidoMsg('')
  }

  const guardarPedidoEdit = async () => {
    setGuardandoPedido(true)
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editandoPedido, ...editFormPedido })
    })
    const data = await res.json()
    setGuardandoPedido(false)
    if (data.ok) { setEditandoPedido(null); cargarTodosPedidos() }
    else setPedidoMsg(data.mensaje || 'Error')
  }

  const eliminarPedidoTabla = async (id) => {
    if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return
    const res = await fetch('/api/pedidos/actualizar-pedido', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    const data = await res.json()
    if (data.ok) cargarTodosPedidos()
  }

  const estadoBadge = (estado) => {
    const map = {
      comprado: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', label: 'Comprado' },
      camino:   { bg: 'rgba(245,158,11,0.15)', color: 'var(--ambar)', label: 'En camino' },
      listo:    { bg: 'rgba(59,130,246,0.15)', color: 'var(--azul)', label: 'Listo' },
      Entregado:{ bg: 'rgba(16,185,129,0.15)', color: 'var(--verde)', label: 'Entregado' },
      Cancelado:{ bg: 'rgba(239,68,68,0.12)',  color: 'var(--rojo-t)', label: 'Cancelado' },
    }
    const s = map[estado] || { bg: 'var(--w06)', color: 'var(--w40)', label: estado || '—' }
    return <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{s.label}</span>
  }

  const fmtMxn = (n) => n != null ? `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : '—'

  // Pestaña secundaria: más discreta que la de nivel 1, para que la jerarquía
  // se lea sin pensarlo.
  const subTab = (activa) => ({
    padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5,
    fontWeight: activa ? 700 : 500,
    border: `1px solid ${activa ? 'var(--w18)' : 'var(--w07)'}`,
    background: activa ? 'var(--sup)' : 'transparent',
    color: activa ? 'var(--tinta)' : 'var(--w45)',
    boxShadow: activa ? 'var(--activo-sombra)' : 'none',
    display: 'inline-block',
  })

  const inS = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 8, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }
  const lbS = { color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 4 }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 24px 60px' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: 'var(--tinta)', fontSize: 25, fontWeight: 800, letterSpacing: -0.6 }}>Pedidos</div>
          <div style={{ color: 'var(--w40)', fontSize: 13, marginTop: 3 }}>
            {modo === 'captura'
              ? 'Pedidos ya capturados: uno por uno, en lote, lo registrado y lo que espera tu aprobación'
              : 'Lo que el cliente pide por WhatsApp y todavía no es un pedido'}
          </div>
        </div>

        {/* Nivel 1: de quién viene el pedido */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            // "Por aprobar" cuenta en Captura: son pedidos que la IA ya
            // capturó y sólo esperan tu visto bueno. Una solicitud, en cambio,
            // todavía no es un pedido.
            ['captura', 'Captura', nPorAprobar],
            ['solicitudes', 'Solicitudes', nSolicitudes],
          ].map(([v, t, n]) => {
            const on = modo === v
            return (
              <button key={v} onClick={() => { setModo(v); setPestana(v === 'captura' ? 'capturar' : 'whatsapp'); setPagina(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '11px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14,
                  fontWeight: on ? 800 : 500, letterSpacing: -0.2,
                  border: `1px solid ${on ? 'rgba(193,85,58,0.55)' : 'var(--w10)'}`,
                  background: on ? 'rgba(193,85,58,0.15)' : 'transparent',
                  color: on ? 'var(--marca-t)' : 'var(--w50)',
                }}>
                {t}
                {n > 0 && (
                  <span style={{ background: on ? 'var(--marca)' : 'var(--ambar)', color: 'var(--sup)', fontSize: 10.5, fontWeight: 800, borderRadius: 20, padding: '2px 8px' }}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Nivel 2: qué hacer dentro de ese mundo */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {modo === 'captura' ? (
            <>
              {[['capturar', 'Uno por uno'], ['ver', 'Ver y editar']].map(([key, lbl]) => (
                <button key={key} onClick={() => { setPestana(key); setPagina(1) }}
                  style={subTab(pestana === key)}>{lbl}</button>
              ))}
              <Link href="/admin/pedidos/lote" style={{ ...subTab(false), textDecoration: 'none' }}>Captura en lote</Link>
              <button onClick={() => setPestana('aprobar')} style={subTab(pestana === 'aprobar')}>
                Por aprobar{nPorAprobar > 0 ? ` · ${nPorAprobar}` : ''}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPestana('whatsapp')} style={subTab(pestana === 'whatsapp')}>
                Pedidos específicos{nSolicitudes > 0 ? ` · ${nSolicitudes}` : ''}
              </button>
            </>
          )}
        </div>

        {pestana === 'capturar' && (
        <>
        {/* TC y estado */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">TC:</span>
            <input type="number" value={tc} onChange={e => setTc(parseFloat(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-white text-sm w-24" step="0.01" />
            <span className="text-gray-500 text-sm">MXN</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEstado('az')}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${estado === 'az' ? 'bg-[#c1553a] sobre-color' : 'bg-gray-800 text-gray-400'}`}>
              Arizona 8.6%
            </button>
            <button onClick={() => setEstado('ca')}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${estado === 'ca' ? 'bg-green-700 sobre-color' : 'bg-gray-800 text-gray-400'}`}>
              California 7.75%
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cliente</label>
              <select value={form.cliente_id} onChange={e => setForm({...form, cliente_id: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                <option value="">— Selecciona —</option>
                {clientes.filter(c => c.rol === 'cliente').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Entrega</label>
              <select value={form.entrega_id} onChange={e => setForm({...form, entrega_id: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                <option value="">— Selecciona —</option>
                {entregas.map(e => <option key={e.id} value={e.id}>{e.fecha_entrega}</option>)}
              </select>
            </div>
          </div>

          {/* Vendedor */}
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Vendedor que tomó el encargo</label>
            <select value={form.vendedor_id} onChange={e => setForm({...form, vendedor_id: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
              <option value="">— ¿Quién tomó este pedido? —</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.rol === 'admin' ? 'Admin' : 'Vendedor'})</option>)}
            </select>
          </div>

          {/* Foto del producto */}
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Foto del producto</label>
            {form.imagen_url ? (
              <div className="relative">
                <img src={form.imagen_url} alt="Producto" className="w-full max-h-48 object-contain rounded-xl border border-gray-700 bg-gray-900" />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => sugerirConIA()}
                    disabled={sugiriendoIA}
                    className="flex-1 bg-[#9b3f28] hover:bg-[#c1553a] disabled:opacity-50 sobre-color text-sm py-2 px-3 rounded-xl font-medium">
                    {sugiriendoIA ? 'Analizando...' : form.descripcion ? '✨ Re-analizar' : '✨ Sugerir nombre con IA'}
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, imagen_url: '' }))}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded-xl">
                    Quitar foto
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) subirFotoPedido(f) }}
                onPaste={e => { const f = e.clipboardData.files[0]; if (f) subirFotoPedido(f) }}
                className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-[#c1553a] transition-colors"
                tabIndex={0}
              >
                {subiendoFoto ? (
                  <p className="text-gray-400 text-sm">Subiendo foto...</p>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm mb-2">Arrastra la foto aquí, pega con Ctrl+V / Cmd+V</p>
                    <label className="cursor-pointer">
                      <span className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-4 rounded-xl">Seleccionar foto</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) subirFotoPedido(e.target.files[0]) }} />
                    </label>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Categoría</label>
            <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
              <option value="">— Sin categoría —</option>
              {categorias.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Descripción del producto</label>
            <input type="text" value={form.descripcion}
              onChange={e => setForm({...form, descripcion: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
              placeholder="Ej: Pantalón Nine West talla 10 azul oscuro" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Lugar de compra</label>
              <select value={form.lugar_compra} onChange={e => setForm({...form, lugar_compra: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
                {['Ross','TJ Maxx','Marshalls','Target','Walmart','Costco','Old Navy','Otro'].map(l =>
                  <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cantidad de piezas</label>
              <input type="number" value={form.cantidad}
                onChange={e => setForm({...form, cantidad: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm" min="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">
                Precio USD por pieza <span className="text-[#dd8a6c]">(unitario)</span>
              </label>
              <input type="number" value={form.precio_usd}
                onChange={e => setForm({...form, precio_usd: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                placeholder="0.00" step="0.01" />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">
                Precio de venta por pieza <span className="text-gray-500">(unitario)</span>
              </label>
              <input type="number" value={form.precio_venta_unitario}
                onChange={e => setForm({...form, precio_venta_unitario: e.target.value})}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
                placeholder="0" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Fecha de compra</label>
            <input type="date" value={form.fecha_compra}
              onChange={e => setForm({...form, fecha_compra: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm" />
          </div>

          {/* Cálculo automático */}
          {calc.costo_unitario > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 mb-4 text-sm">
              <div className="text-gray-500 text-xs uppercase mb-2">Desglose por pieza</div>
              <div className="flex justify-between text-gray-400 mb-1">
                <span>Precio USD × TC (${tc})</span>
                <span>${(parseFloat(form.precio_usd) * tc).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400 mb-1">
                <span>+ Impuesto {estado === 'az' ? 'AZ 8.6%' : 'CA 7.75%'}</span>
                <span>+${calc.impuesto.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white font-medium mb-3">
                <span>Costo unitario MXN</span>
                <span>${calc.costo_unitario.toFixed(2)}</span>
              </div>
              <div className="border-t border-gray-700 pt-3">
                <div className="text-gray-500 text-xs uppercase mb-2">Total × {form.cantidad} pieza{form.cantidad > 1 ? 's' : ''}</div>
                <div className="flex justify-between text-gray-400 mb-1">
                  <span>Costo total MXN</span>
                  <span>${calc.costo_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400 mb-1">
                  <span>Precio de venta total</span>
                  <span>${calc.venta_total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium mt-2">
                  <span className="text-green-400">Utilidad total</span>
                  <span className={calc.utilidad >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ${calc.utilidad.toFixed(2)} ({calc.margen.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-1">Notas internas</label>
            <input type="text" value={form.notas}
              onChange={e => setForm({...form, notas: e.target.value})}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
              placeholder="Notas opcionales..." />
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.apartado_fragil || false}
                onChange={e => setForm({...form, apartado_fragil: e.target.checked})}
                className="w-4 h-4 accent-yellow-400"
              />
              <span className="text-yellow-400 font-bold text-sm">⚠️ APARTADOS / FRÁGIL</span>
            </label>
          </div>

          {msg && (
            <div className={`text-sm mb-3 ${msg.includes('✓') ? 'text-green-400' : 'text-yellow-400'}`}>
              {msg}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => guardar(false)} disabled={cargando}
              className="bg-green-700 hover:bg-green-600 sobre-color px-6 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              {cargando ? 'Guardando...' : '✓ Guardar pedido'}
            </button>
            <button onClick={() => guardar(true)} disabled={cargando}
              className="bg-[#9b3f28] hover:bg-[#c1553a] sobre-color px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              Guardar y capturar otro
            </button>
          </div>
        </div>
        </>
        )}

        {/* ─── Pestaña Ver / Editar ─── */}
        {/* Pedidos específicos que pidieron por WhatsApp. Antes era su propia
            entrada en el menú ("Pendientes"); se trajo aquí para no tener el
            mismo concepto en dos lugares del menú. */}
        {pestana === 'whatsapp' && <PedidosWhatsApp embebido />}
        {pestana === 'aprobar' && <PorAprobar embebido />}

        {pestana === 'ver' && (
          <div>
            {/* Filtros */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Cliente</label>
                  <input type="text" value={filtroCliente} onChange={e => { setFiltroCliente(e.target.value); setPagina(1) }}
                    placeholder="Buscar cliente..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Producto</label>
                  <input type="text" value={filtroDescripcion} onChange={e => { setFiltroDescripcion(e.target.value); setPagina(1) }}
                    placeholder="Buscar descripción..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Fecha compra</label>
                  <input type="date" value={filtroFecha} onChange={e => { setFiltroFecha(e.target.value); setPagina(1) }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none" />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Estado</label>
                  <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPagina(1) }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none">
                    {['Todos', 'comprado', 'camino', 'listo', 'Entregado', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Entrega</label>
                  <select value={filtroEntrega} onChange={e => { setFiltroEntrega(e.target.value); setPagina(1) }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none">
                    <option value="">Todas</option>
                    <option value="sin_entrega">— Sin entrega asignada —</option>
                    {entregas.map(en => <option key={en.id} value={en.id}>{en.fecha_entrega}{en.nota ? ` · ${en.nota}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Categoría</label>
                  <select value={filtroCategoria} onChange={e => { setFiltroCategoria(e.target.value); setPagina(1) }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none">
                    <option value="">Todas</option>
                    {categorias.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setFiltroCliente(''); setFiltroDescripcion(''); setFiltroFecha(''); setFiltroEstado('Todos'); setFiltroEntrega(''); setFiltroCategoria(''); setPagina(1) }}
                  className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1 rounded-lg bg-gray-800 border border-gray-700">
                  Limpiar filtros
                </button>
                <button onClick={cargarTodosPedidos} className="text-xs text-[#dd8a6c] hover:text-[#dd8a6c] px-3 py-1 rounded-lg bg-[#4a1b0c]/20 border border-[#6d2a19]/40">
                  🔄 Recargar
                </button>
              </div>
            </div>

            {/* Contador y paginación */}
            <div className="flex justify-between items-center mb-3 text-xs text-gray-400">
              <span>
                {cargandoTabla ? 'Cargando...' : `Mostrando ${totalPedidos === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, totalPedidos)} de ${totalPedidos} pedidos`}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                  className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-40 hover:bg-gray-700">
                  ← Anterior
                </button>
                <span className="px-3 py-1 bg-gray-800 rounded-lg border border-gray-700">{pagina} / {totalPaginas || 1}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
                  className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-40 hover:bg-gray-700">
                  Siguiente →
                </button>
              </div>
            </div>

            {/* Tabla */}
            {cargandoTabla ? (
              <div className="text-center text-gray-500 text-sm py-16">Cargando pedidos...</div>
            ) : pedidosPagina.length === 0 ? (
              <div className="text-center text-gray-600 text-sm py-16 bg-gray-900 rounded-2xl border border-gray-800">Sin resultados con los filtros actuales</div>
            ) : (
              <div className="space-y-1">
                {/* Cabecera */}
                <div className="hidden md:grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 text-gray-500 text-xs uppercase tracking-wide">
                  <span>Cliente / Fecha</span><span>Descripción</span><span className="text-right">Cant.</span>
                  <span className="text-right">USD</span><span className="text-right">Venta MXN</span>
                  <span className="text-center">Estado</span><span className="text-center">Acciones</span>
                </div>

                {pedidosPagina.map(p => (
                  <div key={p.id}>
                    {/* Fila resumen */}
                    {editandoPedido !== p.id && (
                      <div className="grid grid-cols-[2fr_3fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-all">
                        <div>
                          <div className="text-white text-xs font-semibold">{p.clientes?.nombre || '—'}</div>
                          <div className="text-gray-500 text-[10px] mt-0.5">{p.fecha_compra || '—'}</div>
                        </div>
                        <div className="text-gray-300 text-xs truncate" title={p.descripcion}>{p.descripcion || '—'}
                          {p.apartado_fragil && (
                            <span className="inline-block bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded mt-1">
                              ⚠️ APARTADOS / FRÁGIL
                            </span>
                          )}
                        </div>
                        <div className="text-gray-300 text-xs text-right">{p.cantidad ?? 1}</div>
                        <div className="text-amber-400 text-xs font-mono text-right">{p.precio_usd != null ? `$${p.precio_usd}` : '—'}</div>
                        <div className="text-green-400 text-xs font-mono font-bold text-right">{fmtMxn(p.precio_venta)}</div>
                        <div className="flex justify-center">{estadoBadge(p.estado)}</div>
                        <div className="flex gap-1.5">
                          <button onClick={() => abrirEditarPedido(p)}
                            className="px-2.5 py-1 rounded-lg bg-[#4a1b0c]/20 border border-[#6d2a19]/40 text-[#dd8a6c] text-xs font-semibold hover:bg-[#4a1b0c]/40">
                            ✏️
                          </button>
                          <button onClick={() => eliminarPedidoTabla(p.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-900/10 border border-red-900/30 text-red-500 text-xs font-semibold hover:bg-red-900/25">
                            🗑️
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Panel edición inline */}
                    {editandoPedido === p.id && (
                      <div className="bg-[#4a1b0c]/30 border border-[#6d2a19]/30 rounded-xl p-4">
                        <div className="text-[#dd8a6c] text-xs uppercase tracking-widest font-bold mb-3">✏️ Editar pedido</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                          <div>
                            <label style={lbS}>Cliente</label>
                            <select value={editFormPedido.cliente_id} onChange={ev => setEditFormPedido({ ...editFormPedido, cliente_id: ev.target.value })} style={inS}>
                              <option value="">— seleccionar —</option>
                              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbS}>Entrega</label>
                            <select value={editFormPedido.entrega_id} onChange={ev => setEditFormPedido({ ...editFormPedido, entrega_id: ev.target.value })} style={inS}>
                              <option value="">— seleccionar —</option>
                              {entregas.map(en => <option key={en.id} value={en.id}>{en.fecha_entrega}{en.nota ? ` · ${en.nota}` : ''}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbS}>Categoría</label>
                            <select value={editFormPedido.categoria} onChange={ev => setEditFormPedido({ ...editFormPedido, categoria: ev.target.value })} style={inS}>
                              <option value="">— Sin categoría —</option>
                              {categorias.map(cat => <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>)}
                            </select>
                          </div>
                          <div className="lg:col-span-2">
                            <label style={lbS}>Descripción</label>
                            <input type="text" value={editFormPedido.descripcion} onChange={ev => setEditFormPedido({ ...editFormPedido, descripcion: ev.target.value })} style={inS} />
                          </div>
                          <div>
                            <label style={lbS}>Lugar de compra</label>
                            <select value={editFormPedido.lugar_compra} onChange={ev => setEditFormPedido({ ...editFormPedido, lugar_compra: ev.target.value })} style={inS}>
                              {['Ross', 'Walmart', 'Target', 'Costco', 'Amazon', 'Burlington', 'TJ Maxx', 'Otro'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbS}>Fecha compra</label>
                            <input type="date" value={editFormPedido.fecha_compra} onChange={ev => setEditFormPedido({ ...editFormPedido, fecha_compra: ev.target.value })} style={inS} />
                          </div>
                          <div>
                            <label style={lbS}>Cantidad</label>
                            <input type="number" value={editFormPedido.cantidad} onChange={ev => setEditFormPedido({ ...editFormPedido, cantidad: ev.target.value })} style={inS} />
                          </div>
                          {/* ── Cotizador ── */}
                          {(() => {
                            const usd = parseFloat(editFormPedido.precio_usd) || 0
                            const tcVal = parseFloat(editFormPedido.tipo_cambio) || 0
                            const impPct = parseFloat(editFormPedido.impuesto_pct) || 0
                            const imp = impPct / 100
                            const costoCalc = usd > 0 && tcVal > 0 ? usd * (1 + imp) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                            const venta = parseFloat(editFormPedido.precio_venta) || 0
                            const util = venta - costoCalc
                            const margen = venta > 0 ? (util / venta) * 100 : 0

                            const setTax = (tipo) => {
                              const pct = tipo === 'arizona' ? 8.6 : tipo === 'california' ? 7.75 : parseFloat(editTaxDenogPct) || 0
                              const newImp = pct / 100
                              const newCosto = usd > 0 && tcVal > 0 ? usd * (1 + newImp) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                              const newUtil = venta - newCosto
                              setEditTaxTipo(tipo)
                              setEditFormPedido(prev => ({ ...prev, impuesto_pct: pct, costo_mxn: newCosto, utilidad: newUtil }))
                            }

                            const handleUsd = (val) => {
                              const newUsd = parseFloat(val) || 0
                              const newCosto = newUsd > 0 && tcVal > 0 ? newUsd * (1 + imp) * tcVal : 0
                              const newUtil = venta - newCosto
                              setEditFormPedido(prev => ({ ...prev, precio_usd: val, costo_mxn: newCosto || prev.costo_mxn, utilidad: newUtil }))
                            }

                            const handleTc = (val) => {
                              const newTc = parseFloat(val) || 0
                              const newCosto = usd > 0 && newTc > 0 ? usd * (1 + imp) * newTc : 0
                              const newUtil = venta - newCosto
                              setEditFormPedido(prev => ({ ...prev, tipo_cambio: val, costo_mxn: newCosto || prev.costo_mxn, utilidad: newUtil }))
                            }

                            const handleDenogPct = (val) => {
                              setEditTaxDenogPct(val)
                              const pct = parseFloat(val) || 0
                              const newImp = pct / 100
                              const newCosto = usd > 0 && tcVal > 0 ? usd * (1 + newImp) * tcVal : parseFloat(editFormPedido.costo_mxn) || 0
                              const newUtil = venta - newCosto
                              setEditFormPedido(prev => ({ ...prev, impuesto_pct: pct, costo_mxn: newCosto, utilidad: newUtil }))
                            }

                            const handleVenta = (val) => {
                              const newVenta = parseFloat(val) || 0
                              const newUtil = newVenta - costoCalc
                              setEditFormPedido(prev => ({ ...prev, precio_venta: val, utilidad: newUtil }))
                            }

                            return (
                              <>
                                <div className="lg:col-span-4 bg-gray-950/60 rounded-xl p-3 border border-gray-700/50 space-y-3">
                                  <div className="text-[#dd8a6c] text-[10px] uppercase tracking-widest font-bold">💱 Cotizador</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label style={lbS}>Precio USD</label>
                                      <input type="number" step="0.01" value={editFormPedido.precio_usd} onChange={ev => handleUsd(ev.target.value)} style={inS} placeholder="Ej. 14.99" />
                                    </div>
                                    <div>
                                      <label style={lbS}>Tipo de cambio</label>
                                      <input type="number" step="0.01" value={editFormPedido.tipo_cambio} onChange={ev => handleTc(ev.target.value)} style={inS} />
                                    </div>
                                  </div>
                                  <div>
                                    <label style={lbS}>Impuesto</label>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {[['arizona','Arizona 8.6%'],['california','California 7.75%'],['denog','Tax Denog']].map(([k,lbl]) => (
                                        <button key={k} type="button" onClick={() => setTax(k)}
                                          style={{ padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${editTaxTipo === k ? 'rgba(193,85,58,0.5)' : 'var(--w10)'}`, background: editTaxTipo === k ? 'rgba(193,85,58,0.2)' : 'var(--w04)', color: editTaxTipo === k ? 'var(--marca-t)' : 'var(--w45)' }}>
                                          {lbl}
                                        </button>
                                      ))}
                                    </div>
                                    {editTaxTipo === 'denog' && (
                                      <input type="number" step="0.01" value={editTaxDenogPct} onChange={ev => handleDenogPct(ev.target.value)} placeholder="Porcentaje Ej. 10.5" style={{ ...inS, marginTop: 6 }} />
                                    )}
                                  </div>
                                  {usd > 0 && tcVal > 0 && (
                                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px', fontSize: 11, display: 'grid', gap: 3 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}>
                                        <span>Precio USD</span><span style={{ fontFamily: 'monospace' }}>${usd.toFixed(2)}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}>
                                        <span>+ Impuesto ({impPct.toFixed(2)}%)</span><span style={{ fontFamily: 'monospace' }}>+${(usd * imp).toFixed(2)}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--w40)' }}>
                                        <span>× TC {tcVal}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tinta)', fontWeight: 700, borderTop: '1px solid var(--w08)', paddingTop: 4, marginTop: 2 }}>
                                        <span>= Costo MXN</span><span style={{ fontFamily: 'monospace', color: 'var(--ambar)' }}>${costoCalc.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label style={lbS}>Precio venta MXN</label>
                                  <input type="number" step="0.01" value={editFormPedido.precio_venta} onChange={ev => handleVenta(ev.target.value)} style={inS} />
                                  {editFormPedido.precio_venta && costoCalc > 0 && (
                                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11 }}>
                                      <span style={{ color: util >= 0 ? 'var(--verde)' : 'var(--rojo-t)' }}>Utilidad: ${util.toFixed(2)}</span>
                                      <span style={{ color: margen >= 20 ? 'var(--verde)' : margen >= 0 ? 'var(--ambar)' : 'var(--rojo-t)' }}>Margen: {margen.toFixed(1)}%</span>
                                    </div>
                                  )}
                                </div>
                              </>
                            )
                          })()}
                          <div>
                            <label style={lbS}>Estado</label>
                            <select value={editFormPedido.estado} onChange={ev => setEditFormPedido({ ...editFormPedido, estado: ev.target.value })} style={inS}>
                              {['comprado', 'camino', 'listo', 'Entregado', 'Cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbS}>Vendedor</label>
                            <select value={editFormPedido.vendedor_id} onChange={ev => setEditFormPedido({ ...editFormPedido, vendedor_id: ev.target.value })} style={inS}>
                              <option value="">— ninguno —</option>
                              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label style={lbS}>Notas</label>
                            <input type="text" value={editFormPedido.notas} onChange={ev => setEditFormPedido({ ...editFormPedido, notas: ev.target.value })} style={inS} placeholder="Opcional" />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editFormPedido.apartado_fragil || false}
                              onChange={e => setEditFormPedido({...editFormPedido, apartado_fragil: e.target.checked})}
                              className="w-4 h-4 accent-yellow-400"
                            />
                            <span className="text-yellow-400 font-bold text-sm">⚠️ APARTADOS / FRÁGIL</span>
                          </label>
                        </div>
                        {pedidoMsg && <div className="text-red-400 text-xs mb-2">{pedidoMsg}</div>}
                        <div className="flex gap-2">
                          <button onClick={guardarPedidoEdit} disabled={guardandoPedido}
                            className="bg-[#c1553a] hover:bg-[#dd8a6c] sobre-color px-5 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
                            {guardandoPedido ? 'Guardando...' : '✓ Guardar'}
                          </button>
                          <button onClick={() => setEditandoPedido(null)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-400 px-5 py-2 rounded-lg text-xs border border-gray-700">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Paginación inferior */}
            {totalPaginas > 1 && (
              <div className="flex justify-center gap-2 mt-4 text-xs text-gray-400">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                  className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-40 hover:bg-gray-700">
                  ← Anterior
                </button>
                <span className="px-4 py-2 bg-gray-800 rounded-lg border border-gray-700">{pagina} / {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
                  className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 disabled:opacity-40 hover:bg-gray-700">
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}