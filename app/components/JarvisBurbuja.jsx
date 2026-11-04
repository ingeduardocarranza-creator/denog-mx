'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Jarvis, siempre a la vista: una burbuja flotante en todas las pantallas del
// sistema que cuenta lo que toca hacer y INSISTE — avisa cuando una actividad
// llega a su hora, y vuelve a avisar cada 20 minutos si siguen pendientes. Al
// admin le avisa además cuando un colaborador se atrasa.
// Funciona mientras el sistema esté abierto en el navegador (la pantalla de la
// tienda o el celular). No manda mensajes con la pantalla cerrada.

const CADA_MS = 60000          // revisa cada minuto
const RE_AVISAR_MS = 20 * 60000 // y recuerda cada 20 minutos
const VERDE = '#58a700', NARANJA = '#ff9600', ROJO = '#d83a2e'

function pitar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    ;[660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f; o.type = 'sine'
      o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16)
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.18)
    })
    if (navigator.vibrate) navigator.vibrate([120, 60, 120])
  } catch { /* el navegador puede bloquear el sonido hasta que se toque la pantalla */ }
}

const leer = (k) => { try { return sessionStorage.getItem(k) } catch { return null } }
const guardar = (k, v) => { try { sessionStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

export default function JarvisBurbuja() {
  const router = useRouter()
  const pathname = usePathname()
  const [rol, setRol] = useState(null)
  const [atrasadas, setAtrasadas] = useState([])
  const [equipo, setEquipo] = useState([])
  const [toast, setToast] = useState('')
  const [permiso, setPermiso] = useState('default')
  const avisoRef = useRef(0)

  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem('cliente') || 'null')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (c?.rol === 'admin' || c?.rol === 'vendedor') setRol(c.rol)
    } catch { /* sin sesión */ }
    if (typeof Notification !== 'undefined') setPermiso(Notification.permission)
  }, [])

  useEffect(() => {
    if (!rol) return
    let vivo = true

    const avisar = (texto, clave) => {
      setToast(texto)
      pitar()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Jarvis', { body: texto, tag: clave }) } catch { /* algunos móviles no lo permiten */ }
      }
      setTimeout(() => setToast(t => (t === texto ? '' : t)), 12000)
    }

    const revisar = async () => {
      try {
        const res = await fetch('/api/jarvis').then(r => r.json())
        if (!vivo || !res?.ok) return
        const toca = res.tareas.filter(t => t.estado === 'pendiente' && t.toca)
        setAtrasadas(toca)

        // ¿Hay una actividad que acaba de llegar a su hora?
        const vistas = new Set((leer('jarvis_vistas') || '').split(',').filter(Boolean))
        const nuevas = toca.filter(t => !vistas.has(t.id))
        const ahora = Date.now()
        if (nuevas.length) {
          nuevas.forEach(t => vistas.add(t.id))
          guardar('jarvis_vistas', [...vistas].join(','))
          avisoRef.current = ahora
          avisar(`Toca: ${nuevas[0].emoji} ${nuevas[0].titulo}${nuevas.length > 1 ? ` (+${nuevas.length - 1} más)` : ''}`, 'toca')
        } else if (toca.length && ahora - avisoRef.current > RE_AVISAR_MS) {
          avisoRef.current = ahora
          avisar(`Aún tienes ${toca.length} por hacer. Empieza con: ${toca[0].titulo}`, 'insiste')
        }

        // Al admin: ¿algún colaborador en turno se está atrasando?
        if (res.usuario.rol === 'admin') {
          const eq = await fetch('/api/jarvis?equipo=1').then(r => r.json())
          if (!vivo || !eq?.ok) return
          const atrasados = eq.equipo.filter(p => p.en_turno && p.hoy.atrasadas >= 2)
          setEquipo(atrasados)
          if (atrasados.length) {
            const clave = `jarvis_escalado_${new Date().getHours()}_${atrasados.map(a => a.usuario_id).join('')}`
            if (!leer(clave)) {
              guardar(clave, '1')
              avisar(`⚠️ ${atrasados.map(a => `${a.nombre.split(' ')[0]} lleva ${a.hoy.atrasadas} atrasadas`).join(' · ')}`, 'escala')
            }
          }
        }
      } catch { /* sin conexión: se reintenta en un minuto */ }
    }

    revisar()
    const t = setInterval(revisar, CADA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [rol])

  // En la propia pantalla de Jarvis no hace falta la burbuja.
  if (!rol || pathname?.startsWith('/admin/jarvis')) return null
  if (atrasadas.length === 0 && equipo.length === 0 && !toast) return null

  const color = equipo.length ? ROJO : atrasadas.length > 2 ? NARANJA : VERDE
  const activarAvisos = async () => {
    if (typeof Notification === 'undefined') return
    setPermiso(await Notification.requestPermission())
  }

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, maxWidth: 'calc(100vw - 32px)' }}>
      {toast && (
        <div onClick={() => router.push('/admin/jarvis')} style={{ background: '#fff', border: `2px solid ${color}`, borderRadius: 14, padding: '10px 14px', fontSize: 14, fontWeight: 800, color: '#2a2118', boxShadow: '0 6px 20px rgba(0,0,0,.18)', maxWidth: 320, cursor: 'pointer' }}>
          {toast}
          {permiso === 'default' && typeof Notification !== 'undefined' && (
            <button onClick={(e) => { e.stopPropagation(); activarAvisos() }} style={{ display: 'block', marginTop: 6, border: 0, background: 'transparent', color: '#1cb0f6', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: 0 }}>
              🔔 Activar avisos del navegador
            </button>
          )}
        </div>
      )}
      <button onClick={() => router.push('/admin/jarvis')} aria-label="Abrir Jarvis" style={{
        display: 'flex', alignItems: 'center', gap: 8, border: 0, cursor: 'pointer', borderRadius: 999,
        background: color, color: '#fff', padding: '12px 18px', fontWeight: 900, fontSize: 15,
        boxShadow: `0 4px 0 rgba(0,0,0,.25), 0 8px 20px rgba(0,0,0,.2)`,
      }}>
        <span style={{ fontSize: 20 }}>🎯</span>
        {equipo.length ? `Equipo atrasado` : `Jarvis · ${atrasadas.length} por hacer`}
      </button>
    </div>
  )
}
