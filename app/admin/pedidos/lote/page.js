'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const LUGARES = ['Ross', 'TJ Maxx', 'Marshalls', 'Target', 'Walmart', 'Costco', 'Old Navy', 'Otro']
const HOY = new Date().toISOString().split('T')[0]
const fmt = n => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })

const inp = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10, padding: '10px 14px', color: 'var(--tinta)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--w50)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }

export default function CapturarLote() {
  const router = useRouter()
  const [paso, setPaso] = useState(1)

  const [entregas, setEntregas] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [categorias, setCategorias] = useState([])

  const [config, setConfig] = useState({
    tipo_cambio: '', impuesto_pct: '8.6', lugar_compra: 'Ross',
    fecha_compra: HOY, entrega_id: '', vendedor_id: ''
  })

  const [cola, setCola] = useState([])
  const colaRef = useRef([])
  const procesandoRef = useRef(new Set())
  useEffect(() => { colaRef.current = cola }, [cola])

  const [indice, setIndice] = useState(0)
  const [form, setForm] = useState({ cliente_id: '', cantidad: 1, precio_usd: '', precio_venta: '', descripcion: '', categoria: '' })
  const [busq, setBusq] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [salvados, setSalvados] = useState({})
  const [editando, setEditando] = useState(false)
  const [nuevoClienteForm, setNuevoClienteForm] = useState(null) // {nombre, telefono} | null
  const [creandoCliente, setCreandoCliente] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/entregas').then(r => r.json()),
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/categorias').then(r => r.json()),
    ]).then(([e, c, cat]) => {
      if (e.ok) setEntregas(e.entregas || [])
      if (c.ok) {
        setClientes(c.clientes || [])
        setVendedores((c.clientes || []).filter(x => ['admin', 'vendedor'].includes(x.rol)))
      }
      if (cat.ok) setCategorias(cat.categorias || [])
    })
  }, [])

  const tc = parseFloat(config.tipo_cambio) || 0
  const imp = parseFloat(config.impuesto_pct) || 0
  const cant = Number(form.cantidad) || 1
  const usdUnit = parseFloat(form.precio_usd) || 0
  const costoMxnUnit = usdUnit > 0 && tc > 0 ? usdUnit * (1 + imp / 100) * tc : 0
  const costoMxn = costoMxnUnit * cant
  const ventaUnit = parseFloat(form.precio_venta) || 0
  const venta = ventaUnit * cant
  const usd = usdUnit * cant
  const utilidad = venta > 0 && costoMxn > 0 ? venta - costoMxn : 0

  const clientesFilt = useMemo(() => {
    const q = busq.trim().toLowerCase()
    if (!q || form.cliente_id) return []
    return clientes.filter(c => c.rol === 'cliente' && (c.nombre?.toLowerCase().includes(q) || c.telefono?.includes(q))).slice(0, 6)
  }, [clientes, busq, form.cliente_id])

  const crearClienteInline = async () => {
    if (!nuevoClienteForm?.nombre || !nuevoClienteForm?.telefono) return
    setCreandoCliente(true)
    try {
      const res = await fetch('/api/clientes/crear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoClienteForm.nombre,
          telefono: nuevoClienteForm.telefono,
          usuario: nuevoClienteForm.telefono,
          password: nuevoClienteForm.telefono,
          limite_credito: 0,
          requiere_anticipo: false,
        })
      }).then(r => r.json())
      if (res.ok) {
        setClientes(prev => [...prev, res.cliente])
        setForm(p => ({ ...p, cliente_id: res.cliente.id }))
        setBusq(res.cliente.nombre)
        setNuevoClienteForm(null)
      } else {
        alert('Error al crear cliente: ' + res.mensaje)
      }
    } catch (err) { alert(err.message) }
    setCreandoCliente(false)
  }

  const procesarFoto = useCallback(async (idx) => {
    if (procesandoRef.current.has(idx)) return
    const foto = colaRef.current[idx]
    if (!foto || foto.estado !== 'pendiente') return
    procesandoRef.current.add(idx)
    setCola(p => p.map((f, i) => i === idx ? { ...f, estado: 'subiendo' } : f))
    try {
      const d = await fetch('/api/catalogo/subir-imagen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: foto.file.type, carpeta: 'pedidos' })
      }).then(r => r.json())
      if (!d.ok) throw new Error(d.mensaje)
      const fd = new FormData()
      fd.append('', foto.file, foto.file.name)
      const up = await fetch(d.signedUrl, { method: 'PUT', body: fd })
      if (!up.ok) throw new Error('Error al subir')
      setCola(p => p.map((f, i) => i === idx ? { ...f, estado: 'analizando', imagen_url: d.publicUrl } : f))
      const res = await fetch('/api/pedidos/sugerir-nombre', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen_url: d.publicUrl })
      }).then(r => r.json())
      setCola(p => p.map((f, i) => i === idx ? {
        ...f, estado: 'listo', imagen_url: d.publicUrl,
        descripcion: res.ok ? (res.descripcion || '') : '',
        categoria: res.ok ? (res.categoria || '') : '',
      } : f))
    } catch (err) {
      setCola(p => p.map((f, i) => i === idx ? { ...f, estado: 'error', error: err.message } : f))
    } finally {
      procesandoRef.current.delete(idx)
    }
  }, [])

  // Disparar procesamiento de foto actual y la siguiente
  useEffect(() => {
    if (paso !== 3) return
    ;[indice, indice + 1].forEach(idx => {
      if (idx < colaRef.current.length) procesarFoto(idx)
    })
  }, [paso, indice, procesarFoto])

  // Cuando la foto actual queda lista, pre-llenar el form (solo si no estamos editando)
  useEffect(() => {
    if (paso !== 3 || editando) return
    const foto = cola[indice]
    if (foto?.estado === 'listo' || foto?.estado === 'error') {
      setForm({ cliente_id: '', cantidad: 1, precio_usd: '', precio_venta: '', descripcion: foto?.descripcion || '', categoria: foto?.categoria || '' })
      setBusq('')
    }
  }, [cola[indice]?.estado, indice, paso, editando])

  const handleFiles = files => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    setCola(arr.map(file => ({
      id: Math.random().toString(36).slice(2),
      file, localUrl: URL.createObjectURL(file),
      estado: 'pendiente', imagen_url: '', descripcion: '', categoria: '', error: ''
    })))
    setSalvados({})
    setIndice(0)
    setEditando(false)
  }

  const avanzar = () => {
    const sig = indice + 1
    if (sig >= cola.length) setPaso(4)
    else { setIndice(sig); setEditando(false) }
  }

  const saltar = () => avanzar()

  const regresar = () => {
    if (indice === 0) return
    const prev = indice - 1
    setIndice(prev)
    setEditando(true)
    const saved = salvados[prev]
    if (saved) {
      setForm({
        cliente_id: saved.cliente_id || '',
        cantidad: saved.cantidad || 1,
        precio_usd: saved._precio_usd_unit ?? '',
        precio_venta: saved._precio_venta_unit ?? '',
        descripcion: saved.descripcion || '',
        categoria: saved.categoria || '',
      })
      const c = clientes.find(cl => cl.id === saved.cliente_id)
      setBusq(c?.nombre || '')
    } else {
      const foto = cola[prev]
      setForm({ cliente_id: '', cantidad: 1, precio_usd: '', precio_venta: '', descripcion: foto?.descripcion || '', categoria: foto?.categoria || '' })
      setBusq('')
    }
  }

  const confirmar = async () => {
    if (!form.cliente_id) { alert('Selecciona un cliente'); return }
    if (!form.precio_venta) { alert('Ingresa el precio de venta'); return }
    setGuardando(true)
    const body = {
      cliente_id: form.cliente_id,
      entrega_id: config.entrega_id || null,
      vendedor_id: config.vendedor_id || null,
      descripcion: form.descripcion,
      categoria: form.categoria || null,
      lugar_compra: config.lugar_compra,
      cantidad: cant,
      fecha_compra: config.fecha_compra,
      precio_usd: usd || null,
      tipo_cambio: tc || null,
      impuesto_pct: imp || null,
      costo_mxn: costoMxn || null,
      precio_venta: venta,
      utilidad: utilidad || null,
      imagen_url: cola[indice]?.imagen_url || null,
      notas: null,
    }
    // _unit fields stored only in salvados for form restoration when going back
    const salvadoExtra = { _precio_usd_unit: usdUnit, _precio_venta_unit: ventaUnit }
    try {
      if (editando && salvados[indice]) {
        const res = await fetch('/api/pedidos/actualizar-pedido', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: salvados[indice].id, ...body })
        }).then(r => r.json())
        if (res.ok) {
          setSalvados(p => ({ ...p, [indice]: { ...body, ...salvadoExtra, id: salvados[indice].id } }))
          setEditando(false)
          avanzar()
        } else alert('Error: ' + res.mensaje)
      } else {
        const res = await fetch('/api/pedidos/crear', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(r => r.json())
        if (res.ok) {
          setSalvados(p => ({ ...p, [indice]: { ...body, ...salvadoExtra, id: res.pedido.id } }))
          avanzar()
        } else alert('Error: ' + res.mensaje)
      }
    } catch (err) { alert(err.message) }
    setGuardando(false)
  }

  const fmtEntrega = e => {
    const d = new Date(e.fecha_entrega + 'T12:00:00')
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}${e.nota ? ` · ${e.nota}` : ''}`
  }

  const totalGuardados = Object.keys(salvados).length
  const fotoActual = cola[indice]
  const fotoSig = cola[indice + 1]
  const procesando = fotoActual?.estado === 'subiendo' || fotoActual?.estado === 'analizando'
  const listo = fotoActual?.estado === 'listo' || fotoActual?.estado === 'error'
  const fotoDisplay = fotoActual?.imagen_url || fotoActual?.localUrl

  // ─── PASO 1: CONFIG ─────────────────────────────────────────────────────────
  if (paso === 1) return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', padding: '32px 24px', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      <button onClick={() => router.push('/admin/pedidos')} style={{ background: 'transparent', border: 'none', color: 'var(--w50)', fontSize: 14, cursor: 'pointer', marginBottom: 24, padding: 0 }}>
        ← Volver a Pedidos
      </button>
      <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, marginBottom: 4 }}>Captura en lote</h1>
      <div style={{ fontSize: 13, color: 'var(--w40)', marginBottom: 28 }}>
        Configura los datos fijos que aplican a todos los pedidos de esta sesión.
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={lbl}>Tipo de cambio (USD → MXN)</label>
            <input style={inp} type="number" step="0.01" value={config.tipo_cambio}
              onChange={e => setConfig(p => ({ ...p, tipo_cambio: e.target.value }))} placeholder="Ej: 17.50" />
          </div>
          <div>
            <label style={lbl}>Impuesto</label>
            <select style={inp} value={config.impuesto_pct}
              onChange={e => setConfig(p => ({ ...p, impuesto_pct: e.target.value }))}>
              <option value="8.6">Arizona 8.6%</option>
              <option value="7.75">California 7.75%</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={lbl}>Lugar de compra</label>
            <select style={inp} value={config.lugar_compra} onChange={e => setConfig(p => ({ ...p, lugar_compra: e.target.value }))}>
              {LUGARES.map(l => <option key={l} style={{ background: 'var(--sup)' }}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha de compra</label>
            <input style={inp} type="date" value={config.fecha_compra}
              onChange={e => setConfig(p => ({ ...p, fecha_compra: e.target.value }))} />
          </div>
        </div>
        <div>
          <label style={lbl}>Entrega</label>
          <select style={inp} value={config.entrega_id} onChange={e => setConfig(p => ({ ...p, entrega_id: e.target.value }))}>
            <option value="">— Selecciona la fecha de entrega —</option>
            {entregas.filter(e => e.estado === 'futura').map(e => (
              <option key={e.id} value={e.id} style={{ background: 'var(--sup)' }}>{fmtEntrega(e)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Vendedor que tomó los encargos</label>
          <select style={inp} value={config.vendedor_id} onChange={e => setConfig(p => ({ ...p, vendedor_id: e.target.value }))}>
            <option value="">— Selecciona vendedor —</option>
            {vendedores.map(v => <option key={v.id} value={v.id} style={{ background: 'var(--sup)' }}>{v.nombre}</option>)}
          </select>
        </div>
        <button
          onClick={() => {
            if (!config.tipo_cambio) { alert('Ingresa el tipo de cambio'); return }
            if (!config.entrega_id) { alert('Selecciona una entrega'); return }
            setPaso(2)
          }}
          style={{ background: 'var(--marca)', color: '#fff', border: 'none', borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 800, cursor: 'pointer', marginTop: 8 }}
        >
          Continuar → Seleccionar fotos
        </button>
      </div>
    </div>
  )

  // ─── PASO 2: SELECCIÓN DE FOTOS ─────────────────────────────────────────────
  if (paso === 2) return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', padding: '32px 24px', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      <button onClick={() => setPaso(1)} style={{ background: 'transparent', border: 'none', color: 'var(--w50)', fontSize: 14, cursor: 'pointer', marginBottom: 24, padding: 0 }}>
        ← Volver a configuración
      </button>
      <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, marginBottom: 4 }}>Selecciona las fotos</h1>
      <div style={{ fontSize: 15, color: 'var(--w50)', marginBottom: 32 }}>
        Selecciona todas las fotos del día de una sola vez desde tu galería.
      </div>

      <div style={{ maxWidth: 560 }}>
        {cola.length === 0 ? (
          <label style={{ display: 'block', border: '2px dashed rgba(193,85,58,0.4)', borderRadius: 16, padding: '60px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(193,85,58,0.04)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>📸</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Toca aquí para seleccionar fotos</div>
            <div style={{ fontSize: 14, color: 'var(--w50)' }}>Puedes seleccionar múltiples fotos a la vez</div>
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
          </label>
        ) : (
          <>
            <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{cola.length} fotos seleccionadas</div>
                <div style={{ fontSize: 13, color: 'var(--w50)', marginTop: 2 }}>Listas para procesar</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
              {cola.slice(0, 15).map(f => (
                <img key={f.id} src={f.localUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0, border: '1px solid var(--w10)' }} />
              ))}
              {cola.length > 15 && (
                <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--w05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, color: 'var(--w60)' }}>
                  +{cola.length - 15}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1, background: 'var(--w05)', border: '1px solid var(--w12)', color: 'var(--w70)', borderRadius: 12, padding: 14, textAlign: 'center', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Cambiar fotos
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
              </label>
              <button
                onClick={() => { setPaso(3); setIndice(0) }}
                style={{ flex: 2, background: 'var(--marca)', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
              >
                Iniciar captura ({cola.length} fotos) →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ─── PASO 3: REVISIÓN ───────────────────────────────────────────────────────
  if (paso === 3) return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Barra superior */}
      <div style={{ background: 'var(--w03)', borderBottom: '1px solid var(--w08)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          Pedido <span style={{ color: 'var(--marca)', fontSize: 18, fontWeight: 900 }}>{indice + 1}</span>
          <span style={{ color: 'var(--w40)' }}> / {cola.length}</span>
        </div>
        <div style={{ flex: 1, minWidth: 120, maxWidth: 360, height: 6, borderRadius: 999, background: 'var(--w08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--marca)', width: `${(indice / cola.length) * 100}%`, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--w45)' }}>✓ {totalGuardados} guardados</div>
        {editando && (
          <div style={{ background: 'rgba(250,204,21,0.15)', color: 'var(--ambar)', border: '1px solid rgba(250,204,21,0.4)', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
            ✏️ EDITANDO PEDIDO ANTERIOR
          </div>
        )}
        {fotoSig && (fotoSig.estado === 'subiendo' || fotoSig.estado === 'analizando') && (
          <div style={{ fontSize: 12, color: 'var(--w35)' }}>⟳ Preparando siguiente...</div>
        )}
      </div>

      {/* Contenido principal */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', overflow: 'hidden' }}>

        {/* Foto */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', padding: 32, overflow: 'hidden' }}>
          {procesando ? (
            <div style={{ textAlign: 'center' }}>
              {fotoActual?.localUrl && (
                <img src={fotoActual.localUrl} alt="" style={{ maxWidth: 320, maxHeight: '50vh', objectFit: 'contain', borderRadius: 16, opacity: 0.35, marginBottom: 20 }} />
              )}
              <div style={{ fontSize: 36, marginBottom: 12 }}>
                {fotoActual?.estado === 'subiendo' ? '📤' : '🤖'}
              </div>
              <div style={{ fontSize: 15, color: 'var(--w60)', fontWeight: 600 }}>
                {fotoActual?.estado === 'subiendo' ? 'Subiendo foto...' : 'Analizando con IA...'}
              </div>
            </div>
          ) : fotoDisplay ? (
            <img src={fotoDisplay} alt="Producto"
              style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 130px)', objectFit: 'contain', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
          ) : null}
        </div>

        {/* Formulario */}
        <div style={{ background: 'var(--sup)', borderLeft: '1px solid var(--w08)', padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Descripción */}
          <div>
            <label style={lbl}>Descripción del producto</label>
            <input style={inp} type="text" value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej: Pantalón Nike talla M azul"
              disabled={procesando} />
          </div>

          {/* Categoría */}
          <div>
            <label style={lbl}>Categoría</label>
            <select style={inp} value={form.categoria}
              onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
              disabled={procesando}>
              <option value="">— Sin categoría —</option>
              {categorias.map(c => <option key={c.id} value={c.nombre} style={{ background: 'var(--sup)' }}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label style={lbl}>Cliente {form.cliente_id && '✓'}</label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inp, borderColor: form.cliente_id ? 'var(--marca)' : 'var(--w12)' }}
                type="text" value={busq}
                onChange={e => { setBusq(e.target.value); setForm(p => ({ ...p, cliente_id: '' })); setNuevoClienteForm(null) }}
                placeholder="Buscar por nombre o teléfono..."
                disabled={procesando} />
              {(clientesFilt.length > 0 || (busq.trim() && !form.cliente_id)) && !nuevoClienteForm && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--sup-2)', border: '1px solid var(--w12)', borderRadius: 10, marginTop: 4, zIndex: 20, overflow: 'hidden' }}>
                  {clientesFilt.map(c => (
                    <div key={c.id}
                      onClick={() => { setForm(p => ({ ...p, cliente_id: c.id })); setBusq(c.nombre) }}
                      style={{ padding: '10px 14px', fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--w06)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(193,85,58,0.18)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span>{c.nombre}</span>
                      <span style={{ color: 'var(--w40)', fontSize: 12 }}>{c.telefono}</span>
                    </div>
                  ))}
                  <div
                    onClick={() => setNuevoClienteForm({ nombre: busq.trim(), telefono: '' })}
                    style={{ padding: '10px 14px', fontSize: 14, cursor: 'pointer', color: 'var(--verde)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, borderTop: clientesFilt.length > 0 ? '1px solid var(--w08)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(52,211,153,0.12)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    ＋ Crear cliente nuevo
                  </div>
                </div>
              )}
            </div>
            {/* Mini-form para crear cliente */}
            {nuevoClienteForm && (
              <div style={{ marginTop: 10, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--verde)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nuevo cliente</div>
                <input style={inp} type="text" placeholder="Nombre completo"
                  value={nuevoClienteForm.nombre}
                  onChange={e => setNuevoClienteForm(p => ({ ...p, nombre: e.target.value }))} />
                <input style={inp} type="tel" placeholder="Celular (10 dígitos)"
                  value={nuevoClienteForm.telefono}
                  onChange={e => setNuevoClienteForm(p => ({ ...p, telefono: e.target.value }))} />
                <div style={{ fontSize: 11, color: 'var(--w35)' }}>
                  El usuario y contraseña iniciales serán el número de celular. Límite de crédito: $0.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setNuevoClienteForm(null)} disabled={creandoCliente}
                    style={{ flex: 1, background: 'transparent', color: 'var(--w50)', border: '1px solid var(--w15)', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={crearClienteInline} disabled={creandoCliente || !nuevoClienteForm.nombre || !nuevoClienteForm.telefono}
                    style={{ flex: 2, background: creandoCliente ? 'rgba(52,211,153,0.3)' : 'var(--verde)', color: '#0f172a', border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                    {creandoCliente ? 'Creando...' : '✓ Crear y seleccionar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label style={lbl}>Cantidad de piezas</label>
            <input style={inp} type="number" min="1" value={form.cantidad}
              onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))}
              disabled={procesando} />
          </div>

          {/* Costo USD */}
          <div>
            <label style={lbl}>Costo USD <span style={{ color: 'var(--w35)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>por pieza</span></label>
            <input style={inp} type="number" step="0.01" value={form.precio_usd}
              onChange={e => setForm(p => ({ ...p, precio_usd: e.target.value }))}
              placeholder="0.00" disabled={procesando} />
            {costoMxnUnit > 0 && (
              <div style={{ fontSize: 12, color: 'var(--w40)', marginTop: 5, lineHeight: 1.6 }}>
                1 pza = ${fmt(costoMxnUnit)} MXN
                {cant > 1 && <span style={{ color: 'var(--ambar)', fontWeight: 700 }}> · {cant} pzas = ${fmt(costoMxn)} MXN</span>}
              </div>
            )}
          </div>

          {/* Precio de venta */}
          <div>
            <label style={lbl}>Precio de venta MXN <span style={{ color: 'var(--w35)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>por pieza</span></label>
            <input
              style={{ ...inp, borderColor: form.precio_venta ? 'var(--marca)' : 'var(--w12)' }}
              type="number" step="0.01" value={form.precio_venta}
              onChange={e => setForm(p => ({ ...p, precio_venta: e.target.value }))}
              placeholder="0.00" disabled={procesando} />
            {ventaUnit > 0 && cant > 1 && (
              <div style={{ fontSize: 12, color: 'var(--w40)', marginTop: 5 }}>
                Total {cant} pzas = <span style={{ color: 'var(--marca)', fontWeight: 700 }}>${fmt(venta)} MXN</span>
              </div>
            )}
            {utilidad !== 0 && (
              <div style={{ fontSize: 12, color: utilidad > 0 ? 'var(--verde)' : 'var(--rojo)', marginTop: 4 }}>
                Utilidad total: ${fmt(utilidad)} MXN {costoMxn > 0 ? `(${((utilidad / costoMxn) * 100).toFixed(0)}%)` : ''}
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={regresar} disabled={indice === 0 || guardando}
              style={{ flex: 'none', background: 'var(--w05)', color: indice === 0 ? 'var(--w20)' : 'var(--w70)', border: '1px solid var(--w10)', borderRadius: 10, padding: '12px 14px', fontSize: 13, fontWeight: 700, cursor: indice === 0 ? 'not-allowed' : 'pointer' }}>
              ← Regresar
            </button>
            <button onClick={saltar} disabled={guardando}
              style={{ flex: 1, background: 'var(--w05)', color: 'var(--w70)', border: '1px solid var(--w10)', borderRadius: 10, padding: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Saltar
            </button>
            <button onClick={confirmar} disabled={guardando || procesando}
              style={{ flex: 2, background: guardando || procesando ? 'rgba(193,85,58,0.3)' : 'var(--marca)', color: 'var(--tinta)', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 800, cursor: guardando || procesando ? 'wait' : 'pointer' }}>
              {guardando ? 'Guardando...' : editando ? '✓ Actualizar' : indice + 1 === cola.length ? '✓ Confirmar y finalizar' : '✓ Confirmar →'}
            </button>
          </div>

          {/* Config summary */}
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--w06)', fontSize: 11, color: 'var(--w30)', lineHeight: 1.8 }}>
            TC: {config.tipo_cambio} · Imp: {config.impuesto_pct}% · {config.lugar_compra} · {config.fecha_compra}
          </div>
        </div>
      </div>
    </div>
  )

  // ─── PASO 4: RESUMEN ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', padding: '32px 24px', fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>🎉</div>
          <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, marginBottom: 8 }}>Lote completado</h1>
          <div style={{ fontSize: 16, color: 'var(--w60)' }}>
            Se guardaron <b style={{ color: 'var(--marca)' }}>{totalGuardados}</b> pedidos de {cola.length} fotos procesadas.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          {Object.entries(salvados).sort((a, b) => Number(a[0]) - Number(b[0])).map(([idx, p]) => {
            const foto = cola[parseInt(idx)]
            const cliente = clientes.find(c => c.id === p.cliente_id)
            return (
              <div key={idx} style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {foto?.imagen_url && (
                  <img src={foto.imagen_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion || 'Sin descripción'}</div>
                  <div style={{ fontSize: 12, color: 'var(--w45)', marginTop: 2 }}>
                    {cliente?.nombre} · {p.cantidad} pza(s) · ${fmt(p.precio_venta)}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--verde)', fontWeight: 700, flexShrink: 0 }}>✓</div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { setPaso(1); setCola([]); setSalvados({}); setIndice(0); setEditando(false) }}
            style={{ flex: 1, background: 'var(--w05)', color: 'var(--tinta)', border: '1px solid var(--w12)', borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Nuevo lote
          </button>
          <button
            onClick={() => router.push('/admin/pedidos')}
            style={{ flex: 1, background: 'var(--marca)', color: '#fff', border: 'none', borderRadius: 12, padding: 16, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            Ver todos los pedidos →
          </button>
        </div>
      </div>
    </div>
  )
}
