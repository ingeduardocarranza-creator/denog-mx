'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// Resumen del admin: dinero, tienda, equipo y lo que pide atención. Pensado para
// leerse en 30 segundos, con colores y barras en vez de tablas.

const VERDE = '#58a700', ROJO = '#dc2626', AZUL = '#1cb0f6', NARANJA = '#ff9600'
const dinero = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX')

function Variacion({ actual, antes, etiqueta }) {
  if (!antes) return <span style={{ fontSize: 12, opacity: .6, fontWeight: 700 }}>{etiqueta}: sin dato</span>
  const pct = Math.round(((actual - antes) / antes) * 100)
  const sube = pct >= 0
  return (
    <span style={{ fontSize: 12, fontWeight: 900, color: sube ? VERDE : ROJO }}>
      {sube ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ opacity: .6, fontWeight: 700, color: 'inherit' }}>{etiqueta}</span>
    </span>
  )
}

function Seccion({ titulo, children, tarjeta }) {
  return (
    <div style={{ ...tarjeta, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, opacity: .55, marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Barras({ filas, color = AZUL }) {
  const max = Math.max(1, ...filas.map(f => f.total))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {filas.map((f, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, gap: 8 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
            <span style={{ flex: 'none' }}>{dinero(f.total)}{f.extra ? <span style={{ opacity: .55, fontWeight: 700 }}> · {f.extra}</span> : null}</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: 'rgba(42,33,24,0.08)', marginTop: 3 }}>
            <div style={{ width: `${Math.max(3, (f.total / max) * 100)}%`, height: '100%', borderRadius: 6, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function VistaResumen({ tarjeta, irA }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    const res = await fetch('/api/jarvis/resumen').then(r => r.json()).catch(() => null)
    if (res?.ok) setD(res); else setError(res?.mensaje || 'No se pudo cargar')
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (!d) return <div style={{ ...tarjeta, textAlign: 'center' }}>{error || 'Calculando tu resumen…'}</div>

  const max = Math.max(1, ...d.serie.map(s => s.total))
  const ayerDia = d.serie[d.serie.length - 2]?.dia
  const lecturas = []
  if (d.dinero.ayer_semana_pasada) {
    const p = Math.round(((d.dinero.ayer - d.dinero.ayer_semana_pasada) / d.dinero.ayer_semana_pasada) * 100)
    lecturas.push(p >= 0 ? `Ayer entró ${p}% más que el ${ayerDia} pasado.` : `Ayer entró ${Math.abs(p)}% menos que el ${ayerDia} pasado.`)
  }
  if (d.dinero.semana_anterior) {
    const p = Math.round(((d.dinero.semana - d.dinero.semana_anterior) / d.dinero.semana_anterior) * 100)
    lecturas.push(p >= 0 ? `Esta semana va ${p}% arriba de la anterior.` : `Esta semana va ${Math.abs(p)}% abajo de la anterior.`)
  }
  if (d.top[0]) lecturas.push(`Lo que más dejó en tienda: ${d.top[0].nombre} (${dinero(d.top[0].total)}).`)
  if (d.resurtir.length) lecturas.push(`${d.resurtir.length} productos que sí se venden ya están en cero. Conviene resurtirlos.`)
  if (d.atencion.length) { const n = d.atencion.reduce((s, a) => s + a.n, 0); lecturas.push(n === 1 ? 'Tienes 1 cosa esperando tu decisión.' : `Tienes ${n} cosas esperando tu decisión.`) }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        {[['AYER', d.dinero.ayer, d.dinero.ayer_semana_pasada, `vs ${ayerDia} pasado`, AZUL], ['HOY (va)', d.dinero.hoy, null, '', VERDE]].map(([t, v, antes, et, c]) => (
          <div key={t} style={{ ...tarjeta, flex: 1, borderTop: `5px solid ${c}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, opacity: .55 }}>{t}</div>
            <div style={{ fontSize: 26, fontWeight: 900, margin: '2px 0' }}>{dinero(v)}</div>
            {et ? <Variacion actual={v} antes={antes} etiqueta={et} /> : <span style={{ fontSize: 12, opacity: .6, fontWeight: 700 }}>dinero que ha entrado</span>}
          </div>
        ))}
      </div>

      <Seccion titulo="💵 ÚLTIMOS 14 DÍAS · DINERO QUE ENTRÓ" tarjeta={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
          {d.serie.map((s, i) => (
            <div key={s.fecha} title={`${s.fecha}: ${dinero(s.total)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ width: '100%', height: `${Math.max(2, (s.total / max) * 100)}%`, borderRadius: 5, background: i === d.serie.length - 1 ? VERDE : i === d.serie.length - 2 ? AZUL : 'rgba(28,176,246,0.35)' }} />
              <div style={{ fontSize: 9, fontWeight: 800, opacity: .6, marginTop: 3 }}>{s.dia}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Últimos 7 días: {dinero(d.dinero.semana)}</div>
          <Variacion actual={d.dinero.semana} antes={d.dinero.semana_anterior} etiqueta="vs los 7 anteriores" />
        </div>
      </Seccion>

      {lecturas.length > 0 && (
        <Seccion titulo="🤖 LO QUE VEO" tarjeta={tarjeta}>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 700 }}>
            {lecturas.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </Seccion>
      )}

      {d.atencion.length > 0 && (
        <Seccion titulo="⏳ ESPERA TU DECISIÓN" tarjeta={tarjeta}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.atencion.map(a => {
              const estilo = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: '2px solid rgba(42,33,24,0.10)', background: 'transparent', color: 'inherit', textDecoration: 'none', fontWeight: 800, fontSize: 14, cursor: 'pointer', textAlign: 'left', width: '100%' }
              const contenido = (<><span style={{ fontSize: 22 }}>{a.icono}</span><span style={{ flex: 1 }}>{a.t}</span><span style={{ background: NARANJA, color: '#fff', borderRadius: 999, padding: '2px 10px', fontWeight: 900 }}>{a.n}</span></>)
              return a.href
                ? <Link key={a.clave} href={a.href} style={estilo}>{contenido}</Link>
                : <button key={a.clave} type="button" onClick={() => irA(a.vista)} style={estilo}>{contenido}</button>
            })}
          </div>
        </Seccion>
      )}

      <Seccion titulo="🏬 TIENDA · ÚLTIMOS 7 DÍAS" tarjeta={tarjeta}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['Ventas', dinero(d.tienda.semana)], ['Piezas', d.tienda.piezas_semana], ['Utilidad', dinero(d.tienda.utilidad_semana)]].map(([t, v]) => (
            <div key={t} style={{ flex: 1, background: 'rgba(42,33,24,0.04)', borderRadius: 12, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 900, opacity: .55 }}>{t.toUpperCase()}</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{v}</div>
            </div>
          ))}
        </div>
        <Variacion actual={d.tienda.semana} antes={d.tienda.semana_anterior} etiqueta="vs la semana anterior" />
        {d.top.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: .55, marginBottom: 6 }}>LO MÁS VENDIDO</div>
            <Barras color={VERDE} filas={d.top.map(t => ({ nombre: t.nombre, total: t.total, extra: `${t.piezas} pza` }))} />
          </div>
        )}
      </Seccion>

      {d.colaboradores.length > 0 && (
        <Seccion titulo="👥 QUIÉN VENDIÓ (TIENDA, 7 DÍAS)" tarjeta={tarjeta}>
          <Barras color={AZUL} filas={d.colaboradores.map(c => ({ nombre: c.nombre.split(' ').slice(0, 2).join(' '), total: c.total, extra: `${c.piezas} pza` }))} />
        </Seccion>
      )}

      <Seccion titulo="💳 DE DÓNDE ENTRÓ (7 DÍAS)" tarjeta={tarjeta}>
        <div style={{ fontSize: 12, fontWeight: 900, opacity: .55, marginBottom: 6 }}>POR TIPO</div>
        <Barras color={NARANJA} filas={d.por_tipo} />
        <div style={{ fontSize: 12, fontWeight: 900, opacity: .55, margin: '12px 0 6px' }}>POR FORMA DE PAGO</div>
        <Barras color={AZUL} filas={d.por_metodo} />
      </Seccion>

      {d.resurtir.length > 0 && (
        <Seccion titulo="📦 RESURTIR · SE VENDEN Y ESTÁN EN CERO" tarjeta={tarjeta}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.resurtir.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 800 }}>
                <span>{r.nombre}</span><span style={{ opacity: .65, flex: 'none' }}>{r.piezas} vendidas en 30 días</span>
              </div>
            ))}
          </div>
        </Seccion>
      )}
    </div>
  )
}
