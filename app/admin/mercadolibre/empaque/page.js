'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// Empaque de MercadoLibre — pantalla del colaborador (y del admin).
// Un paquete a la vez, con letra grande:
//   1) escanear cada producto  2) imprimir la etiqueta
//   3) escanear la etiqueta ya pegada  4) paquete listo → siguiente
// El sistema asigna el siguiente paquete (primero los urgentes). El stock del
// catálogo se descuenta solo al confirmar la etiqueta. No se muestran precios,
// clientes ni direcciones.

const VERDE = '#2F8F4E'
const ROJO = '#C8362C'
const AMARILLO = '#B58900'
const AZUL = '#466D9B'

const COLOR = {
  verde: { borde: VERDE, fondo: 'rgba(47,143,78,0.14)' },
  rojo: { borde: ROJO, fondo: 'rgba(200,54,44,0.12)' },
  amarillo: { borde: AMARILLO, fondo: 'rgba(181,137,0,0.16)' },
}

function pitar(ok) {
  try {
    const C = window.AudioContext || window.webkitAudioContext
    const ctx = new C()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = ok ? 880 : 220
    g.gain.value = 0.08
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.12 : 0.4))
  } catch {}
}

const tarjeta = { background: 'var(--w04)', border: '2px solid var(--w10)', borderRadius: 22, padding: 28 }
const botonGrande = (color = AZUL, ocupado = false) => ({
  width: '100%', minHeight: 72, borderRadius: 16, border: 'none', background: color, color: '#fff',
  fontWeight: 800, fontSize: 24, cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.6 : 1,
})
const botonSuave = {
  minHeight: 52, padding: '0 22px', borderRadius: 14, border: '2px solid var(--w10)', background: 'var(--w04)',
  color: 'var(--tinta)', fontWeight: 700, fontSize: 17, cursor: 'pointer',
}

function Mensaje({ color, children }) {
  const c = COLOR[color] || COLOR.amarillo
  return (
    <div style={{ background: c.fondo, border: `3px solid ${c.borde}`, borderRadius: 16, padding: '16px 20px', fontSize: 20, fontWeight: 700, lineHeight: 1.4, color: 'var(--tinta)' }}>
      {children}
    </div>
  )
}

function Foto({ url, tam = 120 }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" width={tam} height={tam} style={{ width: tam, height: tam, borderRadius: 18, objectFit: 'cover', flex: 'none' }} />
    : <div style={{ width: tam, height: tam, borderRadius: 18, background: 'var(--w10)', flex: 'none' }} />
}

export default function EmpaqueML() {
  const [pantalla, setPantalla] = useState('menu')
  const [menu, setMenu] = useState(null)
  const [paq, setPaq] = useState(null)
  const [restantes, setRestantes] = useState(0)
  const [omitir, setOmitir] = useState([])
  const [esperando, setEsperando] = useState([])
  const [hechos, setHechos] = useState([])
  const [aviso, setAviso] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [desconocido, setDesconocido] = useState(null)
  const [errorGeneral, setErrorGeneral] = useState('')
  const inputRef = useRef(null)

  const pedir = useCallback(async (url, cuerpo) => {
    const r = await fetch(url, cuerpo
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }
      : { cache: 'no-store' })
    return r.json()
  }, [])

  const cargarMenu = useCallback(async () => {
    try {
      await pedir('/api/mercadolibre/ventas/procesar', {}).catch(() => null)
      const d = await pedir('/api/mercadolibre/empaque?vista=menu')
      if (d.ok) { setMenu(d); setErrorGeneral('') } else setErrorGeneral(d.mensaje || 'No se pudo cargar')
    } catch { setErrorGeneral('No se pudo cargar') }
  }, [pedir])

  useEffect(() => {
    if (pantalla !== 'menu') return
    const t0 = setTimeout(() => { cargarMenu() }, 0)
    const t = setInterval(() => { cargarMenu() }, 30000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [pantalla, cargarMenu])

  // El lector escribe en el campo: se mantiene enfocado mientras se escanea.
  const escaneando = (pantalla === 'escanear' || pantalla === 'verificar') && !desconocido
  useEffect(() => {
    if (escaneando) inputRef.current?.focus()
  }, [escaneando, pantalla, paq])

  const siguiente = useCallback(async (lista) => {
    setOcupado(true); setAviso(null); setDesconocido(null)
    try {
      const d = await pedir(`/api/mercadolibre/empaque?vista=siguiente&omitir=${encodeURIComponent(lista.join(','))}`)
      if (!d.ok) { setErrorGeneral(d.mensaje || 'No se pudo cargar'); setPantalla('menu') }
      else if (!d.paquete) { setPaq(null); setPantalla('vacio') }
      else {
        setPaq(d.paquete); setRestantes(d.restantes)
        setPantalla(d.paquete.todo_escaneado ? 'imprimir' : 'escanear')
      }
    } catch { setErrorGeneral('No se pudo cargar'); setPantalla('menu') }
    setOcupado(false)
  }, [pedir])

  async function abrirLista(vista) {
    setOcupado(true)
    try {
      const d = await pedir(`/api/mercadolibre/empaque?vista=${vista}`)
      if (d.ok) {
        if (vista === 'esperando') setEsperando(d.esperando)
        else setHechos(d.hechos)
        setPantalla(vista)
      } else setErrorGeneral(d.mensaje || 'No se pudo cargar')
    } catch { setErrorGeneral('No se pudo cargar') }
    setOcupado(false)
  }

  async function enviarEscaneo(texto) {
    const valor = texto.trim()
    if (!valor || ocupado) return
    setCodigo(''); setOcupado(true)
    try {
      if (pantalla === 'escanear') {
        const d = await pedir('/api/mercadolibre/empaque/escanear', { paquete: paq.paquete, codigo: valor })
        if (!d.ok) { pitar(false); setAviso({ tipo: 'rojo', texto: d.mensaje }) }
        else if (d.resultado === 'correcto') {
          pitar(true)
          setAviso({ tipo: 'verde', texto: `Correcto · ${d.escaneadas} de ${d.cantidad}` })
          setPaq(d.paquete)
          if (d.paquete?.todo_escaneado) setPantalla('imprimir')
        } else if (d.resultado === 'desconocido') {
          pitar(false); setDesconocido({ codigo: valor, candidatos: d.candidatos, mensaje: d.mensaje })
        } else { pitar(false); setAviso({ tipo: 'rojo', texto: d.mensaje }) }
      } else if (pantalla === 'verificar') {
        const d = await pedir('/api/mercadolibre/empaque/verificar', { paquete: paq.paquete, codigo: valor })
        if (!d.ok) { pitar(false); setAviso({ tipo: 'rojo', texto: d.mensaje }) }
        else if (d.resultado === 'listo') { pitar(true); setAviso(null); setPantalla('listo') }
        else { pitar(false); setAviso({ tipo: 'rojo', texto: d.mensaje }) }
      }
    } catch { pitar(false); setAviso({ tipo: 'rojo', texto: 'No se pudo conectar. Intenta de nuevo.' }) }
    setOcupado(false)
  }

  async function confirmarDesconocido(itemId) {
    setOcupado(true)
    try {
      const d = await pedir('/api/mercadolibre/empaque/aprender', { paquete: paq.paquete, codigo: desconocido.codigo, item_row_id: itemId })
      if (d.ok && d.resultado === 'correcto') {
        pitar(true)
        setAviso({ tipo: 'verde', texto: `Correcto · ${d.escaneadas} de ${d.cantidad}` })
        setPaq(d.paquete); setDesconocido(null)
        if (d.paquete?.todo_escaneado) setPantalla('imprimir')
      } else { pitar(false); setAviso({ tipo: 'rojo', texto: d.mensaje || 'No se pudo confirmar' }); setDesconocido(null) }
    } catch { setAviso({ tipo: 'rojo', texto: 'No se pudo conectar. Intenta de nuevo.' }); setDesconocido(null) }
    setOcupado(false)
  }

  const volverMenu = () => { setPantalla('menu'); setPaq(null); setAviso(null); setDesconocido(null); setOmitir([]) }
  const actual = paq?.items.find(i => i.escaneadas < i.cantidad) || null
  const total = paq?.items.reduce((s, i) => s + i.cantidad, 0) || 0

  const contenedor = { maxWidth: 820, margin: '0 auto', padding: '24px 20px 80px', color: 'var(--tinta)', display: 'flex', flexDirection: 'column', gap: 20 }
  const barra = (texto) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <button style={botonSuave} onClick={volverMenu}>← Menú</button>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--w50)' }}>{texto}</div>
    </div>
  )

  // ─── Menú ───
  if (pantalla === 'menu') {
    const caja = (fondo, borde, titulo, sub, n, alClick) => (
      <button onClick={alClick} style={{ flex: '1 1 320px', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: fondo, border: `3px solid ${borde}`, borderRadius: 22, padding: '22px 26px', cursor: 'pointer', color: 'var(--tinta)' }}>
        <span>
          <span style={{ display: 'block', fontSize: 26, fontWeight: 800 }}>{titulo}</span>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{sub}</span>
        </span>
        <span style={{ minWidth: 72, height: 72, borderRadius: 18, background: 'var(--w10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 800, padding: '0 10px' }}>{n ?? '–'}</span>
      </button>
    )
    return (
      <div style={contenedor}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>MercadoLibre · ¿Qué hacemos?</h1>
        {errorGeneral && <Mensaje color="rojo">{errorGeneral}</Mensaje>}
        <button disabled={ocupado} onClick={() => { setOmitir([]); siguiente([]) }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', background: AZUL, color: '#fff', border: 'none', borderRadius: 22, padding: '28px 32px', cursor: 'pointer' }}>
          <span>
            <span style={{ display: 'block', fontSize: 34, fontWeight: 800 }}>Empacar ahora</span>
            <span style={{ display: 'block', fontSize: 18, fontWeight: 500, marginTop: 6 }}>El sistema te da el siguiente paquete. Primero los urgentes.</span>
          </span>
          <span style={{ minWidth: 96, height: 96, borderRadius: 24, background: '#FCE5D6', color: AZUL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 800, padding: '0 12px' }}>{menu?.para_empacar ?? '–'}</span>
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {caja(COLOR.amarillo.fondo, AMARILLO, 'Esperando etiqueta', 'Pasan solos a "Empacar ahora" cuando la etiqueta esté lista.', menu?.esperando, () => abrirLista('esperando'))}
          {caja(COLOR.verde.fondo, VERDE, 'Hechos hoy', 'Lo que ya empacaste y confirmaste.', menu?.hechos_hoy, () => abrirLista('hechos'))}
        </div>
      </div>
    )
  }

  // ─── Esperando etiqueta ───
  if (pantalla === 'esperando') {
    return (
      <div style={contenedor}>
        {barra('Esperando etiqueta')}
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Esperando etiqueta</h1>
        {esperando.length === 0 && <div style={{ fontSize: 18, color: 'var(--w50)' }}>No hay paquetes esperando etiqueta.</div>}
        {esperando.map(e => (
          <div key={e.paquete} style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {e.productos.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Foto url={p.miniatura} tam={64} />
                <div style={{ fontSize: 19, fontWeight: 700 }}>{p.titulo} <span style={{ color: 'var(--w50)' }}>× {p.cantidad}</span></div>
              </div>
            ))}
            <Mensaje color={e.mensaje.color}>{e.mensaje.texto}</Mensaje>
          </div>
        ))}
      </div>
    )
  }

  // ─── Hechos hoy ───
  if (pantalla === 'hechos') {
    return (
      <div style={contenedor}>
        {barra('Hechos hoy')}
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Hechos hoy</h1>
        {hechos.length === 0 && <div style={{ fontSize: 18, color: 'var(--w50)' }}>Todavía no hay paquetes empacados hoy.</div>}
        {hechos.map(h => (
          <div key={h.paquete} style={{ ...tarjeta, padding: 20 }}>
            <div style={{ fontSize: 15, color: 'var(--w50)', fontWeight: 700 }}>
              {new Date(h.empacada_en).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Hermosillo' })}{h.empacada_por ? ` · ${h.empacada_por}` : ''}
            </div>
            {h.productos.map((p, i) => <div key={i} style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{p.titulo} <span style={{ color: 'var(--w50)' }}>× {p.cantidad}</span></div>)}
          </div>
        ))}
      </div>
    )
  }

  // ─── No hay paquetes ───
  if (pantalla === 'vacio') {
    return (
      <div style={contenedor}>
        {barra('Empacar')}
        <div style={{ ...tarjeta, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>No hay paquetes por empacar ahora</div>
          <div style={{ fontSize: 18, color: 'var(--w50)', marginTop: 10, lineHeight: 1.5 }}>Los que esperan etiqueta pasan aquí solos cuando MercadoLibre la libera.</div>
        </div>
        {omitir.length > 0 && <button style={botonGrande(AZUL)} onClick={() => { setOmitir([]); siguiente([]) }}>Ver los que salté</button>}
        <button style={botonSuave} onClick={volverMenu}>Volver al menú</button>
      </div>
    )
  }

  // ─── Paquete listo ───
  if (pantalla === 'listo') {
    return (
      <div style={contenedor}>
        {barra('Paquete listo')}
        <div style={{ background: COLOR.verde.fondo, border: `3px solid ${VERDE}`, borderRadius: 24, padding: '44px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: VERDE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 800 }}>✓</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>Paquete listo</div>
          <div style={{ fontSize: 19, fontWeight: 600 }}>Llévalo a la zona de salida.</div>
        </div>
        <button style={botonGrande(AZUL, ocupado)} disabled={ocupado} onClick={() => { setOmitir([]); siguiente([]) }}>Siguiente paquete</button>
        <button style={botonSuave} onClick={volverMenu}>Volver al menú</button>
      </div>
    )
  }

  if (!paq) return <div style={contenedor}>{barra('')}</div>

  // ─── Escanear producto ───
  if (pantalla === 'escanear') {
    return (
      <div style={contenedor}>
        {barra(`${restantes} por empacar · ${total} ${total === 1 ? 'pieza' : 'piezas'} en este paquete`)}
        {paq.urgente_hoy && <Mensaje color="rojo">Urgente: este paquete se despacha hoy.</Mensaje>}
        {actual && (
          <div style={{ ...tarjeta, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center' }}>
            <Foto url={actual.miniatura} tam={180} />
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{actual.titulo}</div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>LLEVA</span>
                <span style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, color: AZUL }}>{actual.cantidad}</span>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{actual.cantidad === 1 ? 'pieza' : 'piezas'}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--w50)', marginTop: 4 }}>Escaneadas: {actual.escaneadas} de {actual.cantidad}</div>
            </div>
          </div>
        )}
        {paq.items.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paq.items.map(i => (
              <div key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 17, fontWeight: 600, color: i.escaneadas >= i.cantidad ? VERDE : 'var(--tinta)' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: i.escaneadas >= i.cantidad ? VERDE : 'var(--w10)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{i.escaneadas >= i.cantidad ? '✓' : ''}</span>
                {i.titulo} · {i.escaneadas}/{i.cantidad}
              </div>
            ))}
          </div>
        )}
        {aviso && <Mensaje color={aviso.tipo}>{aviso.texto}</Mensaje>}
        {desconocido ? (
          <div style={{ ...tarjeta, borderColor: AMARILLO }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{desconocido.mensaje}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {desconocido.candidatos.map(c => (
                <button key={c.id} style={botonGrande(AZUL, ocupado)} disabled={ocupado} onClick={() => confirmarDesconocido(c.id)}>Es: {c.titulo}</button>
              ))}
              <button style={botonSuave} onClick={() => setDesconocido(null)}>No es ninguno</button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="lector" style={{ fontSize: 19, fontWeight: 800 }}>Escanea el producto</label>
            <input id="lector" ref={inputRef} value={codigo} autoComplete="off" placeholder="Apunta el lector al código…"
              onChange={e => setCodigo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviarEscaneo(codigo) }}
              style={{ minHeight: 64, borderRadius: 14, border: `3px solid ${AZUL}`, padding: '0 18px', fontSize: 22, background: 'var(--w05)', color: 'var(--tinta)', outline: 'none' }} />
          </>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button style={botonSuave} onClick={() => { const l = [...omitir, paq.paquete]; setOmitir(l); siguiente(l) }}>No lo encuentro · saltar paquete</button>
        </div>
      </div>
    )
  }

  // ─── Imprimir etiqueta ───
  if (pantalla === 'imprimir') {
    return (
      <div style={contenedor}>
        {barra('Último paso: etiqueta')}
        <div style={{ background: COLOR.verde.fondo, border: `3px solid ${VERDE}`, borderRadius: 18, padding: '18px 24px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: VERDE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, flex: 'none' }}>✓</div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>Productos correctos</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{paq.items.map(i => `${i.titulo} ×${i.cantidad}`).join(' · ')}</div>
          </div>
        </div>
        <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>Ahora imprime la etiqueta</div>
          <Mensaje color={paq.mensaje.color}>{paq.mensaje.texto}</Mensaje>
          <button style={botonGrande(AZUL)} onClick={() => { window.open(`/api/mercadolibre/empaque/etiqueta?paquete=${encodeURIComponent(paq.paquete)}`, '_blank'); setAviso(null); setPantalla('verificar') }}>
            Imprimir etiqueta
          </button>
        </div>
      </div>
    )
  }

  // ─── Verificar etiqueta ───
  return (
    <div style={contenedor}>
      {barra('Último paso: verificar')}
      <div style={{ ...tarjeta, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 30, fontWeight: 800 }}>Pega la etiqueta y escanéala</div>
        <div style={{ fontSize: 18, color: 'var(--w50)', lineHeight: 1.5 }}>Así confirmamos que esta etiqueta es de este paquete. Al confirmar, el inventario se descuenta solo.</div>
        <label htmlFor="lector" style={{ fontSize: 16, fontWeight: 700 }}>Lector</label>
        <input id="lector" ref={inputRef} value={codigo} autoComplete="off" placeholder="Apunta el lector a la etiqueta…"
          onChange={e => setCodigo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') enviarEscaneo(codigo) }}
          style={{ minHeight: 64, borderRadius: 14, border: `3px solid ${AZUL}`, padding: '0 18px', fontSize: 22, background: 'var(--w05)', color: 'var(--tinta)', outline: 'none' }} />
      </div>
      {aviso && <Mensaje color={aviso.tipo}>{aviso.texto}</Mensaje>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button style={botonSuave} onClick={() => window.open(`/api/mercadolibre/empaque/etiqueta?paquete=${encodeURIComponent(paq.paquete)}`, '_blank')}>Volver a imprimir la etiqueta</button>
      </div>
    </div>
  )
}
