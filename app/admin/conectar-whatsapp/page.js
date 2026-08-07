'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

// Página para vincular/revincular la coexistencia de WhatsApp (celular + API)
// cuando el número es de tipo "SMB". Meta bloquea el registro por API y no
// hay botón en WhatsApp Manager para ese tipo de cuenta — el único camino es
// este diálogo de Embedded Signup, lanzado desde una página propia. Genera
// el mismo QR que verías en business.facebook.com, pero sin los callejones
// sin salida de esa interfaz. Ver docs/PLAN.md §11 bis y §12.
//
// Solo admin: este flujo toca la vinculación del número que usa todo el
// negocio, no es algo para tocar por accidente.

const APP_ID = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID
const CONFIG_ID = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID

export default function ConectarWhatsApp() {
  const [usuario, setUsuario] = useState(null)
  const [sdkListo, setSdkListo] = useState(false)
  const [estado, setEstado] = useState('inicio') // inicio | esperando | verificando | ok | error
  const [detalle, setDetalle] = useState('')
  const [datosWa, setDatosWa] = useState(null)
  const datosWaRef = useRef(null)

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) setUsuario(JSON.parse(datos))
  }, [])

  // Carga el SDK de Facebook una sola vez.
  useEffect(() => {
    if (window.FB) { setSdkListo(true); return }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: 'v21.0' })
      setSdkListo(true)
    }
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/es_LA/sdk.js'
    script.async = true
    script.defer = true
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  // Meta manda el resultado del flujo (QR escaneado, teléfono vinculado)
  // como un mensaje al window, aparte del callback de FB.login.
  useEffect(() => {
    const escuchar = (event) => {
      if (!event.origin.endsWith('facebook.com')) return
      try {
        const data = JSON.parse(event.data)
        if (data.type !== 'WA_EMBEDDED_SIGNUP') return
        if (data.event === 'FINISH' || data.event === 'FINISH_ONBOARDING') {
          datosWaRef.current = {
            waba_id: data.data?.waba_id || null,
            phone_number_id: data.data?.phone_number_id || null,
          }
          setDatosWa(datosWaRef.current)
        } else if (data.event === 'CANCEL') {
          setEstado('inicio')
          setDetalle('Cerraste la ventana antes de terminar. Puedes volver a intentarlo cuando quieras.')
        } else if (data.event === 'ERROR') {
          setEstado('error')
          setDetalle(data.data?.error_message || 'Meta reportó un error durante el flujo.')
        }
      } catch { /* mensajes que no son JSON de este flujo, se ignoran */ }
    }
    window.addEventListener('message', escuchar)
    return () => window.removeEventListener('message', escuchar)
  }, [])

  const confirmarConBackend = useCallback(async (code) => {
    setEstado('verificando')
    const res = await fetch('/api/whatsapp/conectar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ...datosWaRef.current }),
    })
    const data = await res.json()
    if (!data.ok) {
      setEstado('error')
      setDetalle(data.mensaje || 'No se pudo confirmar con Meta.')
      return
    }
    if (data.phone_number_id && !data.coincidePhone) {
      setEstado('error')
      setDetalle(`Se vinculó un número distinto al configurado (${data.phone_number_id}). Avísale a Eduardo antes de seguir usándolo.`)
      return
    }
    setEstado('ok')
  }, [])

  const conectar = () => {
    if (!window.FB) return
    setEstado('esperando')
    setDetalle('')
    setDatosWa(null)
    datosWaRef.current = null
    window.FB.login((response) => {
      if (response.authResponse?.code) {
        confirmarConBackend(response.authResponse.code)
      } else {
        setEstado('inicio')
      }
    }, {
      config_id: CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    })
  }

  if (usuario && usuario.rol !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          Solo un administrador puede conectar el WhatsApp del negocio.
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        <div style={{ marginBottom: 20 }}>
          <div style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>🔗 Conectar WhatsApp</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>
            Vincula (o revincula) el WhatsApp del negocio con el sitio, sin dejar de usarlo en el celular
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>

          {estado === 'inicio' && (
            <>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                Al apretar el botón se abre una ventana de Meta. Inicia sesión con tu cuenta personal de Facebook
                (la que tiene acceso al portafolio de negocios &quot;Denog mx&quot;) y sigue los pasos hasta que aparezca
                un <strong>código QR</strong>. Escanéalo desde <strong>WhatsApp → Dispositivos vinculados</strong> en
                el celular que usa el número de Denog.
              </div>
              {detalle && (
                <div style={{ color: '#fbbf24', fontSize: 12, marginBottom: 14, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 10, padding: 10 }}>
                  {detalle}
                </div>
              )}
              <button
                onClick={conectar}
                disabled={!sdkListo || !APP_ID || !CONFIG_ID}
                style={{
                  width: '100%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 10, padding: '12px 16px', color: '#818cf8', fontSize: 13, fontWeight: 600,
                  cursor: sdkListo ? 'pointer' : 'not-allowed',
                }}
              >
                {sdkListo ? 'Conectar WhatsApp' : 'Cargando...'}
              </button>
              {(!APP_ID || !CONFIG_ID) && (
                <div style={{ color: '#f87171', fontSize: 11, marginTop: 10 }}>
                  Faltan NEXT_PUBLIC_WHATSAPP_APP_ID / NEXT_PUBLIC_WHATSAPP_CONFIG_ID en las variables de entorno.
                </div>
              )}
            </>
          )}

          {estado === 'esperando' && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Completa los pasos en la ventana de Meta y escanea el QR con el celular…
            </div>
          )}

          {estado === 'verificando' && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Confirmando con Meta…
            </div>
          )}

          {estado === 'ok' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Conectado</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.6 }}>
                El WhatsApp del negocio quedó vinculado. Sigue usándolo normal en el celular — ahora también
                le avisa al sitio. Manda un mensaje de prueba desde otro número y revisa{' '}
                <a href="/admin/pendientes" style={{ color: '#818cf8' }}>Pendientes</a>.
              </div>
              <button onClick={() => setEstado('inicio')}
                style={{ marginTop: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Volver a conectar
              </button>
            </div>
          )}

          {estado === 'error' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
              <div style={{ color: '#f87171', fontSize: 13, marginBottom: 14 }}>{detalle}</div>
              <button onClick={() => setEstado('inicio')}
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '8px 14px', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Intentar de nuevo
              </button>
            </div>
          )}

        </div>

        {datosWa?.phone_number_id && estado !== 'ok' && (
          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
            Número detectado: {datosWa.phone_number_id}
          </div>
        )}

      </div>
    </div>
  )
}
