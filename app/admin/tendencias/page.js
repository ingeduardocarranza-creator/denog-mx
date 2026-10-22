'use client'
import { useState, useEffect, useMemo } from 'react'
import { precioSugerido, utilidadEstimada, fechaCorta } from '@/lib/tendencias/comun'
import { urlBusqueda, esDeTienda } from '@/lib/tendencias/enlaces'
import { NOMBRE_FUENTE } from '@/lib/tendencias/fuentes'

// ---------------------------------------------------------------------------
// Tendencias — ¿qué publico en esta venta?
//
// 1. Lo que viene: fechas de temporada cruzadas con las entregas.
// 2. Lista para publicar: la arma Claude buscando en internet (botón). Cada
//    producto trae link, foto, precio en dólares y texto para el grupo. El
//    precio en pesos se calcula aquí con el factor de Lalo (ajustable).
// 3. Lo que te funciona: tus pedidos, agrupados por TIPO de producto (la IA
//    los etiqueta una vez; ver /api/tendencias/etiquetar).
// 4. Qué buscar en tienda física: Ross, Burlington, TJ Maxx… no venden en línea.
// Solo admin.
// ---------------------------------------------------------------------------

const fmt = (n) => n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const usd = (n) => n == null ? 'US$ ?' : `US$${Number(n).toFixed(2)}`
const card = { background: 'var(--sup)', border: '1px solid var(--w07)', borderRadius: 16 }
const tenue = 'var(--w38)'

const TONO = {
  rojo:  { c: 'var(--rojo-t)', bg: 'rgba(var(--rojo-rgb),0.10)', b: 'rgba(var(--rojo-rgb),0.28)' },
  ambar: { c: 'var(--ambar-t)', bg: 'var(--ambar-suave)', b: 'var(--ambar-borde)' },
  verde: { c: 'var(--verde-t)', bg: 'var(--verde-suave)', b: 'var(--verde-borde)' },
  azul:  { c: 'var(--azul-t)', bg: 'var(--azul-suave)', b: 'var(--azul-borde)' },
  gris:  { c: 'var(--gris-t)', bg: 'var(--gris-suave)', b: 'var(--gris-borde)' },
  marca: { c: 'var(--marca-t)', bg: 'var(--marca-suave)', b: 'var(--marca-borde)' },
}
const TONO_TIPO = { temporada: 'marca', tendencia: 'azul', funciona: 'verde' }
const FILTROS = [['todos', 'Todos'], ['temporada', 'Temporada'], ['tendencia', 'Tendencia'], ['funciona', 'Te funciona'], ['pendientes', 'Sin publicar']]

function Pastilla({ tono = 'gris', children }) {
  const t = TONO[tono]
  return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, color: t.c, background: t.bg, border: `1px solid ${t.b}`, whiteSpace: 'nowrap' }}>{children}</span>
}

function Titulo({ children, sub, derecha }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '30px 0 12px' }}>
      <div>
        <div style={{ color: 'var(--tinta)', fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{children}</div>
        {sub && <div style={{ color: tenue, fontSize: 12.5, marginTop: 2 }}>{sub}</div>}
      </div>
      {derecha}
    </div>
  )
}

// El texto que va pegado a la foto en el grupo: título, color, tallas y precio.
// Nunca lleva link ni la tienda: el cliente compra la foto con el texto.
function textoWhatsApp(p, precio) {
  return [
    `*${p.nombre}*`,
    p.colores ? `Color: ${p.colores}` : null,
    p.tallas ? `Tallas: ${p.tallas}` : null,
    // "$" y sin comas: así lo lee el registro de ventas por WhatsApp (extraerPrecioDeCaption).
    precio ? `💵 Precio: $${Math.round(precio)}` : '💵 Precio: $[precio]',
  ].filter(Boolean).join('\n')
}

// Cualquier imagen (jpg, webp…) → PNG, el único formato que el portapapeles acepta en todos los navegadores.
// Las fotos grandes se bajan a 1600 px: WhatsApp las comprime igual y así se copian rápido.
async function aPng(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url })
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    if (blob.type === 'image/png' && escala === 1) return blob
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error('png')), 'image/png'))
  } finally { URL.revokeObjectURL(url) }
}

// Mensaje de WhatsApp para quienes compran en tienda: qué buscar hoy en cada una.
function textoGuia(datos) {
  const lineas = [`*GUÍA DE COMPRAS · ${fechaCorta(datos.hoy).toUpperCase()}*`, 'Lo que más se vende y más deja. Prioricen esto en las fotos:']
  const temporadas = (datos.calendario || []).filter(e => e.activo && e.tuyos?.length)
  if (temporadas.length) {
    lineas.push('', '*Temporada*')
    for (const e of temporadas.slice(0, 3)) lineas.push(`• ${e.nombre}: ${e.tuyos.slice(0, 4).map(t => t.tipo.toLowerCase()).join(', ')}`)
  }
  for (const g of datos.guiaPorTienda.slice(0, 7)) {
    lineas.push('', `*${g.tienda}*`)
    for (const t of g.tipos.slice(0, 5)) lineas.push(`• ${t.tipo}${t.usd ? ` (hasta ~US$${Math.ceil(t.usd * 1.3)})` : ''}`)
  }
  if (datos.margenBajo?.length) {
    lineas.push('', '*Solo si está muy barato* (deja poco)')
    lineas.push(`• ${datos.margenBajo.slice(0, 5).map(t => t.tipo.toLowerCase()).join(', ')}`)
  }
  return lineas.join('\n')
}

function leerLocal(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export default function Tendencias() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [etiquetando, setEtiquetando] = useState(null)   // { hechos, faltan }
  const [generando, setGenerando] = useState(false)
  const [enfoque, setEnfoque] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [copiado, setCopiado] = useState(null)
  const [textos, setTextos] = useState({})              // ediciones del texto de WhatsApp
  const [precios, setPrecios] = useState(null)          // { factor, tipoCambio, impuesto }
  const [verPrecios, setVerPrecios] = useState(false)
  const [tab, setTab] = useState('ofertas')             // ofertas | lista | historial
  const [actualizando, setActualizando] = useState(false)
  const [fOf, setFOf] = useState({ tienda: 'todas', familia: 'todas', minimo: 0, sinPublicar: true, q: '' })
  const [cuantas, setCuantas] = useState(60)
  // En celular: el menú de compartir manda foto + texto juntos a WhatsApp.
  // En computadora: WhatsApp casi nunca sale en ese menú, así que se copia la
  // foto (⌘V en el chat) y luego el texto (⌘V en el pie de foto).
  const [celular, setCelular] = useState(false)
  useEffect(() => {
    try { setCelular(typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) } catch {}
  }, [])

  const notificar = (tipo, texto) => { setAviso({ tipo, texto }); setTimeout(() => setAviso(null), 7000) }

  const cargar = async () => {
    try {
      const r = await fetch('/api/tendencias', { cache: 'no-store' }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje || 'No se pudo cargar')
      setDatos(r); setError(null)
      setPrecios(p => p || leerLocal('tendencias_precios', null) || r.precios)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => { if (precios) guardarLocal('tendencias_precios', precios) }, [precios])

  // ── Etiquetado con IA, por lotes hasta terminar ──
  const etiquetar = async () => {
    setEtiquetando({ hechos: 0, faltan: datos?.etiquetas?.faltan || 0 })
    let hechos = 0, faltan = 1, errores = 0
    while (faltan > 0 && errores < 3) {
      try {
        const r = await fetch('/api/tendencias/etiquetar', { method: 'POST' }).then(r => r.json())
        if (!r.ok) throw new Error(r.mensaje)
        hechos += r.hechos; faltan = r.faltan
        setEtiquetando({ hechos, faltan })
      } catch (e) {
        errores++
        if (errores >= 3) notificar('error', `Se detuvo el etiquetado: ${e.message}`)
      }
    }
    setEtiquetando(null)
    await cargar()
    if (faltan === 0) notificar('ok', `Listo: ${hechos.toLocaleString('es-MX')} productos etiquetados.`)
  }

  // ── Generar lista con búsqueda en internet ──
  const generar = async () => {
    setGenerando(true)
    try {
      const r = await fetch('/api/tendencias/generar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enfoque }),
      }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje)
      setDatos(d => ({ ...d, lista: r.lista }))
      setTextos({}); setFiltro('todos')
      notificar('ok', `Lista nueva con ${r.lista.productos.length} productos (${r.lista.busquedas || 0} búsquedas).`)
    } catch (e) { notificar('error', `No se pudo generar: ${e.message}`) }
    setGenerando(false)
  }

  // ── Ofertas del día ──
  const actualizarOfertas = async () => {
    setActualizando(true)
    try {
      const r = await fetch('/api/tendencias/ofertas/actualizar', { method: 'POST' }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje)
      await cargar()
      notificar('ok', r.nuevas === 0 && !r.correos
        ? 'No hay ofertas nuevas desde la última vez. Intenta más tarde.'
        : `${r.nuevas} ofertas nuevas revisadas, ${r.utiles} sirven para Denog.${r.correoConfigurado ? ` Correos de tiendas leídos: ${r.correos}.` : ''}${r.errores.length ? ` (${r.errores.length} aviso${r.errores.length > 1 ? 's' : ''}: ${r.errores[0]})` : ''}`)
    } catch (e) { notificar('error', `No se pudieron traer ofertas: ${e.message}`) }
    setActualizando(false)
  }

  const cambiarOferta = async (o, cambios) => {
    setDatos(d => ({ ...d, ofertas: cambios.descartado ? d.ofertas.filter(x => x.id !== o.id) : d.ofertas.map(x => x.id === o.id ? { ...x, ...cambios } : x) }))
    try {
      const r = await fetch('/api/tendencias/ofertas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: o.id, ...cambios }),
      }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje)
    } catch (e) { notificar('error', e.message); cargar() }
  }

  // Compartir foto + texto directo a WhatsApp (celular y Mac). Si el equipo
  // no deja compartir archivos, copia el texto y abre la foto.
  const compartir = async (clave, texto, fotoUrl) => {
    try {
      if (fotoUrl && navigator.canShare) {
        const blob = await fetch(fotoUrl).then(r => { if (!r.ok) throw new Error('sin foto'); return r.blob() })
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const archivo = new File([blob], `denog-${clave}.${ext}`, { type: blob.type })
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: texto })
          return
        }
      }
    } catch (e) { if (e?.name === 'AbortError') return }
    await copiar(clave, texto)
    if (fotoUrl) window.open(fotoUrl, '_blank', 'noopener')
  }

  // Copia la foto al portapapeles como PNG (lo que acepta WhatsApp al pegar).
  // El ClipboardItem se arma dentro del clic con una promesa: Safari lo exige.
  const copiarFoto = async (clave, fotoUrl) => {
    try {
      const png = fetch(fotoUrl).then(r => { if (!r.ok) throw new Error('sin foto'); return r.blob() }).then(aPng)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      setCopiado(clave + ':foto'); setTimeout(() => setCopiado(c => c === clave + ':foto' ? null : c), 4000)
      notificar('ok', 'Foto copiada: pégala en el chat con ⌘V. Luego dale otra vez al botón para copiar el texto.')
      return true
    } catch {
      notificar('error', 'No se pudo copiar la foto. Te la abro en otra pestaña: arrástrala al chat de WhatsApp.')
      window.open(fotoUrl, '_blank', 'noopener')
      return false
    }
  }

  // Botones según el equipo:
  //  · Celular: "Compartir" → WhatsApp con foto + texto en un paso.
  //  · Computadora: un solo botón en dos pasos. 1er clic copia la foto (⌘V en
  //    el chat), 2º clic copia el texto (⌘V en el pie de foto). La app de
  //    WhatsApp para Mac no aparece en el menú de compartir, por eso así.
  const [paso, setPaso] = useState({})   // clave → 'texto' cuando ya se copió la foto
  const botonesCompartir = (clave, texto, fotoUrl, alHacer, estilo = {}) => {
    if (celular || !fotoUrl) return (
      <button className="btn btn-wa" style={{ flex: 1, padding: '0 10px', ...estilo }} onClick={async () => { await compartir(clave, texto, fotoUrl); alHacer?.() }}>
        {copiado === clave ? '✓ Copiado' : 'Compartir'}
      </button>
    )
    const tocaTexto = paso[clave] === 'texto'
    return (
      <button className={`btn ${tocaTexto ? 'btn-marca' : 'btn-wa'}`} style={{ flex: 1, padding: '0 10px', ...estilo }}
        onClick={async () => {
          if (!tocaTexto) {
            const ok = await copiarFoto(clave, fotoUrl)
            if (ok) setPaso(p => ({ ...p, [clave]: 'texto' }))
          } else {
            await copiar(clave, texto)
            setPaso(p => { const n = { ...p }; delete n[clave]; return n })
            alHacer?.()
          }
        }}>
        {tocaTexto ? '2 · Copiar texto' : copiado === clave ? '✓ Listo' : '1 · Copiar foto'}
      </button>
    )
  }

  const lista = datos?.lista
  const publicados = useMemo(() => new Set(lista?.publicados || []), [lista])

  const marcarPublicado = async (p) => {
    const nuevo = !publicados.has(p.clave)
    setDatos(d => ({ ...d, lista: { ...d.lista, publicados: nuevo ? [...publicados, p.clave] : [...publicados].filter(x => x !== p.clave) } }))
    try {
      const r = await fetch('/api/tendencias/lista', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lista.id, clave: p.clave, publicado: nuevo }),
      }).then(r => r.json())
      if (!r.ok) throw new Error(r.mensaje)
    } catch (e) { notificar('error', e.message); cargar() }
  }

  const productos = useMemo(() => {
    if (!lista || !precios) return []
    return (lista.productos || []).map(p => {
      const precio = precioSugerido(p.precio_usd, Number(precios.factor))
      const gana = utilidadEstimada(p.precio_usd, precio, Number(precios.tipoCambio), Number(precios.impuesto))
      // Listas viejas pueden traer un link que no es de la tienda: se cambia por la búsqueda.
      const url = p.url && esDeTienda(p.url) ? p.url : urlBusqueda(p.tienda, p.nombre)
      return { ...p, url, precio, gana, texto: textos[p.clave] ?? textoWhatsApp(p, precio), publicado: publicados.has(p.clave) }
    })
  }, [lista, precios, textos, publicados])

  const visibles = productos.filter(p => filtro === 'todos' ? true : filtro === 'pendientes' ? !p.publicado : p.tipo === filtro)

  const ofertas = useMemo(() => {
    if (!datos?.ofertas || !precios) return []
    return datos.ofertas.map(o => {
      const precio = precioSugerido(o.precio_usd, Number(precios.factor))
      const gana = utilidadEstimada(o.precio_usd, precio, Number(precios.tipoCambio), Number(precios.impuesto))
      return { ...o, precio, gana, texto: textos['o' + o.id] ?? textoWhatsApp(o, precio) }
    })
  }, [datos, precios, textos])
  const tiendasOf = useMemo(() => {
    const m = new Map(); for (const o of ofertas) m.set(o.tienda, (m.get(o.tienda) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter(Boolean)
  }, [ofertas])
  const familiasOf = useMemo(() => [...new Set(ofertas.map(o => o.familia).filter(Boolean))].sort(), [ofertas])
  const ofertasVisibles = ofertas.filter(o => {
    if (fOf.tienda !== 'todas' && o.tienda !== fOf.tienda) return false
    if (fOf.familia !== 'todas' && o.familia !== fOf.familia) return false
    if (o.puntaje < fOf.minimo) return false
    if (fOf.sinPublicar && o.publicado) return false
    if (fOf.q && !`${o.nombre} ${o.tipo} ${o.tienda}`.toLowerCase().includes(fOf.q.toLowerCase())) return false
    return true
  })

  const copiar = async (clave, texto) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(c => c === clave ? null : c), 2500) }
    catch { notificar('error', 'No se pudo copiar. Selecciona el texto y cópialo a mano.') }
  }

  const proximas = (datos?.calendario || []).filter(e => e.tono !== 'gris' || e.faltan <= 90).slice(0, 6)
  const sinEtiquetas = datos && datos.etiquetas.hechas === 0

  return (
    <div className="tendencias" style={{ minHeight: '100vh', background: 'var(--fondo)', color: 'var(--tinta)', padding: '22px 20px 60px' }}>
      <style>{`
        .tendencias .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
        .tendencias .btn { border-radius: 10px; padding: 0 16px; min-height: 42px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: filter .15s, background .15s; display: inline-flex; align-items: center; justify-content: center; gap: 7px; }
        .tendencias .btn:hover:not(:disabled) { filter: brightness(1.1); }
        .tendencias .btn:disabled { opacity: .5; cursor: not-allowed; }
        .tendencias .btn-marca { background: var(--marca); color: #fff; }
        .tendencias .btn-wa { background: var(--wa); color: #fff; }
        .tendencias .btn-neutro { background: transparent; border-color: var(--w13); color: var(--w60); }
        .tendencias .btn-neutro:hover:not(:disabled) { background: var(--w05); }
        .tendencias input, .tendencias textarea { background: var(--w05); border: 1px solid var(--w12); border-radius: 10px; padding: 9px 11px; color: var(--tinta); font-size: 13px; outline: none; box-sizing: border-box; font-family: inherit; }
        .tendencias input:focus, .tendencias textarea:focus { border-color: var(--marca-borde); box-shadow: 0 0 0 3px var(--marca-suave); }
        .tendencias .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
        .tendencias .rejilla-cal { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)); gap: 10px; }
        .tendencias .foto { height: 180px; background: var(--sup-2); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--w06); text-decoration: none; overflow: hidden; }
        .tendencias .rejilla-of { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
        .tendencias .foto-chica { height: 150px; }
        .tendencias .foto img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
        .tendencias .fila-tipo { display: grid; grid-template-columns: minmax(0, 2.4fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.3fr); gap: 10px; align-items: center; padding: 11px 16px; border-top: 1px solid var(--w05); font-size: 13px; }
        @media (max-width: 760px) {
          .tendencias .fila-tipo { grid-template-columns: minmax(0, 1fr) auto; }
          .tendencias .fila-tipo .ocultar-movil { display: none; }
        }
        @keyframes girar { to { transform: rotate(360deg) } }
        .tendencias .girando { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: girar .8s linear infinite; }
      `}</style>

      <div style={{ maxWidth: 1140, margin: '0 auto' }}>
        {/* ── Encabezado ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <div style={{ color: tenue, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Tendencias</div>
            <div style={{ color: 'var(--tinta)', fontSize: 27, fontWeight: 800, letterSpacing: -0.7, marginTop: 2 }}>¿Qué publico en esta venta?</div>
            <div style={{ color: tenue, fontSize: 13.5, marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
              Tu historial, las temporadas que vienen y lo que está barato o en tendencia en las tiendas de USA.
              {datos?.proximaEntrega && <> Próxima entrega: <b style={{ color: 'var(--tinta)' }}>{fechaCorta(datos.proximaEntrega)}</b>.</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '1 1 360px', justifyContent: 'flex-end' }}>
            <input value={enfoque} onChange={e => setEnfoque(e.target.value)} disabled={generando}
              placeholder="Enfoque opcional: ej. regalos de Navidad, más de Costco…" aria-label="Enfoque de la lista"
              style={{ flex: '1 1 220px', minWidth: 0, minHeight: 42 }} />
            <button className="btn btn-marca" onClick={generar} disabled={generando || !datos}>
              {generando ? <><span className="girando" aria-hidden="true" /> Buscando…</> : 'Generar lista nueva'}
            </button>
          </div>
        </div>

        {generando && (
          <div style={{ ...card, padding: '12px 15px', marginTop: 14, fontSize: 13, color: 'var(--w60)', lineHeight: 1.5 }}>
            Buscando ofertas y tendencias en Walmart, Target, Amazon, Costco, Sam&apos;s y redes sociales. Tarda de 1 a 3 minutos; no cierres esta pestaña.
          </div>
        )}

        {aviso && (
          <div role="status" style={{ ...card, padding: '11px 15px', marginTop: 14, fontSize: 13, lineHeight: 1.5,
            color: aviso.tipo === 'error' ? 'var(--rojo-t)' : 'var(--verde-t)',
            background: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.08)' : 'var(--verde-suave)',
            borderColor: aviso.tipo === 'error' ? 'rgba(var(--rojo-rgb),0.3)' : 'var(--verde-borde)' }}>
            {aviso.texto}
          </div>
        )}

        {error && <div style={{ ...card, padding: 24, marginTop: 16, color: 'var(--rojo-t)', fontSize: 13 }}>{error}</div>}
        {!datos && !error && <div style={{ ...card, padding: 34, marginTop: 16, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>Leyendo tus pedidos…</div>}

        {datos && (
          <>
            {/* ── Etiquetado pendiente ── */}
            {(datos.etiquetas.faltan > 0 || etiquetando) && (
              <div style={{ ...card, padding: '14px 16px', marginTop: 16, background: 'var(--marca-suave)', borderColor: 'var(--marca-borde)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--tinta)' }}>
                  {etiquetando ? (
                    <>
                      <b>Etiquetando con IA…</b> {etiquetando.hechos.toLocaleString('es-MX')} listos, faltan {etiquetando.faltan.toLocaleString('es-MX')}.
                      <div style={{ height: 6, background: 'var(--w06)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${(etiquetando.hechos / Math.max(1, etiquetando.hechos + etiquetando.faltan)) * 100}%`, height: '100%', background: 'var(--marca)', transition: 'width .3s' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <b>{datos.etiquetas.faltan.toLocaleString('es-MX')} productos sin etiquetar.</b>{' '}
                      La IA les pone tipo, marca y temporada para encontrar tus patrones. Se hace una sola vez (unos minutos, menos de US$2); después solo etiqueta lo nuevo.
                    </>
                  )}
                </div>
                {!etiquetando && <button className="btn btn-marca" onClick={etiquetar}>Etiquetar con IA</button>}
              </div>
            )}

            {/* ── Lo que viene ── */}
            <Titulo sub="Cuándo empezar a publicar cada fecha, contando que llegue en una entrega antes del día">Lo que viene</Titulo>
            <div className="rejilla-cal">
              {proximas.map(e => (
                <div key={e.clave + e.fecha} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: tenue }}>{fechaCorta(e.fecha)} · en {e.faltan} días</div>
                  <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--tinta)', letterSpacing: -0.3 }}>{e.nombre}</div>
                  <div><Pastilla tono={e.tono}>{e.estado}</Pastilla></div>
                  {e.tuyos.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--w55)', lineHeight: 1.45, marginTop: 2 }}>
                      Ya vendiste: {e.tuyos.slice(0, 3).map(t => t.tipo.toLowerCase()).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Pestañas ── */}
            <div role="tablist" aria-label="Secciones" style={{ display: 'flex', gap: 4, marginTop: 28, padding: 4, background: 'var(--w04)', borderRadius: 12, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
              {[['ofertas', `Ofertas del día${datos.ofertas?.length ? ` · ${datos.ofertas.length}` : ''}`], ['lista', 'Tendencias (búsqueda IA)'], ['historial', 'Lo que te funciona']].map(([v, t]) => (
                <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                  style={{ minHeight: 40, padding: '0 16px', borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: tab === v ? 800 : 600,
                    background: tab === v ? 'var(--sup)' : 'transparent', color: tab === v ? 'var(--tinta)' : 'var(--w50)', boxShadow: tab === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{t}</button>
              ))}
            </div>

            {tab === 'ofertas' && (<>
            <Titulo
              sub={`Rebajas de Amazon, Walmart, Target, Costco, Sam's y más (sitios de ofertas y los correos de las tiendas), ordenadas por lo que a ti te vende. Se actualiza solo a las 6 am, 12 pm y 6 pm${datos.ultimaOferta ? ` · última oferta nueva: ${new Date(datos.ultimaOferta).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })}` : ''}.`}
              derecha={<div style={{ display: 'flex', gap: 8 }}>
                {precios && <button className="btn btn-neutro" onClick={() => setVerPrecios(v => !v)} aria-expanded={verPrecios}>Ajustar precios</button>}
                <button className="btn btn-marca" onClick={actualizarOfertas} disabled={actualizando}>
                  {actualizando ? <><span className="girando" aria-hidden="true" /> Trayendo…</> : 'Traer ofertas nuevas'}
                </button>
              </div>}>
              Ofertas del día
            </Titulo>
            {verPrecios && precios && <PanelPrecios precios={precios} setPrecios={setPrecios} promedios={datos.precios} />}

            {datos.muestra && (
              <div style={{ ...card, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', background: 'var(--verde-suave)', borderColor: 'var(--verde-borde)' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--tinta)' }}>
                  <b>Prueba cómo llega a WhatsApp</b> con <i>{datos.muestra.nombre}</i> de tu catálogo.<br />
                  {celular
                    ? 'Dale a Compartir y elige WhatsApp: la foto se va con el texto como pie de foto.'
                    : 'Clic 1: copia la foto → pégala en el chat con ⌘V. Clic 2: copia el texto → pégalo en el pie de foto con ⌘V y envía.'}
                </div>
                <div style={{ display: 'flex', gap: 6, flex: '0 1 240px' }}>
                  {botonesCompartir('muestra', [`*${datos.muestra.nombre}*`, datos.muestra.variante, `💵 Precio: $${Math.round(Number(datos.muestra.precio_venta))}`].filter(Boolean).join('\n'), `/api/tendencias/foto?producto=${datos.muestra.id}`)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <input value={fOf.q} onChange={e => { setFOf(f => ({ ...f, q: e.target.value })); setCuantas(60) }} placeholder="Buscar…" aria-label="Buscar oferta" style={{ flex: '1 1 180px', minWidth: 0, minHeight: 40 }} />
              <select value={fOf.tienda} onChange={e => { setFOf(f => ({ ...f, tienda: e.target.value })); setCuantas(60) }} aria-label="Tienda" style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--w12)', background: 'var(--w05)', color: 'var(--tinta)', padding: '0 10px', fontSize: 13 }}>
                <option value="todas">Todas las tiendas</option>
                {tiendasOf.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fOf.familia} onChange={e => { setFOf(f => ({ ...f, familia: e.target.value })); setCuantas(60) }} aria-label="Familia" style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--w12)', background: 'var(--w05)', color: 'var(--tinta)', padding: '0 10px', fontSize: 13 }}>
                <option value="todas">Todo tipo de producto</option>
                {familiasOf.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fOf.minimo} onChange={e => { setFOf(f => ({ ...f, minimo: Number(e.target.value) })); setCuantas(60) }} aria-label="Puntaje mínimo" style={{ minHeight: 40, borderRadius: 10, border: '1px solid var(--w12)', background: 'var(--w05)', color: 'var(--tinta)', padding: '0 10px', fontSize: 13 }}>
                <option value={0}>Cualquier puntaje</option>
                <option value={55}>55+ (buenas)</option>
                <option value={70}>70+ (muy para ti)</option>
              </select>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--w60)', minHeight: 40 }}>
                <input type="checkbox" checked={fOf.sinPublicar} onChange={e => setFOf(f => ({ ...f, sinPublicar: e.target.checked }))} /> Solo sin publicar
              </label>
            </div>

            {ofertas.length === 0 && (
              <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w45)', fontSize: 13, lineHeight: 1.6 }}>
                Todavía no hay ofertas. Dale a <b>&quot;Traer ofertas nuevas&quot;</b>: tarda como 1 minuto.
              </div>
            )}
            {ofertas.length > 0 && <div style={{ fontSize: 12.5, color: tenue, marginBottom: 10 }}>{ofertasVisibles.length} ofertas en este filtro · {ofertas.filter(o => o.publicado).length} publicadas</div>}

            <div className="rejilla-of">
              {ofertasVisibles.slice(0, cuantas).map(o => {
                const tono = o.puntaje >= 70 ? 'verde' : o.puntaje >= 55 ? 'ambar' : 'gris'
                const foto = o.imagen_url ? `/api/tendencias/foto?oferta=${o.id}` : null
                // Siempre a la tienda: el producto exacto si se encontró, si no la búsqueda en esa tienda.
                const enTienda = o.url_tienda || urlBusqueda(o.tienda, o.nombre)
                const esBusqueda = !o.url_tienda || o.enlace_tipo === 'busqueda'
                return (
                  <article key={o.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: o.publicado ? 0.7 : 1 }}>
                    <a className="foto foto-chica" href={enTienda} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${o.nombre} en ${o.tienda}`}>
                      {foto
                        ? <img src={foto} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />
                        : <span style={{ color: tenue, fontSize: 12.5, fontWeight: 600 }}>Clic para ver la oferta</span>}
                    </a>
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', gap: 5 }}>
                          <Pastilla tono={tono}>{o.puntaje} pts</Pastilla>
                          {o.ventas > 0 && <Pastilla tono="azul">{o.ventas} {o.ventas === 1 ? 'venta' : 'ventas'}</Pastilla>}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--w60)' }}>{o.tienda}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{o.nombre}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <a href={enTienda} target="_blank" rel="noopener noreferrer" className="btn btn-neutro" style={{ minHeight: 34, padding: '0 10px', fontSize: 12, color: 'var(--azul-t)', borderColor: 'var(--azul-borde)', textDecoration: 'none' }}>
                          {esBusqueda ? `Buscar en ${o.tienda} ↗` : `Comprar en ${o.tienda} ↗`}
                        </a>
                        {o.url && (
                          <a href={o.url} target="_blank" rel="noopener noreferrer" className="btn btn-neutro" style={{ minHeight: 34, padding: '0 10px', fontSize: 12, textDecoration: 'none' }}>
                            Ver en {NOMBRE_FUENTE[o.fuente] || 'la fuente'} ↗
                          </a>
                        )}
                      </div>
                      <div className="num" style={{ display: 'flex', gap: 10, fontSize: 13, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <span><b>{usd(o.precio_usd)}</b>{o.precio_antes_usd > o.precio_usd && <span style={{ color: tenue, textDecoration: 'line-through', marginLeft: 4 }}>{usd(o.precio_antes_usd)}</span>}</span>
                        <span style={{ color: 'var(--marca-t)', fontWeight: 800 }}>→ {fmt(o.precio)}</span>
                        <span style={{ color: 'var(--verde-t)', fontWeight: 700 }}>gana {fmt(o.gana)}</span>
                      </div>
                      {o.razones?.length > 0 && <div style={{ fontSize: 12, color: 'var(--w55)', lineHeight: 1.4 }}>{o.razones.join(' · ')}</div>}
                      <details>
                        <summary style={{ fontSize: 12, color: 'var(--azul-t)', cursor: 'pointer', fontWeight: 600 }}>Ver / editar texto</summary>
                        <textarea value={o.texto} rows={4} aria-label={`Texto para WhatsApp de ${o.nombre}`}
                          onChange={e => setTextos(t => ({ ...t, ['o' + o.id]: e.target.value }))}
                          style={{ width: '100%', marginTop: 6, resize: 'vertical', lineHeight: 1.45, background: 'var(--sup-2)', borderStyle: 'dashed' }} />
                      </details>
                      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 2 }}>
                        {botonesCompartir('o' + o.id, o.texto, foto, () => { if (!o.publicado) cambiarOferta(o, { publicado: true }) })}
                        <button className="btn btn-neutro" style={{ padding: '0 11px', ...(o.publicado ? { color: 'var(--verde-t)', borderColor: 'var(--verde-borde)', background: 'var(--verde-suave)' } : {}) }}
                          onClick={() => cambiarOferta(o, { publicado: !o.publicado })} aria-pressed={o.publicado} title={o.publicado ? 'Publicado (clic para desmarcar)' : 'Marcar como publicado'} aria-label="Marcar como publicado">
                          ✓
                        </button>
                        <button className="btn btn-neutro" style={{ padding: '0 12px' }} onClick={() => cambiarOferta(o, { descartado: true })} aria-label={`Descartar ${o.nombre}`} title="No me sirve">✕</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {ofertasVisibles.length > cuantas && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button className="btn btn-neutro" onClick={() => setCuantas(c => c + 60)}>Ver {Math.min(60, ofertasVisibles.length - cuantas)} más</button>
              </div>
            )}
            {ofertas.length > 0 && <div style={{ fontSize: 12, color: tenue, marginTop: 10, lineHeight: 1.5 }}>Las ofertas vienen de sitios de ofertas de EE.UU. (Hip2Save, DealNews, The Freebie Guy, Bargain Babe y otros). Duran poco y el precio puede cambiar: confírmalo en la tienda antes de comprar.</div>}
            </>)}

            {tab === 'lista' && (<>
            {/* ── Lista para publicar ── */}
            <Titulo
              sub={lista ? `Generada el ${new Date(lista.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })}${lista.enfoque ? ` · enfoque: ${lista.enfoque}` : ''} · ${publicados.size} de ${productos.length} publicados` : 'Todavía no hay lista. Dale a "Generar lista nueva".'}
              derecha={precios && <button className="btn btn-neutro" onClick={() => setVerPrecios(v => !v)} aria-expanded={verPrecios}>Ajustar precios</button>}>
              Lista para publicar
            </Titulo>

            {verPrecios && precios && <PanelPrecios precios={precios} setPrecios={setPrecios} promedios={datos.precios} />}

            {lista && (
              <div role="group" aria-label="Filtrar productos" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
                {FILTROS.map(([v, t]) => (
                  <button key={v} onClick={() => setFiltro(v)} aria-pressed={filtro === v}
                    style={{ minHeight: 38, padding: '0 14px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${filtro === v ? 'var(--marca-borde)' : 'var(--w09)'}`,
                      background: filtro === v ? 'var(--marca-suave)' : 'var(--w025)',
                      color: filtro === v ? 'var(--marca-t)' : 'var(--w55)', fontWeight: filtro === v ? 700 : 500 }}>{t}</button>
                ))}
              </div>
            )}

            {lista && visibles.length === 0 && (
              <div style={{ ...card, padding: 34, textAlign: 'center', color: 'var(--w30)', fontSize: 13 }}>Nada en este filtro.</div>
            )}

            <div className="rejilla">
              {visibles.map(p => {
                const Foto = p.url ? 'a' : 'div'
                return (
                  <article key={p.clave} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: p.publicado ? 0.72 : 1 }}>
                    <Foto className="foto" {...(p.url ? { href: p.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Abrir ${p.nombre} en ${p.tienda}` } : {})}>
                      {p.imagen_url
                        ? <img src={`/api/tendencias/foto?lista=${lista.id}&clave=${p.clave}`} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />
                        : <span style={{ color: tenue, fontSize: 12.5, fontWeight: 600 }}>{p.url ? `Clic para ver en ${p.tienda}` : 'Sin foto'}</span>}
                    </Foto>
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Pastilla tono={TONO_TIPO[p.tipo]}>{p.etiqueta || p.tipo}</Pastilla>
                        {p.publicado && <Pastilla tono="verde">Publicado</Pastilla>}
                      </div>
                      <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--tinta)', lineHeight: 1.3 }}>{p.nombre}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--w55)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <b style={{ color: 'var(--tinta)' }}>{p.tienda}</b>
                        {p.url && <><span aria-hidden="true">·</span><a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--azul-t)', fontWeight: 600 }}>Ver en tienda ↗</a></>}
                        {p.url && !p.urlVerificada && <span title="La IA armó este link; si no abre el producto, búscalo por nombre" style={{ color: 'var(--ambar-t)' }}>· revisa el link</span>}
                      </div>
                      <div className="num" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6, background: 'var(--w025)', borderRadius: 11, padding: '9px 11px' }}>
                        <div><div style={{ fontSize: 11, color: tenue }}>Cuesta</div><div style={{ fontSize: 14.5, fontWeight: 800 }}>{usd(p.precio_usd)}</div></div>
                        <div><div style={{ fontSize: 11, color: tenue }}>Véndelo en</div><div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--marca-t)' }}>{fmt(p.precio)}</div></div>
                        <div><div style={{ fontSize: 11, color: tenue }}>Ganas aprox.</div><div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--verde-t)' }}>{fmt(p.gana)}</div></div>
                      </div>
                      {p.porque && <div style={{ fontSize: 12.5, color: 'var(--w60)', lineHeight: 1.45 }}><b style={{ color: 'var(--tinta)' }}>Por qué: </b>{p.porque}</div>}
                      <textarea value={p.texto} rows={4} aria-label={`Texto para WhatsApp de ${p.nombre}`}
                        onChange={e => setTextos(t => ({ ...t, [p.clave]: e.target.value }))}
                        style={{ resize: 'vertical', lineHeight: 1.45, background: 'var(--sup-2)', borderStyle: 'dashed' }} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                        {botonesCompartir(p.clave, p.texto, p.imagen_url ? `/api/tendencias/foto?lista=${lista.id}&clave=${p.clave}` : null, null, { flex: '1 1 110px' })}
                        <button className="btn btn-neutro" style={{ flex: '1 1 120px', ...(p.publicado ? { color: 'var(--verde-t)', borderColor: 'var(--verde-borde)', background: 'var(--verde-suave)' } : {}) }}
                          onClick={() => marcarPublicado(p)} aria-pressed={p.publicado}>
                          {p.publicado ? '✓ Publicado' : 'Ya lo publiqué'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {lista && <div style={{ fontSize: 12, color: tenue, marginTop: 10, lineHeight: 1.5 }}>Los precios en dólares vienen de la búsqueda y pueden cambiar: confírmalos en la tienda antes de comprar.</div>}

            </>)}

            {tab === 'historial' && (<>
            {/* ── Resultados de lo publicado ── */}
            {datos.resultados && (
              <>
                <Titulo sub="Ofertas que marcaste como publicadas y los pedidos que entraron por WhatsApp con su texto (últimos 30 días). Lo que se reenvía sin el texto no se puede contar.">Resultados de lo publicado</Titulo>
                {datos.resultados.publicadas === 0 ? (
                  <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--w45)', fontSize: 13, lineHeight: 1.6 }}>
                    Todavía no hay publicaciones medidas. Cuando compartas ofertas desde aquí, en esta parte vas a ver cuáles se vendieron y cuáles no.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      {[['Publicadas', datos.resultados.publicadas.toLocaleString('es-MX')], ['Con al menos 1 venta', `${datos.resultados.conVenta} (${Math.round(datos.resultados.tasa * 100)}%)`], ['Pedidos que generaron', datos.resultados.pedidos], ['Utilidad', fmt(datos.resultados.utilidad)]].map(([k, v]) => (
                        <div key={k} style={{ ...card, padding: 16, flex: '1 1 180px' }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: tenue, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k}</div>
                          <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rejilla">
                      {datos.resultados.venden.length > 0 && (
                        <div style={{ ...card, padding: 14 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Lo que más se vende al publicarlo</div>
                          {datos.resultados.venden.map(t => (
                            <div key={t.tipo} className="num" style={{ fontSize: 12.5, padding: '3px 0' }}><b>{t.tipo}</b> <span style={{ color: 'var(--w55)' }}>· {t.conVenta} de {t.publicadas} se vendieron ({Math.round(t.tasa * 100)}%)</span></div>
                          ))}
                        </div>
                      )}
                      {datos.resultados.noVenden.length > 0 && (
                        <div style={{ ...card, padding: 14, background: 'rgba(var(--rojo-rgb),0.05)', borderColor: 'rgba(var(--rojo-rgb),0.2)' }}>
                          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: 'var(--rojo-t)' }}>Publicas y no se vende</div>
                          {datos.resultados.noVenden.map(t => (
                            <div key={t.tipo} className="num" style={{ fontSize: 12.5, padding: '3px 0' }}><b>{t.tipo}</b> <span style={{ color: 'var(--w55)' }}>· 0 de {t.publicadas}</span></div>
                          ))}
                        </div>
                      )}
                      {datos.resultados.mejores.length > 0 && (
                        <div style={{ ...card, padding: 14 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Las ofertas que más vendieron</div>
                          {datos.resultados.mejores.map(o => (
                            <div key={o.id} style={{ fontSize: 12.5, padding: '3px 0', lineHeight: 1.4 }}><b>{o.nombre}</b> <span className="num" style={{ color: 'var(--w55)' }}>· {o.tienda} · {o.pedidos} {o.pedidos === 1 ? 'pedido' : 'pedidos'}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Lo que te funciona ── */}
            <Titulo sub={`De ${datos.totales.pedidos.toLocaleString('es-MX')} pedidos desde ${fechaCorta(datos.totales.desde)}${datos.totales.desde ? ` ${datos.totales.desde.slice(0, 4)}` : ''} · sin devueltos`}>Lo que te funciona</Titulo>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {datos.mejorMes && (
                <div style={{ ...card, padding: 16, flex: '1 1 220px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: tenue, textTransform: 'uppercase', letterSpacing: 0.3 }}>Tu mejor mes</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{datos.mejorMes.nombre}</div>
                  <div className="num" style={{ fontSize: 12.5, color: 'var(--w55)' }}>{datos.mejorMes.piezas.toLocaleString('es-MX')} piezas · {fmt(datos.mejorMes.utilidad)} de utilidad</div>
                </div>
              )}
              {datos.marcas[0] && (
                <div style={{ ...card, padding: 16, flex: '1 1 220px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: tenue, textTransform: 'uppercase', letterSpacing: 0.3 }}>Marcas que más se repiten</div>
                  <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{datos.marcas[0].marca}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--w55)' }}>Luego: {datos.marcas.slice(1, 5).map(m => m.marca).join(', ')}</div>
                </div>
              )}
              <div style={{ ...card, padding: 16, flex: '1 1 220px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: tenue, textTransform: 'uppercase', letterSpacing: 0.3 }}>Dónde compras más</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {datos.tiendas.slice(0, 5).map(t => (
                    <div key={t.nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span style={{ width: 92, flex: '0 0 92px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nombre}</span>
                      <span style={{ flex: 1, height: 8, background: 'var(--w05)', borderRadius: 4, overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(t.pct / datos.tiendas[0].pct) * 100}%`, background: 'var(--marca)', borderRadius: 4 }} />
                      </span>
                      <span className="num" style={{ width: 36, textAlign: 'right', fontWeight: 700 }}>{Math.round(t.pct * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {sinEtiquetas ? (
              <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--w45)', fontSize: 13 }}>
                Etiqueta tus productos con IA (arriba) para ver qué tipos te venden más, cuáles dejan más y qué va subiendo.
              </div>
            ) : (
              <div style={{ ...card, overflow: 'hidden' }}>
                <div className="fila-tipo" style={{ borderTop: 'none', fontSize: 11.5, fontWeight: 700, color: tenue, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  <span>Tipo de producto</span><span className="ocultar-movil">Piezas 90 días</span><span className="ocultar-movil">Ganas por pieza</span><span className="ocultar-movil">Compra típica</span><span>Dónde</span>
                </div>
                {datos.masVendidos.map(t => (
                  <div key={t.tipo} className="fila-tipo">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {t.tipo}{t.subiendo && <Pastilla tono="verde">↑ subiendo</Pastilla>}
                      </div>
                      <div style={{ fontSize: 12, color: tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.ejemplo}>{t.ejemplo}</div>
                    </div>
                    <span className="num ocultar-movil" style={{ fontWeight: 700 }}>{t.piezas90}</span>
                    <span className="num ocultar-movil" style={{ color: 'var(--verde-t)', fontWeight: 700 }}>{fmt(t.utilidadPieza)}</span>
                    <span className="num ocultar-movil">{usd(t.usd)}</span>
                    <span style={{ color: 'var(--w60)' }}>{t.tienda}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Guía para el equipo (se manda por WhatsApp) ── */}
            {datos.guiaPorTienda?.length > 0 && (
              <>
                <Titulo sub="Lo que más te ha dejado en cada tienda en los últimos 90 días. Copia la guía y mándala al grupo de quienes compran y toman fotos."
                  derecha={<button className="btn btn-wa" onClick={() => copiar('guia', textoGuia(datos))}>{copiado === 'guia' ? '✓ Guía copiada' : 'Copiar guía para el equipo'}</button>}>
                  Guía para el equipo en tienda
                </Titulo>
                <div className="rejilla">
                  {datos.guiaPorTienda.map(g => (
                    <div key={g.tienda} style={{ ...card, padding: 14 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{g.tienda}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {g.tipos.map(t => (
                          <div key={t.tipo} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                            <b>{t.tipo}</b> <span className="num" style={{ color: 'var(--w55)' }}>· {usd(t.usd)} → {fmt(t.venta)} · {t.piezas90} vendidos</span>
                            <div style={{ color: tenue, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.ejemplo}>Ej.: {t.ejemplo}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {datos.margenBajo?.length > 0 && (
                    <div style={{ ...card, padding: 14, background: 'rgba(var(--rojo-rgb),0.05)', borderColor: 'rgba(var(--rojo-rgb),0.2)' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: 'var(--rojo-t)' }}>Deja poco por pieza</div>
                      <div style={{ fontSize: 12, color: 'var(--w55)', marginBottom: 8 }}>Se vende, pero ganas menos de $40 por pieza. Solo si es muy barato.</div>
                      {datos.margenBajo.map(t => (
                        <div key={t.tipo} className="num" style={{ fontSize: 12.5, padding: '3px 0' }}><b>{t.tipo}</b> <span style={{ color: 'var(--w55)' }}>· ganas {fmt(t.utilidadPieza)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Tienda física ── */}
            {datos.guia.length > 0 && (
              <>
                <Titulo sub="Ross, Burlington, TJ Maxx y Marshalls no venden en línea. Esto es lo que te ha dejado más ahí en los últimos 90 días.">Qué buscar en tienda física</Titulo>
                <div className="rejilla">
                  {datos.guia.map(t => (
                    <div key={t.tipo} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t.tipo}</div>
                        <span style={{ fontSize: 12, color: tenue, whiteSpace: 'nowrap' }}>{t.tienda}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--w55)', lineHeight: 1.45 }}>Ej.: {t.ejemplo}</div>
                      <div className="num" style={{ fontSize: 12.5, color: 'var(--w60)' }}>
                        Compra {usd(t.usd)} → vende {fmt(t.venta)} · <b style={{ color: 'var(--verde-t)' }}>{fmt(t.utilidad90)}</b> en 90 días
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            </>)}
          </>
        )}
      </div>
    </div>
  )
}

function PanelPrecios({ precios, setPrecios, promedios }) {
  return (
    <div style={{ ...card, padding: 14, marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {[['factor', 'Pesos por cada dólar', 'Así le pones precio: US$4 × 31 = $125'], ['tipoCambio', 'Tipo de cambio', 'Para calcular cuánto ganas'], ['impuesto', 'Impuesto %', 'Tax de la tienda']].map(([k, label, ayuda]) => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--w55)', fontWeight: 600, flex: '1 1 160px' }}>
          {label}
          <input type="number" step="0.1" inputMode="decimal" value={precios[k]} className="num"
            onChange={e => setPrecios(p => ({ ...p, [k]: e.target.value }))} />
          <span style={{ fontWeight: 400, color: tenue }}>{ayuda}</span>
        </label>
      ))}
      <button className="btn btn-neutro" onClick={() => setPrecios(promedios)}>Usar mis promedios</button>
    </div>
  )
}
