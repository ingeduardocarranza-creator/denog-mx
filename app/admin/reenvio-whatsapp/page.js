'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// Reenvío WhatsApp → aquí se marcan los días que hay venta. Cada mañana el
// agente de Claude (en la Mac que se queda prendida) lee este calendario y, si
// hoy está marcado y hay productos nuevos en el grupo "Publicaciones ventas",
// reenvía primero los "Mensajes fijos" y luego los productos a los destinos
// activos. El resultado queda en el historial de abajo.

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const SEMANAS_VISIBLES = 2

const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Lunes de la semana a la que pertenece el día.
const lunesDe = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`)
  return sumarDias(iso, -((d.getUTCDay() + 6) % 7))
}
const diaSemana = (iso) => DIAS[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7]
const diaCorto = (iso) => `${diaSemana(iso)} ${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`
const hora12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
const fechaHora = (iso) => new Date(iso).toLocaleString('es-MX', {
  timeZone: 'America/Hermosillo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

const RESULTADOS = {
  enviado:       { texto: 'Enviado',       fondo: 'rgba(34,197,94,.14)',  borde: 'rgba(34,197,94,.4)',  color: '#16a34a' },
  sin_productos: { texto: 'Sin productos', fondo: 'rgba(245,158,11,.14)', borde: 'rgba(245,158,11,.4)', color: '#d97706' },
  aviso:         { texto: 'Aviso',         fondo: 'rgba(245,158,11,.14)', borde: 'rgba(245,158,11,.4)', color: '#d97706' },
  pausado:       { texto: 'En pausa',      fondo: 'rgba(148,163,184,.16)', borde: 'rgba(148,163,184,.4)', color: '#64748b' },
  fallo:         { texto: 'Falló',         fondo: 'rgba(239,68,68,.12)',  borde: 'rgba(239,68,68,.4)',  color: '#dc2626' },
}
const NOMBRE_DESTINO = { grupo1: 'Grupo 1', grupo2: 'Grupo 2', estado: 'Estado' }

const Tarjeta = ({ icono, titulo, valor, nota }) => (
  <div className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
    <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest mb-1">{icono} {titulo}</div>
    <div className="text-2xl font-black text-white">{valor}</div>
    {nota && <div className="text-[11px] text-slate-400 mt-1">{nota}</div>}
  </div>
)

const Panel = ({ titulo, derecha, children }) => (
  <div className="rounded-2xl p-4" style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest">{titulo}</div>
      {derecha}
    </div>
    {children}
  </div>
)

const Interruptor = ({ activo, onChange, etiqueta }) => (
  <button
    type="button"
    role="switch"
    aria-checked={activo}
    aria-label={etiqueta}
    onClick={() => onChange(!activo)}
    style={{
      width: 44, height: 24, borderRadius: 999, position: 'relative', flexShrink: 0,
      background: activo ? '#466D9B' : 'var(--w08)', border: '1px solid var(--w08)', transition: 'background .15s',
    }}
  >
    <span style={{
      position: 'absolute', top: 2, left: activo ? 22 : 2, width: 18, height: 18, borderRadius: 999,
      background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s',
    }} />
  </button>
)

export default function ReenvioWhatsApp() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [inicio, setInicio] = useState(null) // lunes de la primera semana visible

  useEffect(() => {
    const stored = localStorage.getItem('cliente')
    if (!stored) { router.push('/'); return }
    setUsuario(JSON.parse(stored))
    setCargandoSesion(false)
  }, [])

  const cargar = useCallback(() => {
    fetch('/api/whatsapp-reenvio')
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.mensaje || 'No se pudo cargar'); return }
        setDatos(d)
        setInicio(prev => prev || lunesDe(d.hoy))
      })
      .catch(() => setError('No se pudo cargar'))
  }, [])

  useEffect(() => {
    if (!usuario || usuario.rol !== 'admin') return
    cargar()
  }, [usuario, cargar])

  const guardar = async (cuerpo) => {
    setAviso('')
    try {
      const r = await fetch('/api/whatsapp-reenvio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      }).then(x => x.json())
      if (!r.ok) setAviso(r.mensaje || 'No se pudo guardar')
      return r
    } catch {
      setAviso('No se pudo guardar. Revisa tu conexión.')
      return { ok: false }
    }
  }

  const alternarDia = async (fecha) => {
    const marcado = datos.dias.find(d => d.fecha === fecha)
    const hora = String(datos.config.hora_default).slice(0, 5)
    // Se pinta de inmediato y, si el servidor dice que no, se regresa.
    setDatos(d => ({
      ...d,
      dias: marcado
        ? d.dias.filter(x => x.fecha !== fecha)
        : [...d.dias, { fecha, hora }].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    }))
    const r = await guardar({ accion: 'dia', fecha, activo: !marcado })
    if (!r.ok) cargar()
  }

  const cambiarHora = async (fecha, hora) => {
    if (!hora) return
    setDatos(d => ({ ...d, dias: d.dias.map(x => (x.fecha === fecha ? { ...x, hora } : x)) }))
    const r = await guardar({ accion: 'dia', fecha, activo: true, hora })
    if (!r.ok) cargar()
  }

  const cambiarConfig = async (cambios) => {
    setDatos(d => ({ ...d, config: { ...d.config, ...cambios } }))
    const r = await guardar({ accion: 'config', ...cambios })
    if (!r.ok) cargar()
  }

  if (cargandoSesion) return null
  if (usuario?.rol !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm font-bold text-white">Acceso restringido</div>
          <div className="text-xs text-slate-400 mt-1">El reenvío de WhatsApp es solo para cuentas administradoras.</div>
        </div>
      </div>
    )
  }

  if (error) return <div className="p-6 text-sm text-red-400">{error}</div>
  if (!datos || !inicio) return <div className="p-6 text-xs text-slate-500">Cargando…</div>

  const { hoy, config, dias, envios } = datos
  const porFecha = Object.fromEntries(dias.map(d => [d.fecha, d]))
  const proximos = dias.filter(d => d.fecha >= hoy)
  const proxima = proximos[0]
  const ultimo = envios.find(e => e.resultado === 'enviado')
  const destinosActivos = [config.destino_grupo1, config.destino_grupo2, config.destino_estado].filter(Boolean).length
  const celdas = Array.from({ length: SEMANAS_VISIBLES * 7 }, (_, i) => sumarDias(inicio, i))
  const fin = celdas[celdas.length - 1]
  const rango = `${Number(inicio.slice(8, 10))} ${MESES[Number(inicio.slice(5, 7)) - 1]} – ${Number(fin.slice(8, 10))} ${MESES[Number(fin.slice(5, 7)) - 1]}`

  return (
    <div className="min-h-screen p-6 text-slate-100">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-white">📲 Reenvío WhatsApp</h1>
            <div className="text-xs text-slate-400 mt-1">Marca los días que hay venta. Ese día se reenvían solos los mensajes fijos y los productos a tus grupos.</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-3 py-1 rounded-full" style={config.pausado
              ? { background: RESULTADOS.pausado.fondo, border: `1px solid ${RESULTADOS.pausado.borde}`, color: RESULTADOS.pausado.color }
              : { background: RESULTADOS.enviado.fondo, border: `1px solid ${RESULTADOS.enviado.borde}`, color: RESULTADOS.enviado.color }}>
              {config.pausado ? 'En pausa' : 'Activo'}
            </span>
            <button
              type="button"
              onClick={() => cambiarConfig({ pausado: !config.pausado })}
              className="text-xs font-bold px-3 py-2 rounded-xl text-white"
              style={{ background: 'var(--sup)', border: '1px solid var(--w08)' }}
            >
              {config.pausado ? '▶️ Reanudar' : '⏸️ Pausar todo'}
            </button>
          </div>
        </div>

        {config.pausado && (
          <div className="rounded-2xl p-4 text-sm font-bold" style={{ background: RESULTADOS.aviso.fondo, border: `1px solid ${RESULTADOS.aviso.borde}`, color: RESULTADOS.aviso.color }}>
            ⏸️ El reenvío está en pausa: no se enviará nada aunque el día esté marcado.
          </div>
        )}
        {aviso && (
          <div className="rounded-2xl p-3 text-sm font-bold" style={{ background: RESULTADOS.fallo.fondo, border: `1px solid ${RESULTADOS.fallo.borde}`, color: RESULTADOS.fallo.color }}>
            {aviso}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Tarjeta
            icono="📅" titulo="Próxima venta"
            valor={proxima ? (proxima.fecha === hoy ? 'Hoy' : diaCorto(proxima.fecha)) : 'Sin fecha'}
            nota={proxima ? `a las ${hora12(proxima.hora)} · ${proximos.length} día${proximos.length === 1 ? '' : 's'} marcado${proximos.length === 1 ? '' : 's'}` : 'Marca un día en el calendario'}
          />
          <Tarjeta
            icono="📥" titulo="En el buzón"
            valor={config.buzon_pendientes == null ? '—' : `${config.buzon_pendientes} producto${config.buzon_pendientes === 1 ? '' : 's'}`}
            nota={config.buzon_revisado_en ? `revisado ${fechaHora(config.buzon_revisado_en)}` : 'Se llena cuando el agente revisa "Publicaciones ventas"'}
          />
          <Tarjeta
            icono="✅" titulo="Último envío"
            valor={ultimo ? diaCorto(ultimo.fecha) : 'Ninguno'}
            nota={ultimo ? `${ultimo.fijos} fijos y ${ultimo.productos} productos` : 'Todavía no se ha enviado nada'}
          />
        </div>

        <Panel
          titulo="Días de venta"
          derecha={(
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <button type="button" aria-label="Semana anterior" className="px-2 py-1 rounded-lg font-bold" style={{ border: '1px solid var(--w08)' }} onClick={() => setInicio(sumarDias(inicio, -7))}>‹</button>
              <span className="font-bold whitespace-nowrap">{rango}</span>
              <button type="button" aria-label="Semana siguiente" className="px-2 py-1 rounded-lg font-bold" style={{ border: '1px solid var(--w08)' }} onClick={() => setInicio(sumarDias(inicio, 7))}>›</button>
              {inicio !== lunesDe(hoy) && (
                <button type="button" className="px-2 py-1 rounded-lg font-bold" style={{ border: '1px solid var(--w08)' }} onClick={() => setInicio(lunesDe(hoy))}>Hoy</button>
              )}
            </div>
          )}
        >
          <div className="grid grid-cols-7 gap-2">
            {celdas.map(fecha => {
              const marcado = porFecha[fecha]
              const pasado = fecha < hoy
              return (
                <button
                  key={fecha}
                  type="button"
                  disabled={pasado}
                  onClick={() => alternarDia(fecha)}
                  aria-pressed={!!marcado}
                  className="rounded-xl py-2 px-1 flex flex-col items-center gap-0.5"
                  style={{
                    background: marcado ? '#466D9B' : 'transparent',
                    border: `1px solid ${fecha === hoy ? '#466D9B' : 'var(--w08)'}`,
                    opacity: pasado ? 0.4 : 1,
                    cursor: pasado ? 'default' : 'pointer',
                  }}
                >
                  <span className="text-[10.5px] font-bold" style={{ color: marcado ? '#fff' : undefined }}>{diaSemana(fecha)}{fecha === hoy ? ' · hoy' : ''}</span>
                  <span className="text-lg font-black" style={{ color: marcado ? '#fff' : undefined }}>{Number(fecha.slice(8, 10))}</span>
                  <span className="text-[10px]" style={{ color: marcado ? '#fff' : undefined }}>{marcado ? hora12(marcado.hora) : 'Sin venta'}</span>
                </button>
              )
            })}
          </div>
          <div className="text-[11.5px] text-slate-400 mt-3">Toca un día para marcarlo o quitarlo. Los días que ya pasaron no se pueden cambiar.</div>

          {proximos.length > 0 && (
            <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--w08)' }}>
              <div className="text-[10.5px] text-slate-400 font-bold uppercase tracking-widest">Hora de envío por día</div>
              {proximos.map(d => (
                <div key={d.fecha} className="flex items-center justify-between gap-3 text-xs text-slate-300">
                  <span className="font-bold">{d.fecha === hoy ? `Hoy · ${diaCorto(d.fecha)}` : diaCorto(d.fecha)}</span>
                  <input
                    type="time"
                    value={d.hora}
                    onChange={e => cambiarHora(d.fecha, e.target.value)}
                    aria-label={`Hora de envío del ${diaCorto(d.fecha)}`}
                    className="rounded-lg px-2 py-1 text-xs"
                    style={{ background: 'transparent', border: '1px solid var(--w08)', color: 'inherit' }}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel titulo={`Destinos (${destinosActivos} activo${destinosActivos === 1 ? '' : 's'})`}>
            <div className="space-y-3">
              {[
                ['destino_grupo1', 'Denog | Grupo de compras 1'],
                ['destino_grupo2', 'Denog | Grupo de compras 2'],
                ['destino_estado', 'Mi estado'],
              ].map(([clave, nombre]) => (
                <div key={clave} className="flex items-center justify-between gap-3 text-sm text-slate-200">
                  <span>{nombre}</span>
                  <Interruptor activo={!!config[clave]} etiqueta={nombre} onChange={v => cambiarConfig({ [clave]: v })} />
                </div>
              ))}
            </div>
            {destinosActivos === 0 && (
              <div className="text-[11.5px] mt-3 font-bold" style={{ color: RESULTADOS.fallo.color }}>Sin destinos activos no se envía nada.</div>
            )}
          </Panel>

          <Panel titulo="Hora por defecto">
            <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>Los días nuevos se marcan a esta hora</span>
              <input
                type="time"
                value={String(config.hora_default).slice(0, 5)}
                onChange={e => e.target.value && cambiarConfig({ hora_default: e.target.value })}
                aria-label="Hora por defecto"
                className="rounded-lg px-2 py-1 text-sm"
                style={{ background: 'transparent', border: '1px solid var(--w08)', color: 'inherit' }}
              />
            </div>
            <div className="text-[11.5px] text-slate-400 mt-3">
              La noche anterior a cada venta, a las 9:00 pm, se revisa el buzón y se te avisa si está vacío.
            </div>
          </Panel>
        </div>

        <Panel titulo="Historial">
          {envios.length === 0 ? (
            <div className="text-xs text-slate-500">Todavía no hay envíos. Aquí aparecerá cada ejecución: qué se envió, a dónde y si salió bien.</div>
          ) : (
            <div>
              {envios.map((e, i) => {
                const r = RESULTADOS[e.resultado] || RESULTADOS.aviso
                const resumen = e.resultado === 'enviado'
                  ? `${e.fijos} fijos y ${e.productos} productos → ${(e.destinos || []).map(x => NOMBRE_DESTINO[x] || x).join(', ') || 'sin destinos'}`
                  : (e.detalle || '')
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--w08)' : 'none' }}>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200">{fechaHora(e.ejecutado_en)}</div>
                      <div className="text-[11.5px] text-slate-400">{resumen}{e.resultado === 'enviado' && e.detalle ? ` · ${e.detalle}` : ''}</div>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: r.fondo, border: `1px solid ${r.borde}`, color: r.color }}>{r.texto}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <div className="text-[11px] text-slate-500">
          Para que el envío salga, la Mac debe estar prendida con Chrome y WhatsApp Web abiertos. Si falta algo, aparece como «Falló» en el historial.
        </div>
      </div>
    </div>
  )
}
