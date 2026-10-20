'use client'
import { useState, useEffect, useMemo } from 'react'
import { precioSugerido, utilidadEstimada, fechaCorta } from '@/lib/tendencias/comun'

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
      const base = [`*${p.nombre}*`, p.gancho, precio ? `💲${precio.toLocaleString('es-MX')}` : '💲[precio]', 'Aparta con tu anticipo · llega en la próxima entrega'].filter(Boolean).join('\n')
      return { ...p, precio, gana, texto: textos[p.clave] ?? base, publicado: publicados.has(p.clave) }
    })
  }, [lista, precios, textos, publicados])

  const visibles = productos.filter(p => filtro === 'todos' ? true : filtro === 'pendientes' ? !p.publicado : p.tipo === filtro)

  const copiar = async (clave, texto) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(c => c === clave ? null : c), 2500) }
    catch { notificar('error', 'No se pudo copiar. Selecciona el texto y cópialo a mano.') }
  }

  const proximas = (datos?.calendario || []).filter(e => e.tono !== 'gris' || e.faltan <= 90).slice(0, 6)
  const sinEtiquetas = datos && datos.etiquetas.hechas === 0

  return (
    <div className="tendencias" style={{ minHeight: '100vh', background: 'var(--fondo)', padding: '22px 20px 60px' }}>
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

            {/* ── Lista para publicar ── */}
            <Titulo
              sub={lista ? `Generada el ${new Date(lista.creado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })}${lista.enfoque ? ` · enfoque: ${lista.enfoque}` : ''} · ${publicados.size} de ${productos.length} publicados` : 'Todavía no hay lista. Dale a "Generar lista nueva".'}
              derecha={precios && <button className="btn btn-neutro" onClick={() => setVerPrecios(v => !v)} aria-expanded={verPrecios}>Ajustar precios</button>}>
              Lista para publicar
            </Titulo>

            {verPrecios && precios && (
              <div style={{ ...card, padding: 14, marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {[['factor', 'Pesos por cada dólar', 'Así le pones precio: US$4 × 31 = $125'], ['tipoCambio', 'Tipo de cambio', 'Para calcular cuánto ganas'], ['impuesto', 'Impuesto %', 'Tax de la tienda']].map(([k, label, ayuda]) => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--w55)', fontWeight: 600, flex: '1 1 160px' }}>
                    {label}
                    <input type="number" step="0.1" inputMode="decimal" value={precios[k]} className="num"
                      onChange={e => setPrecios(p => ({ ...p, [k]: e.target.value }))} />
                    <span style={{ fontWeight: 400, color: tenue }}>{ayuda}</span>
                  </label>
                ))}
                <button className="btn btn-neutro" onClick={() => setPrecios(datos.precios)}>Usar mis promedios</button>
              </div>
            )}

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
                        ? <img src={p.imagen_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} />
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
                        <button className="btn btn-wa" style={{ flex: '1 1 130px' }} onClick={() => copiar(p.clave, p.texto)}>
                          {copiado === p.clave ? '✓ Copiado' : 'Copiar texto'}
                        </button>
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
          </>
        )}
      </div>
    </div>
  )
}
