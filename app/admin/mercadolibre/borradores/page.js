'use client'
import { useState, useEffect, useCallback } from 'react'

// Borradores de publicación (MercadoLibre) — solo admin.
// Se arman desde el catálogo; tú pones el precio. MercadoLibre los revisa sin
// publicarlos y, al confirmar, se crean EN PAUSA (tú las activas en ML).

const AZUL = '#2F4D70'
const AZUL_CLARO = '#466D9B'
const AMARILLO_ML = '#FFE600'
const VERDE = '#0f8a63'
const ROJO = '#b3261e'
const TINTA = 'var(--tinta)'
const BORDE = '1.5px solid rgba(42,33,24,0.16)'

const tarjeta = { background: '#fff', border: BORDE, borderRadius: 18, boxShadow: '0 2px 0 rgba(42,33,24,0.04), 0 10px 28px rgba(42,33,24,0.07)' }
const campo = { width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '0 14px', borderRadius: 12, border: BORDE, background: '#fff', color: TINTA, fontSize: 15.5, fontWeight: 600, outline: 'none' }
const etiqueta = { display: 'block', fontSize: 13, fontWeight: 800, color: TINTA, marginBottom: 6, letterSpacing: 0.1 }
const ayuda = { fontSize: 12.5, color: 'rgba(42,33,24,0.66)', marginTop: 5, lineHeight: 1.4 }
const boton = (color, deshabilitado) => ({
  minHeight: 48, padding: '0 20px', borderRadius: 13, border: 'none', background: color, color: color === AMARILLO_ML ? '#2a2118' : '#fff',
  fontWeight: 800, fontSize: 15, cursor: deshabilitado ? 'not-allowed' : 'pointer', opacity: deshabilitado ? 0.45 : 1,
  boxShadow: deshabilitado ? 'none' : '0 3px 0 rgba(0,0,0,0.18)',
})
const botonSuave = { minHeight: 42, padding: '0 16px', borderRadius: 12, border: BORDE, background: '#fff', color: TINTA, fontWeight: 700, fontSize: 14, cursor: 'pointer' }

async function api(cuerpo) {
  const r = await fetch('/api/mercadolibre/borradores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  return r.json()
}

function Paso({ n, titulo, hecho, children }) {
  return (
    <section style={{ display: 'flex', gap: 14 }}>
      <div style={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', background: hecho ? VERDE : AZUL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, marginTop: 2 }}>
        {hecho ? '✓' : n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: '4px 0 12px', fontSize: 17, fontWeight: 800, color: TINTA }}>{titulo}</h3>
        {children}
      </div>
    </section>
  )
}

function traducir(e) {
  const t = String(e || '')
  if (/otra categor/i.test(t)) return 'MercadoLibre ya tiene este código de barras registrado en otra categoría. Prueba «Buscar en el catálogo de MercadoLibre» (en Más opciones) o publícalo directo en MercadoLibre.'
  if (/\[GTIN\] are required/i.test(t)) return 'Esta categoría exige código de barras y este producto no tiene uno válido.'
  if (/family_name|title/i.test(t) && /required|must/i.test(t)) return 'MercadoLibre pide ajustar el título de la publicación.'
  if (/SELLER_PACKAGE/i.test(t)) return 'Faltan las medidas o el peso de la caja.'
  return t
}

function Estado({ b }) {
  const publicado = b.estado === 'publicado'
  const validado = b.estado === 'validado'
  const c = publicado ? { bg: AZUL, t: '#fff', x: 'Creada en pausa' } : validado ? { bg: VERDE, t: '#fff', x: 'Aceptada por MercadoLibre' } : { bg: AMARILLO_ML, t: '#2a2118', x: 'Borrador' }
  return <span style={{ background: c.bg, color: c.t, fontSize: 12.5, fontWeight: 800, padding: '5px 12px', borderRadius: 999 }}>{c.x}</span>
}

function Borrador({ b, alCambiar }) {
  const [f, setF] = useState(b)
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [cats, setCats] = useState([])
  const [oblig, setOblig] = useState([])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const publicado = b.estado === 'publicado'
  const at = f.atributos || {}
  const setAt = (id, v) => set('atributos', { ...at, [id]: v })
  const num = (id) => String(at[id] || '').replace(/[^\d.]/g, '')

  const guardar = async () => api({
    accion: 'guardar', id: b.id,
    cambios: {
      catalogo_producto_id: f.catalogo_producto_id || null, catalogo_nombre: f.catalogo_nombre || null,
      titulo: f.titulo, descripcion: f.descripcion, categoria_id: f.categoria_id, categoria_nombre: f.categoria_nombre,
      precio: f.precio === '' || f.precio == null ? null : Number(f.precio), cantidad: Number(f.cantidad) || 1,
      dias_entrega: f.dias_entrega ? Number(f.dias_entrega) : null, gtin: f.gtin, sku: f.sku, atributos: at,
    },
  })
  const correr = async (fn) => {
    setOcupado(true); setMsg(null)
    try { await fn() } catch { setMsg({ t: 'rojo', x: 'No se pudo conectar. Intenta de nuevo.' }) }
    setOcupado(false)
  }
  const acGuardar = () => correr(async () => {
    const d = await guardar()
    if (d.ok) { setF(d.borrador); setMsg({ t: 'verde', x: 'Cambios guardados.' }); alCambiar() } else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const [consulta, setConsulta] = useState('')
  const [avisoCat, setAvisoCat] = useState(null)
  const acCats = () => correr(async () => {
    await guardar()
    setAvisoCat(null)
    const d = await api({ accion: 'categorias', id: b.id, consulta })
    if (!d.ok) { setAvisoCat({ t: 'rojo', x: d.mensaje }); return }
    setCats(d.categorias)
    setAvisoCat(d.categorias.length
      ? { t: 'verde', x: `MercadoLibre sugiere ${d.categorias.length} ${d.categorias.length === 1 ? 'categoría' : 'categorías'}. Elige una abajo (revisa que sea la correcta).` }
      : { t: 'rojo', x: 'MercadoLibre no encontró categorías. Escribe qué es el producto con otras palabras y busca de nuevo.' })
  })
  const [enlaceTienda, setEnlaceTienda] = useState(b.enlace_compra || '')
  const acEnlace = () => correr(async () => {
    if (!/^https?:\/\//i.test(enlaceTienda.trim())) { setMsg({ t: 'rojo', x: 'Pega la dirección completa de la tienda (empieza con https://).' }); return }
    await guardar()
    const d = await api({ accion: 'desde_enlace', id: b.id, url: enlaceTienda.trim() })
    if (!d.ok) { setMsg({ t: 'rojo', x: d.mensaje }); return }
    setF(d.borrador); alCambiar()
    setMsg({ t: 'verde', x: `Listo, leí ${d.tienda}: "${d.titulo_tienda}"${d.precio_usd ? ` · USD ${d.precio_usd}` : ''}.\n${d.resumen.length ? 'Traje: ' + d.resumen.join(', ') + '.' : 'No había nada nuevo que traer.'}\nEl enlace quedó guardado como lugar de compra. Revisa que sea el producto correcto.` })
  })
  const [catML, setCatML] = useState(null)
  const acCatalogoML = () => correr(async () => {
    await guardar()
    setAvisoCat(null)
    const d = await api({ accion: 'catalogo', id: b.id })
    if (!d.ok) { setAvisoCat({ t: 'rojo', x: d.mensaje }); return }
    setCatML(d.productos)
    setAvisoCat(d.productos.length ? { t: 'verde', x: 'Encontré esto en el catálogo de MercadoLibre. Toca el que sea tu producto.' } : { t: 'rojo', x: 'MercadoLibre no tiene este código de barras en su catálogo. Pasa a elegir la categoría y publícalo como producto nuevo.' })
  })
  const usarCatML = (pr) => {
    set('catalogo_producto_id', pr.id); set('catalogo_nombre', pr.nombre)
    if (pr.categoria_id) { set('categoria_id', pr.categoria_id); set('categoria_nombre', pr.dominio || pr.categoria_id) }
    setCatML(null)
    setMsg({ t: 'verde', x: 'Producto del catálogo de MercadoLibre elegido. Toca Guardar.' })
  }
  const acOblig = () => correr(async () => {
    await guardar()
    const d = await api({ accion: 'obligatorios', id: b.id })
    if (d.ok) setOblig(d.obligatorios); else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acValidar = () => correr(async () => {
    const g = await guardar()
    if (!g.ok) { setMsg({ t: 'rojo', x: g.mensaje }); return }
    const d = await api({ accion: 'validar', id: b.id })
    if (!d.ok) { setMsg({ t: 'rojo', x: d.mensaje }); return }
    setF(d.borrador); alCambiar()
    setMsg(d.validacion.ok
      ? { t: 'verde', x: 'MercadoLibre lo aceptó. Todavía NO está publicado.' + (d.validacion.avisos?.length ? '\nAvisos de MercadoLibre:\n• ' + d.validacion.avisos.join('\n• ') : '') }
      : { t: 'rojo', x: 'MercadoLibre pide corregir:\n• ' + d.validacion.errores.join('\n• ') })
  })
  const acPublicar = () => correr(async () => {
    if (!window.confirm(`Esto CREA la publicación en tu cuenta de MercadoLibre por $${f.precio} (queda en PAUSA). ¿Continuar?`)) return
    const d = await api({ accion: 'publicar', id: b.id, confirmar: true })
    if (d.ok) { setMsg({ t: 'verde', x: `Creada en pausa: ${d.item_id}. ${(d.aviso || []).join(' ')}` }); alCambiar() } else setMsg({ t: 'rojo', x: d.mensaje })
  })
  const acDescartar = () => correr(async () => {
    if (!window.confirm('¿Descartar este borrador?')) return
    await api({ accion: 'descartar', id: b.id }); alCambiar()
  })

  const datosListos = Number(f.precio) > 0 && (f.titulo || '').length > 3
  const catLista = !!f.categoria_id
  const paqueteListo = ['SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT'].every(k => num(k))
  const fotos = f.imagenes || []
  const [abierto, setAbierto] = useState(false)
  const errores = (b.validacion && b.validacion.ok === false && b.validacion.errores) || []
  const faltan = []
  if (!((f.titulo || '').length > 3)) faltan.push('título')
  if (!catLista) faltan.push('categoría')
  if (!(Number(f.precio) > 0)) faltan.push('precio')
  if (!paqueteListo) faltan.push('medidas de la caja')
  if (!fotos.length) faltan.push('fotos')
  let paso
  if (publicado) paso = { texto: 'Creada en pausa. Entra a MercadoLibre para activarla o cambiar el precio.', boton: null }
  else if (!catLista) paso = { texto: 'Lo primero: elegir la categoría.', boton: ['🔎 Buscar categoría', () => { setAbierto(true); acCats() }, AZUL_CLARO] }
  else if (!(Number(f.precio) > 0)) paso = { texto: 'Falta ponerle precio.', boton: ['💲 Poner precio', () => setAbierto(true), AZUL_CLARO] }
  else if (!paqueteListo) paso = { texto: 'Faltan las medidas y el peso de la caja.', boton: ['📦 Poner medidas', () => setAbierto(true), AZUL_CLARO] }
  else if (b.estado === 'validado') paso = { texto: 'MercadoLibre lo aceptó. Ya se puede crear (queda en pausa).', boton: ['🚀 Crear en MercadoLibre (en pausa)', acPublicar, VERDE] }
  else paso = { texto: 'Todo listo. Falta que MercadoLibre lo revise.', boton: ['✅ Revisar con MercadoLibre', acValidar, '#6B4FA0'] }

  return (
    <article style={{ ...tarjeta, overflow: 'hidden' }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '18px 20px', background: 'linear-gradient(180deg,#fffbe0,#fff)', borderBottom: BORDE, flexWrap: 'wrap' }}>
        <div style={{ width: 84, height: 84, borderRadius: 14, border: BORDE, background: '#f3efe8 center/contain no-repeat', backgroundImage: fotos[0] ? `url("${fotos[0]}")` : 'none', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, textAlign: 'center', color: ROJO }}>
          {!fotos[0] && 'Sin foto'}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Estado b={b} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: TINTA }}>{f.titulo || 'Sin título'}</div>
          <div style={{ fontSize: 13.5, color: 'rgba(42,33,24,0.7)', marginTop: 3 }}>
            {f.precio ? `Precio $${Number(f.precio).toLocaleString('es-MX')}` : 'Sin precio'}{b.costo != null ? ` · Te costó $${Number(b.costo).toLocaleString('es-MX')}` : ''} · {f.cantidad || 1} {Number(f.cantidad) === 1 ? 'pieza' : 'piezas'}{b.item_id_publicado ? ` · ${b.item_id_publicado}` : ''}
          </div>
        </div>
      </header>

      <div style={{ padding: '16px 20px', display: 'grid', gap: 12, borderBottom: abierto ? BORDE : 'none' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['Categoría', catLista], ['Precio', Number(f.precio) > 0], ['Medidas', paqueteListo], ['Fotos', fotos.length > 0]].map(([n, ok]) => (
            <span key={n} style={{ fontSize: 13, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: ok ? 'rgba(15,138,99,0.12)' : 'rgba(179,38,30,0.10)', color: ok ? '#0b6b4d' : ROJO }}>{ok ? '✓' : '✗'} {n}</span>
          ))}
        </div>
        {!publicado && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...campo, flex: '1 1 280px' }} placeholder="🔗 Link de la tienda donde lo compras (Amazon, Walmart, Target…)" value={enlaceTienda} onChange={e => setEnlaceTienda(e.target.value)} />
            <button style={botonSuave} disabled={ocupado || !enlaceTienda.trim()} onClick={acEnlace}>{ocupado ? 'Leyendo…' : '📥 Traer datos y fotos'}</button>
          </div>
        )}
        <div style={{ fontSize: 15.5, fontWeight: 700, color: TINTA }}>{paso.texto}</div>
        {errores.length > 0 && !publicado && b.estado !== 'validado' && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(179,38,30,0.10)', color: ROJO, fontWeight: 700, fontSize: 14, lineHeight: 1.45 }}>
            Último aviso de MercadoLibre:{errores.map((e, i) => <div key={i}>• {traducir(e)}</div>)}
          </div>
        )}
        {msg && <div style={{ whiteSpace: 'pre-wrap', fontWeight: 700, fontSize: 14, padding: '12px 14px', borderRadius: 12, lineHeight: 1.45, background: msg.t === 'rojo' ? 'rgba(179,38,30,0.10)' : 'rgba(15,138,99,0.12)', color: msg.t === 'rojo' ? ROJO : '#0b6b4d' }}>{msg.t === 'rojo' ? msg.x.split('\n').map(traducir).join('\n') : msg.x}</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {paso.boton && <button style={{ ...boton(paso.boton[2], ocupado), minHeight: 54, fontSize: 16 }} disabled={ocupado} onClick={paso.boton[1]}>{ocupado ? 'Un momento…' : paso.boton[0]}</button>}
          {publicado && b.enlace_publicado && <a href={b.enlace_publicado} target="_blank" rel="noreferrer" style={{ ...boton(AMARILLO_ML, false), minHeight: 54, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontSize: 16 }}>Ver en MercadoLibre ↗</a>}
          <button style={botonSuave} onClick={() => setAbierto(a => !a)}>{abierto ? '▲ Cerrar detalles' : '✏️ Editar detalles / Más opciones'}</button>
        </div>
      </div>

      {abierto && <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 26 }}>
        <Paso n={1} titulo="Datos de la publicación" hecho={datosListos}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={etiqueta}>Título <span style={{ fontWeight: 600, opacity: 0.6 }}>({(f.titulo || '').length}/60)</span></label>
              <input style={campo} value={f.titulo || ''} maxLength={60} disabled={publicado} onChange={e => set('titulo', e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
              <div><label style={etiqueta}>Precio (MXN){b.costo != null ? ` · te costó $${Number(b.costo).toLocaleString('es-MX')}` : ''}</label><input style={{ ...campo, fontSize: 18, fontWeight: 800 }} inputMode="decimal" placeholder="0.00" value={f.precio ?? ''} disabled={publicado} onChange={e => set('precio', e.target.value)} /></div>
              <div><label style={etiqueta}>Cantidad</label><input style={campo} inputMode="numeric" value={f.cantidad ?? ''} disabled={publicado} onChange={e => set('cantidad', e.target.value)} /></div>
              <div><label style={etiqueta}>Días de entrega</label><input style={campo} inputMode="numeric" placeholder="Inmediata" value={f.dias_entrega ?? ''} disabled={publicado} onChange={e => set('dias_entrega', e.target.value)} /><div style={ayuda}>Vacío = entrega inmediata</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
              <div><label style={etiqueta}>Código de barras</label><input style={campo} value={f.gtin || ''} disabled={publicado} onChange={e => set('gtin', e.target.value)} /><div style={ayuda}>Solo números reales (8, 12, 13 o 14 dígitos). Si el producto no tiene, déjalo vacío.</div></div>
              <div><label style={etiqueta}>SKU</label><input style={campo} value={f.sku || ''} disabled={publicado} onChange={e => set('sku', e.target.value)} /></div>
            </div>
            {fotos.length > 0 && (
              <div>
                <label style={etiqueta}>Fotos ({fotos.length})</label>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {fotos.slice(0, 8).map((u, i) => <div key={i} style={{ width: 88, height: 88, flex: 'none', borderRadius: 12, border: BORDE, background: `#f3efe8 url("${u}") center/contain no-repeat` }} />)}
                </div>
              </div>
            )}
            <div>
              <label style={etiqueta}>Descripción</label>
              <textarea style={{ ...campo, minHeight: 100, padding: 14, lineHeight: 1.45, fontWeight: 500 }} value={f.descripcion || ''} disabled={publicado} onChange={e => set('descripcion', e.target.value)} />
            </div>
          </div>
        </Paso>

        <Paso n={2} titulo="Categoría y datos que pide MercadoLibre" hecho={catLista}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: catLista ? 'rgba(15,138,99,0.10)' : 'rgba(42,33,24,0.05)', fontWeight: 700, color: TINTA }}>
              {catLista ? `${f.categoria_nombre} (${f.categoria_id})` : 'Todavía no eliges la categoría'}
            </div>
            {!publicado && <div style={{ display: 'grid', gap: 8 }}>
              <input style={campo} placeholder="Opcional: escribe qué es (ej. kit de arte con pintura fluida)" value={consulta} onChange={e => setConsulta(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button style={botonSuave} disabled={ocupado} onClick={acCats}>{ocupado ? 'Buscando…' : '🔎 Sugerir categorías'}</button><button style={botonSuave} disabled={ocupado} onClick={acCatalogoML}>📚 Buscar en el catálogo de MercadoLibre</button></div>
              {avisoCat && <div style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 700, fontSize: 14, background: avisoCat.t === 'rojo' ? 'rgba(179,38,30,0.10)' : 'rgba(15,138,99,0.12)', color: avisoCat.t === 'rojo' ? ROJO : '#0b6b4d' }}>{avisoCat.x}</div>}
            </div>}
            {f.catalogo_producto_id && <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(15,138,99,0.10)', fontWeight: 700 }}>Catálogo de MercadoLibre: {f.catalogo_nombre || f.catalogo_producto_id}</div>}
            {catML && catML.map(pr => (
              <button key={pr.id} style={{ ...botonSuave, textAlign: 'left', minHeight: 54 }} onClick={() => usarCatML(pr)}><b>{pr.nombre}</b><div style={{ fontWeight: 500, fontSize: 12.5, opacity: 0.7 }}>{pr.id}{pr.dominio ? ` · ${pr.dominio}` : ''}</div></button>
            ))}
            {cats.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={ayuda}>Elige la que corresponde. A veces la primera no es la correcta.</div>
                {cats.map(c => (
                  <button key={c.categoria_id} style={{ ...botonSuave, textAlign: 'left', minHeight: 54, display: 'block' }}
                    onClick={() => { set('categoria_id', c.categoria_id); set('categoria_nombre', c.categoria_nombre); setCats([]) }}>
                    <b>{c.categoria_nombre}</b><div style={{ fontWeight: 500, fontSize: 12.5, opacity: 0.7 }}>{c.dominio}</div>
                  </button>
                ))}
              </div>
            )}
            {!publicado && catLista && <div><button style={botonSuave} disabled={ocupado} onClick={acOblig}>📋 Ver datos obligatorios de esta categoría</button></div>}
            {oblig.map(o => (
              <div key={o.id}>
                <label style={etiqueta}>{o.nombre}</label>
                <input style={campo} value={at[o.id] || ''} onChange={e => setAt(o.id, e.target.value)} />
                {o.opciones.length > 0 && <div style={ayuda}>Ejemplos: {o.opciones.slice(0, 6).join(', ')}</div>}
              </div>
            ))}
          </div>
        </Paso>

        {!publicado && (
          <Paso n={3} titulo="Paquete para el envío" hecho={paqueteListo}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 14 }}>
              {[['SELLER_PACKAGE_HEIGHT', 'Alto (cm)', 'cm'], ['SELLER_PACKAGE_WIDTH', 'Ancho (cm)', 'cm'], ['SELLER_PACKAGE_LENGTH', 'Largo (cm)', 'cm'], ['SELLER_PACKAGE_WEIGHT', 'Peso (g)', 'g']].map(([id, et, u]) => (
                <div key={id}>
                  <label style={etiqueta}>{et}</label>
                  <input style={campo} inputMode="decimal" value={num(id)} onChange={e => setAt(id, e.target.value ? `${e.target.value} ${u}` : '')} />
                </div>
              ))}
            </div>
            <div style={ayuda}>MercadoLibre siempre pide las medidas y el peso de la caja ya empacada.</div>
          </Paso>
        )}

        {!publicado && (
          <Paso n={4} titulo="Revisar y crear" hecho={b.estado === 'validado'}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={ayuda}>Primero MercadoLibre lo revisa sin publicar nada. Si lo acepta, podrás crearlo; queda <b>en pausa</b> y tú lo activas.</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button style={boton(AZUL_CLARO, ocupado)} disabled={ocupado} onClick={acGuardar}>Guardar</button>
                <button style={boton('#6B4FA0', ocupado)} disabled={ocupado} onClick={acValidar}>Revisar con MercadoLibre</button>
                <button style={boton(VERDE, ocupado || b.estado !== 'validado')} disabled={ocupado || b.estado !== 'validado'} onClick={acPublicar}>Crear en MercadoLibre (en pausa)</button>
              </div>
              <div><button style={{ ...botonSuave, color: ROJO, borderColor: 'rgba(179,38,30,0.35)' }} disabled={ocupado} onClick={acDescartar}>Descartar este borrador</button></div>
            </div>
          </Paso>
        )}
      </div>}
    </article>
  )
}

export default function Borradores() {
  const [lista, setLista] = useState([])
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('pendientes')
  const cargar = useCallback(async () => {
    const r = await fetch('/api/mercadolibre/borradores', { cache: 'no-store' })
    const d = await r.json()
    if (d.ok) setLista(d.borradores); else setError(d.mensaje)
  }, [])
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t) }, [cargar])
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes([]); return }
      const r = await fetch(`/api/mercadolibre/empaque/productos?q=${encodeURIComponent(q)}`)
      const d = await r.json()
      if (d.ok) setRes(d.productos)
    }, 350)
    return () => clearTimeout(t)
  }, [q])
  async function crear(p) {
    const d = await api({ accion: 'crear', producto_id: p.id })
    if (d.ok) { setQ(''); setRes([]); cargar() } else setError(d.mensaje)
  }
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '22px 16px 80px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...tarjeta, padding: '22px 22px 20px', background: `linear-gradient(135deg, ${AMARILLO_ML} 0%, #fff4a8 100%)`, border: '1.5px solid rgba(42,33,24,0.18)' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#2a2118' }}>Borradores de MercadoLibre</h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5, color: '#3b2f20', fontWeight: 600 }}>
          Elige un producto del catálogo, pon el precio y revisa. Nada se publica hasta que tú lo confirmes, y al crearse queda <b>en pausa</b>.
        </p>
      </div>

      <div style={{ ...tarjeta, padding: 20 }}>
        <label style={{ ...etiqueta, fontSize: 15 }}>＋ Nuevo borrador desde el catálogo</label>
        <input style={{ ...campo, minHeight: 52, fontSize: 16 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe el nombre o el código del producto…" />
        {res.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {res.map(p => (
              <button key={p.id} style={{ ...botonSuave, textAlign: 'left', minHeight: 62, display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => crear(p)}>
                <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 10, border: BORDE, background: `#f3efe8 url("${p.imagen_url || ''}") center/cover no-repeat` }} />
                <span style={{ flex: 1, minWidth: 0 }}>{p.nombre}</span>
                <span style={{ fontSize: 12.5, opacity: 0.7 }}>hay {p.stock}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div style={{ color: ROJO, fontWeight: 700 }}>{error}</div>}
      {lista.length > 0 && (() => {
        const grupo = (b) => (b.estado === 'publicado' ? 'creados' : b.estado === 'validado' ? 'listos' : 'arreglar')
        const n = (g) => lista.filter(b => grupo(b) === g).length
        const tabs = [['pendientes', 'En proceso', n('arreglar') + n('listos')], ['arreglar', 'Por arreglar', n('arreglar')], ['listos', 'Listos para crear', n('listos')], ['creados', 'Ya creadas', n('creados')], ['todos', 'Todos', lista.length]]
        return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabs.map(([k, et, c]) => <button key={k} onClick={() => setFiltro(k)} style={{ ...botonSuave, background: filtro === k ? AZUL : '#fff', color: filtro === k ? '#fff' : TINTA, borderColor: filtro === k ? AZUL : undefined }}>{et} · {c}</button>)}
        </div>
      })()}
      {lista.filter(b => filtro === 'todos' || (filtro === 'pendientes' ? b.estado !== 'publicado' : filtro === 'creados' ? b.estado === 'publicado' : filtro === 'listos' ? b.estado === 'validado' : b.estado !== 'publicado' && b.estado !== 'validado')).map(b => <Borrador key={`${b.id}-${b.actualizado_en}`} b={b} alCambiar={cargar} />)}
      {!lista.length && <div style={{ textAlign: 'center', padding: 30, color: 'rgba(42,33,24,0.65)', fontWeight: 600 }}>Todavía no hay borradores. Busca un producto arriba para empezar.</div>}
    </div>
  )
}
