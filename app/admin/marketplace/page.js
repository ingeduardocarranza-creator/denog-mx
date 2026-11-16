'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Marketplace → estadísticas. Los datos los llena el agente programado al
// publicar (tablas publicaciones_marketplace y marketplace_ejecuciones).
// Los clics y el estado "agotada" se actualizan cuando el agente (o Lalo)
// los lee de Facebook; si todavía no se han leído, salen en cero y se avisa.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaDia = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`
const n1 = (n) => (Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })
const dinero = (n) => `$${(Number(n) || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
const fechaHora = (iso) => new Date(iso).toLocaleString('es-MX', {
  timeZone: 'America/Hermosillo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

const Tarjeta = ({ icono, titulo, valor, nota }) => (
  <div className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
    <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-1">{icono} {titulo}</div>
    <div className="text-2xl font-black text-white">{valor}</div>
    {nota && <div className="text-[11px] text-slate-400 mt-1">{nota}</div>}
  </div>
)

const Panel = ({ titulo, children }) => (
  <div className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
    <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-3">{titulo}</div>
    {children}
  </div>
)

export default function MarketplaceEstadisticas() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('cliente')
    if (!stored) { router.push('/'); return }
    setUsuario(JSON.parse(stored))
    setCargandoSesion(false)
  }, [])

  useEffect(() => {
    if (!usuario || usuario.rol !== 'admin') return
    fetch('/api/marketplace/estadisticas')
      .then(r => r.json())
      .then(d => { if (d.ok) setDatos(d); else setError(d.mensaje || 'No se pudo cargar') })
      .catch(() => setError('No se pudo cargar'))
  }, [usuario])

  if (cargandoSesion) return null
  if (usuario?.rol !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm font-bold text-white">Acceso restringido</div>
          <div className="text-xs text-slate-400 mt-1">Las estadísticas de Marketplace son solo para cuentas administradoras.</div>
        </div>
      </div>
    )
  }

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>
  if (!datos) return <div className="p-6 text-xs text-slate-500">Cargando estadísticas…</div>

  const { totales: t, porDia, porCategoria, porHorario, top, sinMovimiento, salud, catalogo, recientes } = datos
  const maxDia = Math.max(1, ...porDia.map(d => d.n))
  const sinClicsLeidos = t.publicadas > 0 && t.clics === 0
  const hayAviso = salud.avisos30 > 0

  return (
    <div className="min-h-screen p-6 text-slate-100">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-black text-white">🛍️ Marketplace</h1>
          <div className="text-xs text-slate-400 mt-1">Qué se publicó, qué funciona y cómo va la cuenta de Facebook.</div>
        </div>

        {hayAviso && (
          <div className="rounded-2xl p-4 text-sm font-bold" style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.4)', color: '#fca5a5' }}>
            ⚠️ Facebook mostró {salud.avisos30} aviso{salud.avisos30 === 1 ? '' : 's'} en los últimos 30 días
            {salud.ultimoAviso ? ` (el último: ${fechaHora(salud.ultimoAviso.ejecutada_en)}${salud.ultimoAviso.detalle ? ` — ${salud.ultimoAviso.detalle}` : ''})` : ''}.
            Revisa la cuenta antes de seguir publicando.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tarjeta icono="📤" titulo="Publicadas" valor={t.publicadas} nota={`${t.hoy} hoy · ${t.ultimos7} en 7 días`} />
          <Tarjeta icono="🟢" titulo="Activas" valor={t.activas} nota={`${t.agotadas} agotadas (${n1(t.pctVendidas)}%)`} />
          <Tarjeta icono="👀" titulo="Clics" valor={t.clics} nota={`${n1(t.clicsPorPublicacion)} por publicación`} />
          <Tarjeta icono="💬" titulo="Mensajes" valor={t.mensajes} nota="clientes que escribieron" />
        </div>

        {sinClicsLeidos && (
          <div className="text-[11.5px] text-slate-400">
            Los clics y mensajes salen en cero porque todavía no se han leído de Facebook. Se llenan cuando el agente (o tú) actualiza esos números.
          </div>
        )}

        <Panel titulo="Publicadas por día (últimos 14)">
          <div className="flex items-end gap-1.5" style={{ height: 130 }}>
            {porDia.map(d => (
              <div key={d.dia} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="text-[10px] text-slate-300 mb-1">{d.n || ''}</div>
                <div style={{ width: '100%', height: `${(d.n / maxDia) * 100}%`, minHeight: d.n ? 4 : 2, background: d.n ? '#466D9B' : 'var(--w08)', borderRadius: 4 }} />
                <div className="text-[9px] text-slate-500 mt-1 whitespace-nowrap">{etiquetaDia(d.dia)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel titulo="Por categoría del catálogo">
            {porCategoria.length === 0 ? <div className="text-xs text-slate-500">Sin datos todavía.</div> : (
              <div className="space-y-2">
                {porCategoria.map(c => (
                  <div key={c.categoria} className="flex justify-between text-xs text-slate-300 gap-3">
                    <span className="truncate">{c.categoria}</span>
                    <span className="font-bold whitespace-nowrap">{c.publicadas} pub · {c.clics} clics · {c.agotadas} agotadas</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel titulo="¿Qué horario atrae más clics?">
            {porHorario.length === 0 ? <div className="text-xs text-slate-500">Sin datos todavía.</div> : (
              <div className="space-y-2">
                {porHorario.map(h => (
                  <div key={h.bloque} className="flex justify-between text-xs text-slate-300 gap-3">
                    <span>{h.bloque}</span>
                    <span className="font-bold whitespace-nowrap">{h.publicadas} pub · {n1(h.clicsPorPublicacion)} clics c/u</span>
                  </div>
                ))}
                <div className="text-[10.5px] text-slate-500 pt-1">Con pocas publicaciones la comparación todavía no dice mucho.</div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel titulo="🏆 Las que más clics tienen">
            {top.length === 0 ? <div className="text-xs text-slate-500">Aún no hay clics registrados.</div> : (
              <div className="space-y-2">
                {top.map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-slate-300 gap-3">
                    <span className="truncate">{p.titulo}</span>
                    <span className="font-bold whitespace-nowrap">{p.clics} clics · {p.mensajes} msj</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel titulo="😴 Sin movimiento (7+ días, 0 clics y 0 mensajes)">
            {sinMovimiento.length === 0 ? <div className="text-xs text-slate-500">Ninguna por ahora.</div> : (
              <div className="space-y-2">
                {sinMovimiento.map(p => (
                  <div key={p.id} className="flex justify-between text-xs text-slate-300 gap-3">
                    <span className="truncate">{p.titulo}</span>
                    <span className="font-bold whitespace-nowrap">{dinero(p.precio)}</span>
                  </div>
                ))}
                <div className="text-[10.5px] text-slate-500 pt-1">Candidatas a mejorar la foto o el precio, o a volver a publicar.</div>
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel titulo="🩺 Salud de la cuenta (30 días)">
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between"><span>Ejecuciones del agente</span><span className="font-bold">{salud.ejecuciones30}</span></div>
              <div className="flex justify-between"><span>Publicó</span><span className="font-bold">{salud.publicadas30}</span></div>
              <div className="flex justify-between"><span>Se saltó el día (a propósito)</span><span className="font-bold">{salud.saltadas30}</span></div>
              <div className="flex justify-between"><span>Errores</span><span className="font-bold" style={{ color: salud.errores30 ? '#fbbf24' : undefined }}>{salud.errores30}</span></div>
              <div className="flex justify-between"><span>Avisos de Facebook</span><span className="font-bold" style={{ color: salud.avisos30 ? '#f87171' : undefined }}>{salud.avisos30}</span></div>
              <div className="flex justify-between"><span>Última ejecución</span><span className="font-bold">{salud.ultimaEjecucion ? fechaHora(salud.ultimaEjecucion.ejecutada_en) : '—'}</span></div>
            </div>
          </Panel>
          <Panel titulo="📦 Catálogo por publicar">
            <div className="text-2xl font-black text-white">{catalogo.pendientes}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              productos con stock y foto que aún no están en Marketplace
              {catalogo.diasRestantes ? ` · al ritmo de los últimos 7 días alcanzan para ~${catalogo.diasRestantes} días` : ''}.
            </div>
          </Panel>
        </div>

        <Panel titulo="Últimas publicaciones">
          {recientes.length === 0 ? <div className="text-xs text-slate-500">Sin publicaciones registradas.</div> : (
            <div className="space-y-2">
              {recientes.map(p => (
                <div key={p.id} className="flex justify-between text-xs text-slate-300 gap-3">
                  <span className="truncate">{p.titulo}</span>
                  <span className="whitespace-nowrap text-slate-400">{fechaHora(p.publicada_en)} · {dinero(p.precio)} · {p.estado === 'agotada' ? '🔴 agotada' : '🟢 activa'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
