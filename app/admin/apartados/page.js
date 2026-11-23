'use client'
import { useState, useEffect, useMemo } from 'react'
import CamaraLector from '@/app/components/CamaraLector'
import ProductoFoto, { colorParaCategoria } from '@/app/components/pos/ProductoFoto'
import { UMBRAL_DESCUENTO_PCT, UMBRAL_DESCUENTO_MONTO } from '@/lib/pos/tiendaUtils'
import { diasApartado, venceAviso, infoRemate, DIAS_PARA_LIBERAR } from '@/lib/pos/apartadosUtils'

// ---------------------------------------------------------------------------
// Apartados de tienda — la cuenta de tienda de cada cliente.
//
// Un artículo del catálogo se aparta para un cliente sin volver a registrarlo:
// el stock baja al apartar, el precio puede rematarse, el anticipo se liga al
// artículo y el cliente pasa cuando quiera (no hay fecha de entrega). El cobro
// y la entrega se hacen en el punto de venta. A los 30 días el sistema avisa y
// el admin libera: el stock regresa y el anticipo pasa a utilidad.
//
// Diseño: izquierda, el formulario en tres pasos (cliente, producto con su
// foto, precio y cantidad); derecha, una tarjeta por cliente que se abre y se
// cierra, con la foto de cada artículo y una barra de cuánto lleva anticipado.
// ---------------------------------------------------------------------------

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
const fechaCorta = (f) => { if (!f) return ''; const d = new Date(String(f).replace(' ', 'T')); return `${d.getDate()} ${MESES[d.getMonth()]}` }
const iniciales = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

const card = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
const input = { background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10, padding: '0 12px', height: 44, color: 'var(--tinta)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', width: '100%', minWidth: 0 }
const rotulo = { color: 'var(--w60)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }
const chip = { padding: '3px 9px', borderRadius: 7, fontSize: 11.5 }

function Avatar({ nombre, size = 36 }) {
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: 10, background: 'rgba(193,85,58,0.12)', color: 'var(--marca)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.36 }}>{iniciales(nombre)}</div>
  )
}

function Paso({ n, titulo, hecho, children, accion }) {
  return (
    <div className="paso" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 20, height: 20, borderRadius: 20, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hecho ? 'var(--verde)' : 'var(--w08)', color: hecho ? '#fff' : 'var(--w75)' }}>{hecho ? '✓' : n}</span>
        <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>{titulo}</span>
        {accion}
      </div>
      {children}
    </div>
  )
}

export default function Apartados() {
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [apartados, setApartados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState(null)

  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [altaCliente, setAltaCliente] = useState(null) // null | { nombre, telefono }
  const [errorAlta, setErrorAlta] = useState('')
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [cliente, setCliente] = useState(null)
  const [busquedaProd, setBusquedaProd] = useState('')
  const [producto, setProducto] = useState(null)
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState('')
  const [autoriza, setAutoriza] = useState('')
  const [pideAutoriza, setPideAutoriza] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [abiertos, setAbiertos] = useState({})
  const [liberando, setLiberando] = useState(null)
  const [formAbierto, setFormAbierto] = useState(true)
  const [camAbierta, setCamAbierta] = useState(false)
  const [rol, setRol] = useState(null)            // null mientras se lee la sesión
  const [lineas, setLineas] = useState([])          // resumen del colaborador (aún no confirmado)
  const [confirmando, setConfirmando] = useState(false)
  const [ultimo, setUltimo] = useState(null)        // último apartado confirmado
  const [anticipoDe, setAnticipoDe] = useState(null)
  const [montoAnt, setMontoAnt] = useState('')
  const [metodoAnt, setMetodoAnt] = useState('Efectivo')

  const notificar = (tipo, texto) => { setAviso({ tipo, texto }); setTimeout(() => setAviso(null), 4500) }

  const cargarApartados = async () => {
    const r = await fetch('/api/apartados').then(r => r.json())
    if (r.ok) setApartados(r.apartados)
    else notificar('error', r.mensaje || 'No se pudieron cargar los apartados')
    setCargando(false)
  }
  const cargarProductos = async () => {
    const r = await fetch('/api/productos?stock=true').then(r => r.json())
    if (r.ok) setProductos(r.productos)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => {
    fetch('/api/clientes/listar').then(r => r.json()).then(d => { if (d.ok) setClientes((d.clientes || []).filter(c => c.activo !== false)) })
    cargarProductos()
    let r = null
    try { r = JSON.parse(localStorage.getItem('cliente') || 'null')?.rol || '' } catch { r = '' }
    setRol(r)
    // El colaborador solo agrega: no necesita (ni recibe) la lista de apartados.
    if (r === 'admin') cargarApartados(); else setCargando(false)
  }, [])
  const esAdmin = rol === 'admin'

  const coincidenciasCliente = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase()
    if (!q) return []
    return clientes.filter(c => (c.nombre || '').toLowerCase().includes(q)).slice(0, 6)
  }, [busquedaCliente, clientes])

  const coincidenciasProd = useMemo(() => {
    const q = busquedaProd.trim().toLowerCase()
    if (!q) return []
    return productos.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.codigo_barras || '') === q).slice(0, 7)
  }, [busquedaProd, productos])

  // Lectura con la cámara (iPhone): busca el código en el catálogo y elige el producto.
  const normalizarCodigo = (c) => String(c || '').trim().replace(/^0+/, '')
  const alLeerCodigo = (textos) => {
    for (const t of textos) {
      const q = normalizarCodigo(t)
      if (!q) continue
      const p = productos.find(x => normalizarCodigo(x.codigo_barras) === q)
      if (p) { elegirProducto(p); setCamAbierta(false); notificar('exito', `Producto encontrado: ${p.nombre}`); return true }
    }
    notificar('error', `No hay producto con stock con el código ${String(textos[0]).slice(0, 24)}`)
    return false
  }

  const crearCliente = async () => {
    const nombre = (altaCliente?.nombre || '').trim()
    const digitos = (altaCliente?.telefono || '').replace(/\D/g, '')
    if (nombre.length < 2) { setErrorAlta('Escribe el nombre del cliente'); return }
    if (digitos.length < 10) { setErrorAlta('Escribe el teléfono a 10 dígitos'); return }
    const igual = clientes.find(c => (c.telefono || '').replace(/\D/g, '').slice(-10) === digitos.slice(-10))
    if (igual) { setErrorAlta(`Ese teléfono ya es de ${igual.nombre}. Búscalo arriba.`); return }
    setCreandoCliente(true); setErrorAlta('')
    const r = await fetch('/api/clientes/crear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, telefono: digitos, usuario: digitos, password: digitos, limite_credito: 0, requiere_anticipo: false }),
    }).then(r => r.json()).catch(() => ({ ok: false, mensaje: 'No se pudo conectar' }))
    setCreandoCliente(false)
    if (!r.ok) { setErrorAlta(r.mensaje || 'No se pudo crear el cliente'); return }
    setClientes(prev => [...prev, r.cliente])
    setCliente(r.cliente); setBusquedaCliente(''); setAltaCliente(null)
    notificar('exito', `${r.cliente.nombre} ya es cliente`)
  }

  const elegirProducto = (p) => { setProducto(p); setBusquedaProd(''); setPrecio(String(p.precio_venta ?? '')); setCantidad(1); setPideAutoriza(false); setAutoriza('') }

  const cant = Math.max(0, Math.floor(Number(cantidad) || 0))
  const precioNum = precio === '' ? Number(producto?.precio_venta || 0) : Number(precio)
  const catalogo = Number(producto?.precio_venta || 0)
  const descTotal = producto ? Math.max(0, (catalogo - precioNum) * cant) : 0
  const pctDesc = catalogo > 0 && cant > 0 ? descTotal / (catalogo * cant) : 0
  const remateGrande = descTotal > UMBRAL_DESCUENTO_MONTO || pctDesc > UMBRAL_DESCUENTO_PCT
  const costo = esAdmin && producto?.costo != null ? Number(producto.costo) : null
  const utilidad = costo != null ? (precioNum - costo) * cant : null
  const enResumen = lineas.filter(l => l.producto.id === producto?.id).reduce((s, l) => s + l.cantidad, 0)
  const stock = Number(producto?.stock || 0) - enResumen

  const apartar = async () => {
    if (!cliente || !producto || cant <= 0) return
    setGuardando(true)
    const r = await fetch('/api/apartados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'apartar', cliente_id: cliente.id, producto_id: producto.id, cantidad: cant, precio: precioNum, autorizado_por: autoriza }),
    }).then(r => r.json())
    setGuardando(false)
    if (r.requiereAutorizacionDescuento) { setPideAutoriza(true); notificar('error', r.mensaje); return }
    if (!r.ok) { notificar('error', r.mensaje || 'No se pudo apartar'); return }
    notificar('exito', `${producto.nombre} apartado para ${cliente.nombre}`)
    setAbiertos(o => ({ ...o, [cliente.id]: true }))
    setProducto(null); setPrecio(''); setCantidad(1); setAutoriza(''); setPideAutoriza(false)
    cargarApartados(); cargarProductos()
  }

  const agregarLinea = () => {
    if (!producto || cant <= 0) return
    if (cant > stock) { notificar('error', `Solo quedan ${stock} disponibles`); return }
    if (remateGrande && !autoriza.trim()) { setPideAutoriza(true); notificar('error', 'Escribe quién autoriza el remate'); return }
    setLineas(l => [...l, { key: `${Date.now()}-${Math.random()}`, producto, cantidad: cant, precio: precioNum, catalogo, autoriza: remateGrande ? autoriza.trim() : '' }])
    setUltimo(null)
    setProducto(null); setPrecio(''); setCantidad(1); setAutoriza(''); setPideAutoriza(false)
  }
  const quitarLinea = (key) => setLineas(l => l.filter(x => x.key !== key))
  const totalResumen = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0)

  const confirmar = async () => {
    if (!cliente || !lineas.length || confirmando) return
    setConfirmando(true)
    const pendientes = []; let hechos = 0, monto = 0, falla = ''
    for (const l of lineas) {
      const r = await fetch('/api/apartados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'apartar', cliente_id: cliente.id, producto_id: l.producto.id, cantidad: l.cantidad, precio: l.precio, autorizado_por: l.autoriza }),
      }).then(r => r.json()).catch(() => ({ ok: false, mensaje: 'Sin conexión' }))
      if (r.ok) { hechos++; monto += l.precio * l.cantidad } else { pendientes.push(l); falla = `${l.producto.nombre}: ${r.mensaje || 'no se pudo apartar'}` }
    }
    setLineas(pendientes); setConfirmando(false); cargarProductos()
    if (hechos) setUltimo({ nombre: cliente.nombre, n: hechos, monto })
    if (pendientes.length) notificar('error', `${falla}. Quedó en el resumen para revisarlo.`)
    else { setCliente(null); setBusquedaCliente('') }
  }

  const accion = async (cuerpo, okTexto) => {
    const r = await fetch('/api/apartados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }).then(r => r.json())
    if (!r.ok) { notificar('error', r.mensaje || 'No se pudo completar'); return false }
    notificar('exito', okTexto)
    cargarApartados(); cargarProductos()
    return true
  }
  const guardarAnticipo = async (a) => {
    const ok = await accion({ accion: 'anticipo', apartado_id: a.id, monto: Number(montoAnt), metodo: metodoAnt }, 'Anticipo registrado')
    if (ok) { setAnticipoDe(null); setMontoAnt('') }
  }
  const liberar = async (a) => {
    const ok = await accion({ accion: 'liberar', apartado_id: a.id }, a.anticipado > 0 ? `Liberado. ${fmt(a.anticipado)} pasan a utilidad` : 'Liberado. El stock regresó al catálogo')
    if (ok) setLiberando(null)
  }

  const porCliente = useMemo(() => {
    const m = {}
    for (const a of apartados) (m[a.cliente_id] ||= { nombre: a.cliente_nombre, items: [] }).items.push(a)
    return Object.entries(m).map(([id, v]) => ({
      id, ...v,
      total: v.items.reduce((s, a) => s + a.total, 0),
      anticipado: v.items.reduce((s, a) => s + a.anticipado, 0),
      vencidos: v.items.filter(a => venceAviso(a)).length,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [apartados])
  const estaAbierto = (c, i) => abiertos[c.id] ?? (i < 3 || c.vencidos > 0)
  const vencidos = apartados.filter(a => venceAviso(a))
  const totalVivo = apartados.reduce((s, a) => s + a.total, 0)
  const totalAnticipado = apartados.reduce((s, a) => s + a.anticipado, 0)

  return (
    <div className="apartados" style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', padding: '22px 24px 60px' }}>
      <style>{`
        .apartados .monto { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
        .apartados .btn { border-radius: 9px; padding: 9px 16px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: filter .15s, background .15s; }
        .apartados .btn:hover:not(:disabled) { filter: brightness(1.1); }
        .apartados .btn:active:not(:disabled) { transform: translateY(1px); }
        .apartados .btn:disabled { opacity: .45; cursor: not-allowed; }
        .apartados .btn-chico { padding: 6px 12px; font-size: 11.5px; border-radius: 8px; }
        .apartados .btn-marca { background: #c1553a; color: #fff; }
        .apartados .btn-verde { background: var(--verde); color: #fff; }
        .apartados .btn-neutro { background: transparent; border-color: var(--w20); color: var(--w75); }
        .apartados .btn-neutro:hover:not(:disabled) { background: var(--w05); }
        .apartados .btn-peligro { background: transparent; border-color: rgba(var(--rojo-rgb),0.45); color: var(--rojo-t); font-weight: 800; }
        .apartados input::placeholder { color: var(--w55); }
        .apartados input:focus { border-color: var(--marca) !important; background: var(--sup) !important; }
        .apartados .fila-ctrl { display: flex; gap: 8px; align-items: stretch; }
        .apartados .sel { display: flex; align-items: center; gap: 12px; background: var(--w03); border: 1px solid var(--w08); border-radius: 12px; padding: 10px 12px; min-height: 64px; }
        .apartados .dos-botones { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .apartados .dos-botones .btn { width: 100%; height: 44px; padding: 0 12px; }
        .apartados .btn-camara, .apartados .btn-icono { flex: none; width: 44px; border-radius: 10px; border: 1px solid var(--w12); background: var(--w05); color: var(--w75); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
        .apartados .btn-camara:hover, .apartados .btn-icono:hover { background: var(--marca-suave); color: var(--marca); border-color: var(--marca-borde); }
        .apartados .btn-camara[data-activo="1"], .apartados .btn-icono[data-activo="1"] { background: #c1553a; border-color: #c1553a; color: #fff; }
        .apartados .fila-res { display: flex; align-items: center; gap: 11px; padding: 9px 11px; cursor: pointer; border-bottom: 1px solid var(--w05); transition: background .12s; }
        .apartados .fila-res:last-child { border-bottom: none; }
        .apartados .fila-res:hover { background: var(--w05); }
        .apartados .cabeza-cliente { display: flex; align-items: center; gap: 12px; padding: 13px 16px; cursor: pointer; transition: background .12s; }
        .apartados .cabeza-cliente:hover { background: var(--w03); }
        .apartados .lateral { margin-bottom: 18px; }
        .apartados .pasos { display: grid; grid-template-columns: 1fr; }
        .apartados .paso { border-top: 1px solid var(--w06); min-width: 0; }
        .apartados .foto-prod { display: block; width: 100%; height: 170px; object-fit: cover; background: var(--w03); }
        .apartados .res-lista { max-height: 300px; overflow-y: auto; }
        @media (min-width: 1000px) {
          .apartados .pasos { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr); }
          .apartados .paso { border-top: none; border-left: 1px solid var(--w06); }
          .apartados .paso:first-child { border-left: none; }
        }
        @media (max-width: 760px) {
          div.apartados { padding: 12px 12px 90px !important; }
          .apartados h1 { font-size: 20px !important; }
          /* textos chicos → legibles en iPhone */
          .apartados [style*="font-size: 9"], .apartados [style*="font-size: 10"], .apartados [style*="font-size: 11"], .apartados [style*="font-size: 12"] { font-size: 13px !important; }
          .apartados input { font-size: 16px !important; min-height: 46px; }
          .apartados .btn { min-height: 46px; font-size: 14px; padding: 10px 16px; }
          .apartados .btn-chico { min-height: 44px; font-size: 13.5px; padding: 10px 14px; }
          .apartados .metodo { min-height: 42px; font-size: 13.5px !important; padding: 8px 12px !important; }
          .apartados .btn-camara, .apartados .btn-icono { width: 50px; }
          .apartados .dos-botones .btn { height: 48px; }
          .apartados .fila-res { padding: 12px; }
          .apartados .cabeza-cliente { padding: 14px 12px; }
          .apartados .kpis { display: grid !important; grid-template-columns: 1fr 1fr; }
          .apartados .kpis > div { border-right: none !important; border-bottom: 1px solid var(--w05); padding: 12px 14px !important; }
          .apartados .fila-item { flex-wrap: wrap; }
          .apartados .montos-item { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; text-align: left !important; padding-top: 8px; border-top: 1px dashed var(--w10); }
          .apartados .acciones { padding-left: 0 !important; flex-wrap: wrap; }
          .apartados .acciones .btn { flex: 1 1 140px; }
          .apartados .sangria { padding-left: 0 !important; }
          .apartados .fila-venc { flex-wrap: wrap; }
          .apartados .fila-venc .acciones-venc { flex-basis: 100%; display: flex; gap: 8px; }
          .apartados .fila-venc .acciones-venc .btn { flex: 1; }
        }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--tinta)' }}>Apartados de tienda</h1>
        <div style={{ color: 'var(--w60)', fontSize: 13, marginTop: 3 }}>Artículos del catálogo que el cliente deja apartados. Pasa por ellos cuando quiera.</div>
      </div>

      {aviso && (
        <div style={{ ...card, padding: '11px 15px', marginBottom: 14, fontSize: 13, fontWeight: 600,
          color: aviso.tipo === 'error' ? 'var(--ambar)' : 'var(--verde)',
          background: aviso.tipo === 'error' ? 'var(--ambar-suave)' : 'var(--verde-suave)',
          borderColor: aviso.tipo === 'error' ? 'var(--ambar-borde)' : 'var(--verde-borde)' }}>{aviso.texto}</div>
      )}

      <div>
        {/* ── Agregar al cliente: tres pasos ──────────────────────────── */}
        <div className="lateral" style={{ ...card, overflow: 'hidden' }}>
          <div onClick={() => setFormAbierto(o => !o)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: formAbierto ? '1px solid var(--w06)' : 'none' }}>
            <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Agregar al cliente</span>
            {!formAbierto && cliente && <span style={{ fontSize: 13, color: 'var(--w75)', fontWeight: 600 }}>{cliente.nombre}</span>}
            <span style={{ color: 'var(--w60)', fontSize: 12 }}>{formAbierto ? '▲ Ocultar' : '▼ Mostrar'}</span>
          </div>
          <div className="pasos" style={{ display: formAbierto ? undefined : 'none' }}>

          <Paso n={1} titulo="Cliente" hecho={!!cliente}
            accion={cliente && <button className="btn btn-chico btn-neutro" disabled={lineas.length > 0} title={lineas.length > 0 ? 'Confirma o quita lo agregado para cambiar de cliente' : undefined} onClick={() => { setCliente(null); setBusquedaCliente('') }}>Cambiar</button>}>
            {cliente ? (
              <div className="sel">
                <Avatar nombre={cliente.nombre} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.25 }}>{cliente.nombre}</div>
                  {cliente.telefono && <div className="monto" style={{ color: 'var(--w60)', fontSize: 12.5, marginTop: 2 }}>{cliente.telefono}</div>}
                </div>
              </div>
            ) : (
              altaCliente ? (
                <div>
                  <div style={{ ...rotulo, marginBottom: 8 }}>Cliente nuevo</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input style={input} placeholder="Nombre completo" value={altaCliente.nombre} autoFocus
                      onChange={e => setAltaCliente(a => ({ ...a, nombre: e.target.value }))} />
                    <input style={input} inputMode="tel" placeholder="Teléfono a 10 dígitos" value={altaCliente.telefono}
                      onChange={e => setAltaCliente(a => ({ ...a, telefono: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && crearCliente()} />
                  </div>
                  {errorAlta && <div style={{ color: 'var(--rojo-t)', fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{errorAlta}</div>}
                  <div className="dos-botones">
                    <button className="btn btn-neutro" onClick={() => { setAltaCliente(null); setErrorAlta('') }}>Cancelar</button>
                    <button className="btn btn-verde" disabled={creandoCliente} onClick={crearCliente}>{creandoCliente ? 'Creando…' : 'Crear cliente'}</button>
                  </div>
                  <div style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 8 }}>Sin límite de crédito. El teléfono es su usuario y contraseña.</div>
                </div>
              ) : (
              <>
                <div className="fila-ctrl">
                  <input style={input} placeholder="Buscar cliente por nombre…" value={busquedaCliente} onChange={e => setBusquedaCliente(e.target.value)} />
                  <button type="button" className="btn-icono" aria-label="Crear cliente nuevo" title="Cliente nuevo"
                    onClick={() => { setAltaCliente({ nombre: busquedaCliente.trim(), telefono: '' }); setErrorAlta('') }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="10" cy="8.5" r="3.6" />
                      <path d="M3.5 19.5c.6-3.3 3.1-5.2 6.5-5.2 1.5 0 2.8.35 3.9 1" />
                      <path d="M18 13.5v6M15 16.5h6" />
                    </svg>
                  </button>
                </div>
                {coincidenciasCliente.length > 0 && (
                  <div style={{ border: '1px solid var(--w10)', borderRadius: 12, marginTop: 6, overflow: 'hidden', background: 'var(--sup)' }}>
                    {coincidenciasCliente.map(c => (
                      <div key={c.id} className="fila-res" onClick={() => { setCliente(c); setBusquedaCliente('') }}>
                        <Avatar nombre={c.nombre} size={30} />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.nombre}</span>
                      </div>
                    ))}
                  </div>
                )}
                {busquedaCliente.trim() && coincidenciasCliente.length === 0 && (
                  <div style={{ color: 'var(--w60)', fontSize: 12.5, marginTop: 8 }}>No hay clientes con ese nombre.</div>
                )}
              </>
              )
            )}
          </Paso>

          <Paso n={2} titulo="Producto del catálogo" hecho={!!producto}
            accion={producto && <button className="btn btn-chico btn-neutro" onClick={() => setProducto(null)}>Cambiar</button>}>
            {producto ? (
              <div className="sel" style={{ alignItems: 'flex-start' }}>
                <ProductoFoto imagenUrl={producto.imagen_url} categoria={producto.categoria} size={84} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{producto.nombre}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {producto.categoria && <span style={{ ...chip, background: colorParaCategoria(producto.categoria) + '22', fontWeight: 700 }}>{producto.categoria}</span>}
                    <span style={{ ...chip, background: 'var(--w05)', color: 'var(--w75)' }}>{stock} en stock</span>
                    <span className="monto" style={{ ...chip, background: 'var(--w05)', color: 'var(--w75)' }}>Catálogo {fmt(catalogo)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <input style={input} placeholder="Buscar producto o código de barras…" value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)} />
                  <button type="button" className="btn-camara" aria-label="Escanear código de barras con la cámara" title="Escanear código de barras"
                    data-activo={camAbierta ? '1' : '0'} onClick={() => setCamAbierta(o => !o)}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .8-.4l.9-1.2a1 1 0 0 1 .8-.4h3.6a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
                      <circle cx="12" cy="12.5" r="3.4" />
                    </svg>
                  </button>
                </div>
                <div style={{ marginTop: camAbierta ? 8 : 0 }}>
                  <CamaraLector abiertaExterna={camAbierta} alCambiar={setCamAbierta} onLeer={alLeerCodigo} cerrarAlLeer pausa={1500}
                    claseCerrar="btn btn-neutro" ayuda="Apunta al código del producto" />
                </div>
                {coincidenciasProd.length > 0 && (
                  <div className="res-lista" style={{ border: '1px solid var(--w10)', borderRadius: 12, marginTop: 6, background: 'var(--sup)' }}>
                    {coincidenciasProd.map(p => (
                      <div key={p.id} className="fila-res" onClick={() => elegirProducto(p)}>
                        <ProductoFoto imagenUrl={p.imagen_url} categoria={p.categoria} size={46} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{p.nombre}</div>
                          <div className="monto" style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 2 }}>{fmt(p.precio_venta)} · {p.stock} en stock</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {busquedaProd.trim() && coincidenciasProd.length === 0 && (
                  <div style={{ color: 'var(--w60)', fontSize: 12.5, marginTop: 8 }}>No hay productos con stock que coincidan.</div>
                )}
              </>
            )}
          </Paso>

          <Paso n={3} titulo="Cantidad y precio" hecho={!!producto && cant > 0 && precio !== ''}>
            {!producto ? (
              <div style={{ color: 'var(--w60)', fontSize: 12.5, marginBottom: 10 }}>Elige un producto para poner cantidad y precio.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ ...rotulo, marginBottom: 5 }}>Cantidad</div>
                    <div style={{ display: 'flex', alignItems: 'center', height: 44, background: 'var(--w05)', border: '1px solid var(--w12)', borderRadius: 10 }}>
                      <button className="btn btn-neutro" style={{ border: 'none', height: '100%', padding: '0 14px', fontSize: 18, minHeight: 0 }} disabled={cant <= 1} onClick={() => setCantidad(Math.max(1, cant - 1))}>−</button>
                      <span className="monto" style={{ minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: 15 }}>{cant}</span>
                      <button className="btn btn-neutro" style={{ border: 'none', height: '100%', padding: '0 14px', fontSize: 18, minHeight: 0 }} disabled={cant >= stock} onClick={() => setCantidad(Math.min(stock, cant + 1))}>+</button>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...rotulo, marginBottom: 5 }}>Precio final (c/u)</div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--w60)', fontWeight: 700 }}>$</span>
                      <input type="number" min="0" style={{ ...input, paddingLeft: 24, fontWeight: 800, fontSize: 15 }} value={precio} onChange={e => setPrecio(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0 4px' }}>
                  {descTotal > 0 && <span style={{ ...chip, background: 'var(--ambar-suave)', color: 'var(--ambar)', fontWeight: 700 }}>
                    Remate −{Math.round(pctDesc * 100)}% · catálogo {fmt(catalogo)}</span>}
                  {costo != null && <span className="monto" style={{ ...chip, background: 'var(--w05)', color: 'var(--w75)' }}>
                    Costo {fmt(costo)} · utilidad {fmt(utilidad)}</span>}
                </div>

                {(pideAutoriza || remateGrande) && (
                  <div style={{ margin: '10px 0' }}>
                    <div style={{ ...rotulo, marginBottom: 5, color: 'var(--ambar)' }}>Remate grande: quién lo autoriza</div>
                    <input style={input} placeholder="Nombre de quien lo autoriza" value={autoriza} onChange={e => setAutoriza(e.target.value)} />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0' }}>
                  <span style={{ color: 'var(--w60)', fontSize: 13 }}>Total del artículo</span>
                  <span className="monto" style={{ fontSize: 24, fontWeight: 800 }}>{fmt(precioNum * cant)}</span>
                </div>
              </>
            )}
            {esAdmin ? (
              <button className="btn btn-marca" style={{ width: '100%', height: 46, padding: '0 16px', fontSize: 14 }}
                disabled={!cliente || !producto || cant <= 0 || guardando || (remateGrande && !autoriza.trim())} onClick={apartar}>
                {guardando ? 'Apartando…' : !cliente ? 'Elige un cliente' : !producto ? 'Elige un producto' : `Apartar para ${cliente.nombre.split(' ')[0]}`}
              </button>
            ) : (
              <button className="btn btn-marca" style={{ width: '100%', height: 46, padding: '0 16px', fontSize: 14 }}
                disabled={!cliente || !producto || cant <= 0 || cant > stock || (remateGrande && !autoriza.trim())} onClick={agregarLinea}>
                {!cliente ? 'Elige un cliente' : !producto ? 'Elige un producto' : '+ Agregar al resumen'}
              </button>
            )}
            <div style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 8 }}>{esAdmin ? 'El stock baja al apartar. El costo se guarda como foto del momento.' : 'No se aparta nada hasta que confirmes el resumen.'}</div>
          </Paso>
          </div>
        </div>

        {/* ── Resumen para confirmar (colaborador) ────────────────────── */}
        {!esAdmin && rol !== null && (lineas.length > 0 ? (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--w06)' }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Resumen{cliente ? ` · ${cliente.nombre}` : ''}</span>
              <span style={{ ...chip, background: 'var(--w05)', color: 'var(--w75)', fontWeight: 700 }}>{lineas.length} artículo{lineas.length !== 1 ? 's' : ''}</span>
            </div>
            {lineas.map(l => {
              const rem = l.catalogo > l.precio ? Math.round((1 - l.precio / l.catalogo) * 100) : 0
              return (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--w05)' }}>
                  <ProductoFoto imagenUrl={l.producto.imagen_url} categoria={l.producto.categoria} size={52} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3 }}>{l.producto.nombre}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                      <span className="monto" style={{ ...chip, background: 'var(--w05)', color: 'var(--w75)' }}>{l.cantidad} × {fmt(l.precio)}</span>
                      {rem > 0 && <span style={{ ...chip, background: 'var(--ambar-suave)', color: 'var(--ambar)', fontWeight: 700 }}>Remate −{rem}%</span>}
                    </div>
                  </div>
                  <div className="monto" style={{ fontWeight: 800, fontSize: 15 }}>{fmt(l.precio * l.cantidad)}</div>
                  <button type="button" className="btn-icono" aria-label={`Quitar ${l.producto.nombre}`} title="Quitar" style={{ width: 40, height: 40 }} onClick={() => quitarLinea(l.key)}>✕</button>
                </div>
              )
            })}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ color: 'var(--w60)', fontSize: 13 }}>Total apartado</span>
                <span className="monto" style={{ fontSize: 26, fontWeight: 800 }}>{fmt(totalResumen)}</span>
              </div>
              <div className="dos-botones" style={{ gridTemplateColumns: '1fr 2fr', marginTop: 0 }}>
                <button className="btn btn-neutro" disabled={confirmando} onClick={() => { setLineas([]) }}>Vaciar</button>
                <button className="btn btn-verde" disabled={confirmando || !cliente} onClick={confirmar}>
                  {confirmando ? 'Confirmando…' : `✓ Confirmar apartado${cliente ? ` para ${cliente.nombre.split(' ')[0]}` : ''}`}
                </button>
              </div>
              <div style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 8 }}>Al confirmar, los artículos se descuentan del catálogo y quedan apartados a nombre del cliente.</div>
            </div>
          </div>
        ) : ultimo ? (
          <div style={{ ...card, padding: '18px 16px', textAlign: 'center', background: 'var(--verde-suave)', borderColor: 'var(--verde-borde)' }}>
            <div style={{ fontSize: 30 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>Apartado confirmado</div>
            <div className="monto" style={{ color: 'var(--w75)', fontSize: 13.5, marginTop: 3 }}>{ultimo.n} artículo{ultimo.n !== 1 ? 's' : ''} para {ultimo.nombre} · {fmt(ultimo.monto)}</div>
          </div>
        ) : (
          <div style={{ ...card, padding: '22px 16px', textAlign: 'center', color: 'var(--w60)', fontSize: 13 }}>
            Lo que agregues aparecerá aquí como resumen para confirmar.
          </div>
        ))}

        {/* ── Cuentas de los clientes (solo admin) ────────────────────── */}
        {esAdmin && <div className="lista">
          <div className="kpis" style={{ ...card, display: 'flex', marginBottom: 14, overflow: 'hidden' }}>
            {[['Clientes', porCliente.length, 'var(--tinta)'], ['Apartado', fmt(totalVivo), 'var(--tinta)'], ['Anticipado', fmt(totalAnticipado), 'var(--verde)'], ['Por cobrar', fmt(totalVivo - totalAnticipado), 'var(--ambar)']].map(([et, v, color], i) => (
              <div key={et} style={{ flex: 1, padding: '14px 16px', borderRight: i < 3 ? '1px solid var(--w05)' : 'none' }}>
                <div style={rotulo}>{et}</div>
                <div className="monto" style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color }}>{v}</div>
              </div>
            ))}
          </div>

        {vencidos.length > 0 && (
          <div style={{ ...card, borderColor: 'var(--ambar-borde)', background: 'var(--ambar-suave)', padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ambar)', marginBottom: 6 }}>
              {vencidos.length} apartado{vencidos.length !== 1 ? 's' : ''} cumplieron {DIAS_PARA_LIBERAR} días
            </div>
            {vencidos.map(a => (
              <div key={a.id} className="fila-venc" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: '1px solid var(--ambar-borde)' }}>
                <ProductoFoto imagenUrl={a.imagen_url} categoria={a.categoria} size={44} />
                <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>{a.cliente_nombre} · {a.nombre_producto} ×{a.cantidad}</div>
                  <div style={{ color: 'var(--w60)', fontSize: 11.5 }}>Apartado {fechaCorta(a.creado_en)} · {diasApartado(a)} días · anticipo {fmt(a.anticipado)}</div>
                </div>
                {liberando === a.id
                  ? <div className="acciones-venc" style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-chico btn-marca" onClick={() => liberar(a)}>Sí, liberar</button>
                      <button className="btn btn-chico btn-neutro" onClick={() => setLiberando(null)}>No</button>
                    </div>
                  : <div className="acciones-venc"><button className="btn btn-chico btn-neutro" onClick={() => setLiberando(a.id)}>Liberar</button></div>}
              </div>
            ))}
            <div style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 8 }}>Al liberar, el artículo regresa al catálogo y el anticipo pasa a utilidad.</div>
          </div>
        )}


          {cargando && <div style={{ color: 'var(--w60)', fontSize: 13 }}>Cargando…</div>}
          {!cargando && porCliente.length === 0 && (
            <div style={{ ...card, padding: '34px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>🛍️</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Todavía no hay apartados</div>
              <div style={{ color: 'var(--w60)', fontSize: 13, marginTop: 4 }}>Elige un cliente y un producto del catálogo para empezar.</div>
            </div>
          )}

          {porCliente.map((c, i) => {
            const abierto = estaAbierto(c, i)
            const pct = c.total > 0 ? Math.min(100, (c.anticipado / c.total) * 100) : 0
            return (
              <div key={c.id} style={{ ...card, marginBottom: 12, overflow: 'hidden' }}>
                <div className="cabeza-cliente" onClick={() => setAbiertos(o => ({ ...o, [c.id]: !abierto }))}>
                  <Avatar nombre={c.nombre} size={40} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                      {c.nombre}
                      {c.vencidos > 0 && <span style={{ marginLeft: 8, background: 'var(--ambar-suave)', color: 'var(--ambar)', fontSize: 10.5, padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>{c.vencidos} por liberar</span>}
                    </div>
                    <div style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 2 }}>{c.items.length} artículo{c.items.length !== 1 ? 's' : ''} · anticipado {fmt(c.anticipado)}</div>
                    <div style={{ height: 3, background: 'var(--w06)', borderRadius: 2, marginTop: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--verde)', borderRadius: 2, transition: 'width .3s' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="monto" style={{ fontWeight: 800, fontSize: 16 }}>{fmt(c.total - c.anticipado)}</div>
                    <div style={{ color: 'var(--w60)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}>por cobrar</div>
                  </div>
                  <span style={{ color: 'var(--w60)', fontSize: 12, width: 14, textAlign: 'center', transition: 'transform .2s', transform: abierto ? 'rotate(90deg)' : 'none' }}>▶</span>
                </div>

                {abierto && c.items.map(a => {
                  const remate = infoRemate(a)
                  const saldo = Math.max(0, a.total - a.anticipado)
                  const dias = diasApartado(a)
                  const pctA = a.total > 0 ? Math.min(100, (a.anticipado / a.total) * 100) : 0
                  return (
                    <div key={a.id} style={{ padding: '13px 16px', borderTop: '1px solid var(--w06)', background: 'var(--hueco)' }}>
                      <div className="fila-item" style={{ display: 'flex', gap: 13 }}>
                        <ProductoFoto imagenUrl={a.imagen_url} categoria={a.categoria} size={64} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{a.nombre_producto} <span style={{ color: 'var(--w60)', fontWeight: 500 }}>×{a.cantidad}</span></div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                            <span style={{ ...chip, fontSize: 11, padding: '2px 8px', background: 'var(--w05)', color: 'var(--w75)' }}>Compra {fechaCorta(a.creado_en)} · {dias} día{dias !== 1 ? 's' : ''}</span>
                            {remate && <span style={{ ...chip, fontSize: 11, padding: '2px 8px', background: 'var(--ambar-suave)', color: 'var(--ambar)', fontWeight: 700 }}>Remate −{Math.round(remate.pct * 100)}%</span>}
                            {venceAviso(a) && <span style={{ ...chip, fontSize: 11, padding: '2px 8px', background: 'var(--ambar-suave)', color: 'var(--ambar)', fontWeight: 700 }}>Cumple {DIAS_PARA_LIBERAR} días</span>}
                          </div>
                          <div style={{ height: 3, background: 'var(--w08)', borderRadius: 2, marginTop: 9, overflow: 'hidden', maxWidth: 220 }}>
                            <div style={{ width: `${pctA}%`, height: '100%', background: 'var(--verde)', borderRadius: 2 }} />
                          </div>
                        </div>
                        <div className="montos-item" style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div className="monto" style={{ fontWeight: 800, fontSize: 16 }}>{fmt(a.total)}</div>
                          {remate && <div className="monto" style={{ fontSize: 11, color: 'var(--w60)', textDecoration: 'line-through' }}>{fmt(a.precio_catalogo * a.cantidad)}</div>}
                          <div className="monto" style={{ fontSize: 11.5, marginTop: 2, color: a.anticipado > 0 ? 'var(--verde)' : 'var(--w60)' }}>
                            {a.anticipado > 0 ? `anticipo ${fmt(a.anticipado)}` : 'sin anticipo'}
                          </div>
                          {a.anticipado > 0 && <div className="monto" style={{ fontSize: 11.5, color: 'var(--w75)' }}>saldo {fmt(saldo)}</div>}
                        </div>
                      </div>

                      {anticipoDe === a.id ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--w10)' }}>
                          <div style={{ position: 'relative', width: 120 }}>
                            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--w60)', fontWeight: 700 }}>$</span>
                            <input type="number" placeholder="Monto" style={{ ...input, paddingLeft: 22, fontWeight: 700 }} value={montoAnt} onChange={e => setMontoAnt(e.target.value)} autoFocus
                              onKeyDown={e => e.key === 'Enter' && Number(montoAnt) > 0 && guardarAnticipo(a)} />
                          </div>
                          <div style={{ display: 'flex', gap: 3, background: 'var(--w05)', padding: 3, borderRadius: 10 }}>
                            {['Efectivo', 'Transferencia', 'Terminal'].map(m => (
                              <button key={m} className="metodo" onClick={() => setMetodoAnt(m)}
                                style={{ padding: '6px 11px', borderRadius: 7, fontSize: 11, cursor: 'pointer', border: 'none',
                                  background: metodoAnt === m ? 'rgba(193,85,58,0.28)' : 'transparent',
                                  color: metodoAnt === m ? 'var(--marca-t)' : 'var(--w60)', fontWeight: metodoAnt === m ? 700 : 500 }}>{m}</button>
                            ))}
                          </div>
                          <button className="btn btn-chico btn-verde" disabled={!(Number(montoAnt) > 0)} onClick={() => guardarAnticipo(a)}>Guardar anticipo</button>
                          <button className="btn btn-chico btn-neutro" onClick={() => { setAnticipoDe(null); setMontoAnt('') }}>Cancelar</button>
                        </div>
                      ) : (
                        <div className="acciones" style={{ display: 'flex', gap: 7, marginTop: 12, paddingLeft: 77 }}>
                          <button className="btn btn-chico btn-neutro" onClick={() => { setAnticipoDe(a.id); setMontoAnt('') }}>+ Anticipo</button>
                          {a.anticipado > 0
                            ? (liberando === a.id
                                ? <><button className="btn btn-chico btn-marca" onClick={() => liberar(a)}>Sí, liberar</button><button className="btn btn-chico btn-neutro" onClick={() => setLiberando(null)}>No</button></>
                                : <button className="btn btn-chico btn-peligro" onClick={() => setLiberando(a.id)}>Liberar</button>)
                            : <button className="btn btn-chico btn-peligro" onClick={() => accion({ accion: 'quitar', apartado_id: a.id }, 'Quitado. El stock regresó al catálogo')}>Quitar</button>}
                        </div>
                      )}
                      {liberando === a.id && <div className="sangria" style={{ color: 'var(--w60)', fontSize: 11.5, marginTop: 8, paddingLeft: 77 }}>El stock regresa al catálogo y el anticipo de {fmt(a.anticipado)} pasa a utilidad.</div>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>}
      </div>
    </div>
  )
}
