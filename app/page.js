'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js'

const DogWalker = dynamic(() => import('./components/DogWalker'), { ssr: false })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// ── SVG icons ──────────────────────────────────────────────────────────────
const IconWhatsApp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)
const IconInstagram = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="url(#ig-gradient)">
    <defs>
      <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#feda75" />
        <stop offset="25%" stopColor="#fa7e1e" />
        <stop offset="55%" stopColor="#d62976" />
        <stop offset="80%" stopColor="#962fbf" />
        <stop offset="100%" stopColor="#4f5bd5" />
      </linearGradient>
    </defs>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
)
const IconFacebook = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)
const IconTikTok = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25F4EE">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
)

export default function Portada() {
  const [usuario,    setUsuario]    = useState('')
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [cargando,   setCargando]   = useState(false)
  const [logoHover,  setLogoHover]  = useState(false)
  const [productosMercadito, setProductosMercadito] = useState([])
  const [sesionActiva, setSesionActiva] = useState(null)
  const heroRef = useRef(null)
  const loginRef = useRef(null)
  const usuarioInputRef = useRef(null)
  const router  = useRouter()

  const rutaSegunRol = (rol) =>
    rol === 'admin' ? '/admin/reportes'
    : (rol === 'vendedor' || rol === 'colaborador') ? '/admin/inicio'
    : '/cliente'

  const irALogin = () => {
    if (sesionActiva) { router.push(rutaSegunRol(sesionActiva.rol)); return }
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => usuarioInputRef.current?.focus(), 350)
  }

  const cerrarSesionPortada = () => {
    localStorage.removeItem('cliente')
    setSesionActiva(null)
  }

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) {
      try { setSesionActiva(JSON.parse(datos)) } catch { /* dato corrupto, se ignora */ }
    }
  }, [])

  useEffect(() => {
    supabase.from('productos_tienda').select('id, nombre, precio_venta, imagen_url')
      .eq('activo', true).eq('mostrar_en_mercadito', true).order('id', { ascending: false }).limit(6)
      .then(({ data }) => setProductosMercadito(data || []))
  }, [])

  useEffect(() => {
    const el = heroRef.current
    if (!el || !window.matchMedia('(pointer: fine)').matches) return
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const dx = (e.clientX - rect.left - rect.width  / 2) / rect.width
      const dy = (e.clientY - rect.top  - rect.height / 2) / rect.height
      el.querySelectorAll('[data-parallax]').forEach(layer => {
        const n = parseFloat(layer.dataset.parallax)
        layer.style.transform = `translate(${-dx * n}px, ${-dy * n}px)`
      })
    }
    el.addEventListener('mousemove', onMove)
    return () => el.removeEventListener('mousemove', onMove)
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !password.trim()) { setError('Completa todos los campos'); return }
    setCargando(true)
    setError('')
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), password }),
      })
      const data = await res.json()
      if (data.ok) {
        const c = { id: data.id, nombre: data.nombre, rol: data.rol }
        localStorage.setItem('cliente', JSON.stringify(c))
        setSesionActiva(c)
        router.push(rutaSegunRol(data.rol))
      } else {
        setError(data.mensaje || 'Usuario o contraseña incorrectos')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setCargando(false)
    }
  }

  const fk = { fontFamily: 'var(--font-baloo2)' }
  const jk = { fontFamily: 'var(--font-poppins)' }

  return (
    <>
    <style>{`
      @keyframes logofloat {
        0%, 100% { transform: translateY(0) rotate(-1deg); }
        50%       { transform: translateY(-7px) rotate(1deg); }
      }
      @keyframes toptrot {
        from { transform: translateX(-170px); }
        to   { transform: translateX(100vw); }
      }
      @keyframes glowpulse {
        0%, 100% { opacity: .45; }
        50%       { opacity: .9; }
      }
    `}</style>
    <div ref={heroRef} style={{
      minHeight: '100dvh', overflow: 'hidden', position: 'relative',
      background: 'linear-gradient(175deg, #fdfaf5 0%, #fbf8f3 40%, #f5ecdf 100%)',
      display: 'flex', flexDirection: 'column',
      padding: '120px clamp(20px,5vw,56px) clamp(28px,4vw,44px)',
      ...jk,
    }}>

      {/* Halos cálidos */}
      <div data-parallax="12" className="glow-pulse" style={{
        position: 'absolute', top: '-12%', left: '-6%',
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(193,85,58,.14) 0%, transparent 70%)',
        pointerEvents: 'none', animation: 'glowpulse 6s ease-in-out infinite',
      }} />
      <div data-parallax="8" className="glow-pulse" style={{
        position: 'absolute', bottom: '4%', right: '-8%',
        width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(250,204,21,.12) 0%, transparent 70%)',
        pointerEvents: 'none', animation: 'glowpulse 6s ease-in-out infinite', animationDelay: '3s',
      }} />

      {/* Franja superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 90,
        background: 'linear-gradient(180deg, rgba(193,85,58,.08), transparent)',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: 88, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(193,85,58,.35) 14%, rgba(250,204,21,.35) 86%, transparent)',
        }} />
      </div>

      {/* Perrito */}
      <div style={{
        position: 'absolute', top: -2, left: 0, pointerEvents: 'none', zIndex: 1,
        animation: 'toptrot 17s linear infinite',
      }}>
        <DogWalker
          src="/assets/dog-green.mp4"
          bg="green"
          crop="0.26,0.02,0.76,1.0"
          loopStart="1.25"
          loopEnd="8.7"
          height="124px"
          shadow="drop-shadow(0 6px 16px rgba(193,85,58,.35))"
        />
      </div>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 'clamp(28px,5vw,56px)', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            onMouseEnter={() => setLogoHover(true)}
            onMouseLeave={() => setLogoHover(false)}
            style={{
              flexShrink: 0, cursor: 'default', userSelect: 'none',
              animation: logoHover ? 'none' : 'logofloat 5s ease-in-out infinite',
              transform: logoHover ? 'scale(1.06) rotate(-1deg)' : undefined,
              transition: 'transform .25s ease',
            }}
          >
            <Image src="/assets/wordmark-v2.png" alt="Denog" width={92} height={92} priority
              style={{ height: 'clamp(64px,9vw,92px)', width: 'auto', display: 'block', filter: 'drop-shadow(0 6px 16px rgba(193,85,58,.3))' }} />
          </div>
          <div>
            <div style={{ ...fk, fontWeight: 700, fontSize: 'clamp(20px,3vw,24px)', color: '#2a2118', lineHeight: 1.1 }}>Denog</div>
            <div style={{ fontWeight: 700, fontSize: 11, color: '#c1553a', letterSpacing: '.18em', textTransform: 'uppercase' }}>USA COMPRAS</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push('/mercadito')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
            background: '#fff', color: '#a3432b', fontSize: 14, fontWeight: 800,
            padding: '11px 20px', borderRadius: 12, border: '1.5px solid rgba(193,85,58,0.3)', cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(193,85,58,.12)',
          }}>
            🛍️ Mercadito
          </button>
          <button onClick={irALogin} style={{
            fontFamily: 'inherit', background: '#c1553a', color: '#fff', fontSize: 14, fontWeight: 800,
            padding: '11px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(193,85,58,.35)',
          }}>
            {sesionActiva ? 'Mi cuenta →' : 'Iniciar sesión'}
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: 'clamp(32px,4vw,56px)',
        flex: 1, position: 'relative', zIndex: 2,
      }}>

        {/* Texto izquierda */}
        <div style={{ flex: '1 1 340px', minWidth: 'min(100%, 340px)', maxWidth: 600 }}>

          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24,
            padding: '8px 16px', background: 'rgba(193,85,58,0.08)',
            border: '1px solid rgba(193,85,58,0.25)', borderRadius: 999,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c1553a', flexShrink: 0, boxShadow: '0 0 8px rgba(193,85,58,.6)' }} />
            <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: '.05em', textTransform: 'uppercase', color: '#a3432b' }}>
              EE. UU. → México · Compras sin fronteras
            </span>
          </div>

          {/* H1 */}
          <h1 style={{
            ...fk, fontWeight: 700,
            fontSize: 'clamp(34px,5.6vw,62px)',
            lineHeight: 1.05, letterSpacing: '-.01em',
            color: '#2a2118', margin: '0 0 16px',
          }}>
            Lo mejor de Estados Unidos,{' '}
            <span style={{ color: '#c1553a' }}>en la puerta de tu casa.</span>
          </h1>

          {/* Tagline */}
          <p style={{ fontWeight: 700, fontSize: 'clamp(14px,2vw,17px)', letterSpacing: '.16em', textTransform: 'uppercase', color: '#c1553a', margin: '0 0 18px' }}>
            ✨ My Happy Shopping
          </p>

          {/* Párrafo */}
          <p style={{ fontWeight: 400, fontSize: 'clamp(15px,1.7vw,18px)', lineHeight: 1.55, color: 'rgba(42,33,24,0.65)', maxWidth: 520, margin: '0 0 24px' }}>
            Compra en cualquier tienda de EE. UU. y nosotros lo traemos hasta México. Tú eliges, Denog se encarga de comprar, traer y entregar.
          </p>

          {/* Bullets */}
          <div style={{ display: 'flex', gap: '20px 26px', flexWrap: 'wrap' }}>
            {[{ label: 'Compras en USA', color: '#c1553a' }, { label: 'Seguimiento en tiempo real', color: '#b8860b' }].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 14.5, color: 'rgba(42,33,24,0.7)' }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Login derecha */}
        <div ref={loginRef} style={{ flex: '1 1 320px', minWidth: 'min(100%, 300px)', maxWidth: 420 }}>
          {sesionActiva ? (
            <div style={{
              padding: 'clamp(26px,3vw,34px) clamp(22px,2.5vw,32px)',
              background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)',
              borderRadius: 22, boxShadow: '0 24px 60px rgba(42,33,24,.1)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 14px', background: 'rgba(46,125,79,.1)', border: '1px solid rgba(46,125,79,.3)', borderRadius: 999 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2e7d4f', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2e7d4f' }}>Sesión activa</span>
                </div>
                <div style={{ ...fk, fontWeight: 700, fontSize: 24, color: '#2a2118' }}>Hola de nuevo, {sesionActiva.nombre?.split(' ')[0]} 👋</div>
                <div style={{ fontSize: 14, color: 'rgba(42,33,24,0.55)', marginTop: 4 }}>Ya iniciaste sesión en este dispositivo.</div>
              </div>

              <button onClick={() => router.push(rutaSegunRol(sesionActiva.rol))} style={{
                height: 56, borderRadius: 14, border: 'none', fontFamily: 'inherit',
                cursor: 'pointer', background: '#c1553a',
                color: '#fff', fontWeight: 700, fontSize: 16,
                boxShadow: '0 14px 30px rgba(193,85,58,.35)',
              }}>
                Continuar →
              </button>

              <button onClick={cerrarSesionPortada} style={{
                height: 48, borderRadius: 14, fontFamily: 'inherit', cursor: 'pointer',
                background: 'transparent', border: '1.5px solid rgba(0,0,0,0.12)',
                color: 'rgba(42,33,24,0.55)', fontWeight: 600, fontSize: 14,
              }}>
                Cerrar sesión / entrar con otra cuenta
              </button>
            </div>
          ) : (
          <form onSubmit={handleLogin} style={{
            padding: 'clamp(26px,3vw,34px) clamp(22px,2.5vw,32px)',
            background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)',
            borderRadius: 22, boxShadow: '0 24px 60px rgba(42,33,24,.1)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div>
              <div style={{ ...fk, fontWeight: 700, fontSize: 28, color: '#2a2118' }}>Hola 👋</div>
              <div style={{ fontSize: 15, color: 'rgba(42,33,24,0.55)', marginTop: 4 }}>Ingresa a tu cuenta</div>
            </div>

            {[
              { label: 'Usuario',     type: 'text',     val: usuario,  set: setUsuario,  ac: 'username'         },
              { label: 'Contraseña',  type: 'password', val: password, set: setPassword, ac: 'current-password' },
            ].map(({ label, type, val, set, ac }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, color: 'rgba(42,33,24,0.6)', fontWeight: 600 }}>{label}</label>
                <input ref={label === 'Usuario' ? usuarioInputRef : undefined} type={type} value={val} onChange={e => set(e.target.value)} autoComplete={ac}
                  style={{
                    height: 54, padding: '0 18px', borderRadius: 14, outline: 'none',
                    border: '1.5px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.03)',
                    color: '#2a2118', fontSize: 15, fontFamily: 'inherit', transition: 'border-color .2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#c1553a'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
                />
              </div>
            ))}

            {error && (
              <div style={{
                fontSize: 13, color: '#c0392b', fontWeight: 500,
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                borderRadius: 10, padding: '10px 14px',
              }}>{error}</div>
            )}

            <button type="submit" disabled={cargando} style={{
              height: 56, borderRadius: 14, border: 'none', fontFamily: 'inherit',
              cursor: cargando ? 'not-allowed' : 'pointer',
              background: cargando ? 'rgba(193,85,58,.5)' : '#c1553a',
              color: '#fff', fontWeight: 700, fontSize: 16,
              boxShadow: '0 14px 30px rgba(193,85,58,.35)',
              opacity: cargando ? 0.7 : 1, transition: 'opacity .2s',
            }}>
              {cargando ? 'Ingresando…' : 'Entrar →'}
            </button>

            <a href="https://wa.me/526625486432" target="_blank" rel="noreferrer"
              style={{ textAlign: 'center', fontSize: 13.5, color: 'rgba(42,33,24,0.5)', textDecoration: 'none', marginTop: 4 }}>
              ¿Olvidaste tu contraseña? WhatsApp 💬
            </a>
          </form>
          )}
        </div>
      </main>

      {/* MERCADITO — teaser */}
      {productosMercadito.length > 0 && (
        <section style={{ position: 'relative', zIndex: 2, marginTop: 'clamp(28px,4vw,44px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ ...fk, fontWeight: 700, fontSize: 'clamp(18px,2.4vw,22px)', color: '#2a2118' }}>🛍️ Mercadito</div>
              <div style={{ fontSize: 13, color: 'rgba(42,33,24,0.55)', marginTop: 2 }}>Productos listos para agregar a tu próxima entrega</div>
            </div>
            <button onClick={() => router.push('/mercadito')} style={{
              flexShrink: 0, background: '#c1553a', border: 'none',
              borderRadius: 999, padding: '11px 20px', color: '#fff', fontWeight: 800, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 8px 24px rgba(193,85,58,.3)',
            }}>
              Ver mercadito completo →
            </button>
          </div>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
            {productosMercadito.map((p) => (
              <div key={p.id} onClick={() => router.push(`/mercadito/producto/${p.id}`)} style={{
                flex: 'none', width: 140, cursor: 'pointer',
              }}>
                <div style={{
                  width: '100%', aspectRatio: '1 / 1', borderRadius: 16,
                  background: p.imagen_url ? `center / cover no-repeat url(${p.imagen_url})` : 'rgba(193,85,58,0.1)',
                  border: '1.5px solid rgba(0,0,0,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
                }}>
                  {!p.imagen_url && '🛍️'}
                </div>
                <div style={{ color: '#2a2118', fontSize: 12.5, fontWeight: 600, marginTop: 8, lineHeight: 1.3, height: 32, overflow: 'hidden' }}>{p.nombre}</div>
                <div style={{ color: '#c1553a', fontSize: 14, fontWeight: 800, marginTop: 4 }}>${Number(p.precio_venta).toLocaleString('es-MX')}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 'clamp(28px,4vw,44px)', position: 'relative', zIndex: 2 }}>
        {[
          { href: 'https://wa.me/526625486432',       icon: <IconWhatsApp />,  label: 'WhatsApp 662 548 6432', bg: 'rgba(37,211,102,.08)',  border: 'rgba(37,211,102,.35)',  color: '#1f8a4c' },
          { href: 'https://instagram.com/denog.mx',   icon: <IconInstagram />, label: 'denog.mx',              bg: 'rgba(214,41,118,.08)',  border: 'rgba(214,41,118,.35)',  color: '#b3225f' },
          { href: 'https://facebook.com/Denogmx',     icon: <IconFacebook />,  label: 'Denog mx',               bg: 'rgba(24,119,242,.08)',  border: 'rgba(24,119,242,.35)',  color: '#1361c4' },
          { href: 'https://tiktok.com/@denog.mx',     icon: <IconTikTok />,    label: '@denog.mx',              bg: 'rgba(254,44,85,.08)',   border: 'rgba(254,44,85,.35)',   color: '#c41338' },
        ].map(({ href, icon, label, bg, border, color }) => (
          <a key={href} href={href} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '11px 16px', borderRadius: 13, textDecoration: 'none',
            fontWeight: 600, fontSize: 14,
            background: bg,
            border:     `1.5px solid ${border}`,
            color:      color,
          }}>
            {icon} {label}
          </a>
        ))}
      </footer>
    </div>
    </>
  )
}
