import { createClient } from '@supabase/supabase-js'
import { rastreoDePaqueteria } from '@/lib/rastreo/paqueterias'
import BotonCopiar from './BotonCopiar'

// Página pública a la que llega el cliente desde el botón "Rastrear mi envío"
// del WhatsApp. El id del envío es un uuid (no se puede adivinar) y la página
// solo muestra el primer nombre, la paquetería y la guía: nada de dinero ni
// de otros datos del cliente.
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Rastrea tu envío | Denog',
  robots: { index: false, follow: false },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fondo = { minHeight: '100vh', background: '#FFF6E9', fontFamily: "Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif", color: '#2a3a52', padding: '24px 16px 40px', display: 'flex', justifyContent: 'center' }
const caja = { width: '100%', maxWidth: 460 }

export default async function Rastreo({ params }) {
  const { id } = await params

  let envio = null
  if (UUID.test(id)) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data } = await supabase
      .from('envios_foraneos')
      .select('paqueteria, numero_guia, estado, clientes!envios_foraneos_cliente_id_fkey(nombre)')
      .eq('id', id)
      .single()
    if (data && ['aprobado', 'notificado'].includes(data.estado) && data.numero_guia) envio = data
  }

  if (!envio) {
    return (
      <div style={fondo}>
        <div style={{ ...caja, textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>No encontramos este envío</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: '#5b6b82' }}>
            Revisa que hayas abierto el link completo del WhatsApp. Si sigue sin abrir, escríbenos por ese mismo chat y te ayudamos.
          </div>
        </div>
      </div>
    )
  }

  const primerNombre = String(envio.clientes?.nombre || '').trim().split(/\s+/)[0] || 'cliente'
  const guia = String(envio.numero_guia).trim()
  const rastreo = rastreoDePaqueteria(envio.paqueteria, guia)

  return (
    <div style={fondo}>
      <div style={caja}>
        <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid #d8e4f3', background: '#bcd7f1', lineHeight: 0 }}>
          <video src="/assets/envio-en-camino.mp4" autoPlay loop muted playsInline style={{ width: '100%', display: 'block' }} />
        </div>

        <div style={{ textAlign: 'center', margin: '22px 0 18px' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>Hola, {primerNombre}</div>
          <div style={{ fontSize: 15.5, color: '#5b6b82', marginTop: 4 }}>Tu pedido ya se encuentra enviado</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e6ddcf', borderRadius: 18, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: '#8a96a8' }}>PAQUETERÍA</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 14px' }}>{envio.paqueteria}</div>

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: '#8a96a8' }}>NÚMERO DE GUÍA</div>
          <div style={{ fontSize: 24, fontWeight: 800, margin: '2px 0 14px', wordBreak: 'break-all', userSelect: 'all', fontVariantNumeric: 'tabular-nums' }}>{guia}</div>

          <BotonCopiar texto={guia} />

          {rastreo && (
            <a href={rastreo.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textAlign: 'center', marginTop: 10, padding: '13px 16px', borderRadius: 14, border: '2px solid #466D9B', color: '#466D9B', fontSize: 15.5, fontWeight: 700, textDecoration: 'none' }}>
              Rastrear en {rastreo.nombre}
            </a>
          )}
          {rastreo && !rastreo.conGuia && (
            <div style={{ fontSize: 12.5, color: '#8a96a8', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
              Copia tu guía y pégala en la página de {rastreo.nombre}.
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 26, color: '#466D9B' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Denog</div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>USA Compras</div>
        </div>
      </div>
    </div>
  )
}
