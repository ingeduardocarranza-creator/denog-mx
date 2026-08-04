import Link from 'next/link';

export const metadata = {
  title: 'Aviso de Privacidad — Denog',
  description: 'Aviso de privacidad de Denog: cómo recabamos, usamos y protegemos tus datos personales.',
};

const fk = { fontFamily: 'var(--font-baloo2)' };
const jk = { fontFamily: 'var(--font-poppins)' };

const seccion = { marginTop: 34 };
const h2 = { ...fk, fontWeight: 700, fontSize: 20, color: '#2a2118', margin: '0 0 10px' };
const p = { ...jk, fontWeight: 400, fontSize: 15.5, lineHeight: 1.7, color: 'rgba(42,33,24,0.75)', margin: '0 0 12px' };
const li = { ...jk, fontWeight: 400, fontSize: 15.5, lineHeight: 1.7, color: 'rgba(42,33,24,0.75)', marginBottom: 6 };

export default function Privacidad() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(175deg, #fdfaf5 0%, #fbf8f3 40%, #f5ecdf 100%)',
      padding: 'clamp(28px,6vw,72px) clamp(20px,5vw,0) clamp(60px,8vw,100px)',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 720, padding: '0 clamp(20px,3vw,0)' }}>

        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28,
          fontSize: 14, fontWeight: 700, color: '#c1553a', textDecoration: 'none', ...jk,
        }}>
          ← Volver a Denog
        </Link>

        <div style={{
          background: '#fff', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 22,
          boxShadow: '0 24px 60px rgba(42,33,24,.08)',
          padding: 'clamp(28px,5vw,48px)',
        }}>
          <h1 style={{ ...fk, fontWeight: 700, fontSize: 'clamp(28px,4vw,36px)', color: '#2a2118', margin: '0 0 6px' }}>
            Aviso de Privacidad
          </h1>
          <p style={{ ...jk, fontWeight: 700, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#c1553a', margin: '0 0 6px' }}>
            DENOG
          </p>
          <p style={{ ...jk, fontSize: 13.5, color: 'rgba(42,33,24,0.5)', margin: '0 0 8px' }}>
            Fecha de última actualización: 29 de julio de 2026.
          </p>

          <section style={seccion}>
            <h2 style={h2}>1. Responsable del tratamiento de datos</h2>
            <p style={p}>
              DENOG (&quot;nosotros&quot;), con domicilio de operación en México, es responsable del uso y protección
              de los datos personales que nos proporcionas a través de la aplicación móvil y el sitio DENOG, de
              conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
            </p>
            <div style={{
              background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.2)',
              borderRadius: 14, padding: '14px 18px', fontSize: 14.5, ...jk, color: '#2a2118',
            }}>
              <strong>Datos de contacto</strong><br />
              Correo: ventas.denogmx@gmail.com<br />
              Teléfono / WhatsApp: 662 548 6432
            </div>
          </section>

          <section style={seccion}>
            <h2 style={h2}>2. Datos personales que recabamos</h2>
            <p style={p}>A través de la app y el sitio recabamos los siguientes datos:</p>
            <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
              <li style={li}>Nombre completo.</li>
              <li style={li}>Número de teléfono (con el cual se genera tu usuario y contraseña de acceso).</li>
              <li style={li}>Dirección de entrega para tus pedidos a domicilio.</li>
              <li style={li}>Historial de tus compras y pedidos realizados dentro de la app.</li>
            </ul>
            <p style={p}>
              No recabamos ni almacenamos datos de tarjetas bancarias dentro de la aplicación. Los pagos se
              coordinan de forma directa a través de WhatsApp con nuestro equipo de ventas.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>3. Finalidades del tratamiento de datos</h2>
            <p style={p}>Tus datos personales se utilizan para las siguientes finalidades:</p>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li style={li}>Crear y administrar tu cuenta de usuario dentro de la app.</li>
              <li style={li}>Procesar, dar seguimiento y entregar tus pedidos.</li>
              <li style={li}>Contactarte por WhatsApp para confirmar tu pedido y coordinar el pago.</li>
              <li style={li}>Mostrarte tu historial de compras y estado de cuenta.</li>
              <li style={li}>Enviarte notificaciones sobre el estado de tus pedidos.</li>
              <li style={li}>Mejorar nuestros productos, servicio y atención al cliente.</li>
            </ul>
          </section>

          <section style={seccion}>
            <h2 style={h2}>4. Uso de la ubicación</h2>
            <p style={p}>
              Si autorizas el permiso de ubicación, la usamos únicamente para sugerir o confirmar tu dirección
              de entrega y facilitar el servicio a domicilio. Puedes desactivar este permiso en cualquier
              momento desde la configuración de tu dispositivo, aunque esto puede limitar la función de
              pedidos a domicilio.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>5. Con quién compartimos tus datos</h2>
            <p style={p}>
              Tus datos de contacto y pedido se comparten con nuestro equipo interno de ventas y colaboradores
              (a través de WhatsApp y del portal administrativo de DENOG) únicamente para gestionar tu pedido,
              entrega y pago. No vendemos ni compartimos tus datos personales con terceros ajenos a la
              operación del negocio.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>6. Derechos ARCO</h2>
            <p style={p}>
              Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte (derechos ARCO) al uso de tus datos
              personales, así como a revocar el consentimiento que nos hayas otorgado. Para ejercer estos
              derechos, escríbenos a{' '}
              <a href="mailto:ventas.denogmx@gmail.com" style={{ color: '#c1553a' }}>ventas.denogmx@gmail.com</a>
              {' '}o al WhatsApp 662 548 6432, indicando tu nombre y el derecho que deseas ejercer.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>7. Seguridad de tus datos</h2>
            <p style={p}>
              Implementamos medidas administrativas y técnicas razonables para proteger tus datos personales
              contra pérdida, uso indebido o acceso no autorizado. El acceso a tu cuenta está protegido por
              usuario y contraseña; te recomendamos no compartir tus credenciales con terceros.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>8. Cambios a este aviso de privacidad</h2>
            <p style={p}>
              Podemos actualizar este aviso de privacidad en caso de cambios en nuestros procesos internos o
              en la legislación aplicable. Cualquier modificación será publicada dentro de la app y en este
              mismo documento, indicando la fecha de la última actualización.
            </p>
          </section>

          <section style={seccion}>
            <h2 style={h2}>9. Aceptación</h2>
            <p style={{ ...p, marginBottom: 0 }}>
              Al crear una cuenta y usar la aplicación o el sitio DENOG, confirmas que has leído y aceptas
              este aviso de privacidad.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
