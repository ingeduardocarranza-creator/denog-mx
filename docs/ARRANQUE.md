# Arranque — qué hace cada quien

**Decisión tomada:** Cloud API directo con Meta. Manychat solo si el trámite se atora.

El trámite tarda **días de espera**, no días de trabajo. Por eso arranca hoy y en
paralelo se construye lo que no depende de él.

---

## PARTE A — Lo que haces tú (Meta)

Ninguno de estos pasos requiere programar. Son formularios.

### A1. Meta Business (Business Manager)
Entra a `business.facebook.com`. Si ya tienes una cuenta de negocio para Denog, úsala.
Si no, créala con el nombre y datos fiscales reales del negocio.

### A2. Verificación de negocio ⚠️ *el paso lento*
Meta te va a pedir documentos que comprueben que el negocio existe. Como **Persona
Física con Actividad Empresarial**, ten a la mano:

- Constancia de Situación Fiscal (RFC)
- Comprobante de domicilio a nombre del negocio o tuyo
- Que el nombre en Meta coincida **exactamente** con el de la constancia

> **Aquí es donde se atora la gente.** El error más común es que el nombre del negocio
> en Meta no coincide letra por letra con el documento. Revísalo antes de mandar.
> La revisión tarda de unos días a un par de semanas.

### A3. Conectar tu número con coexistencia
Con la verificación aprobada, se conecta tu número **sin sacarlo del celular**. Tu app
de WhatsApp Business sigue funcionando igual: mismos chats, mismo historial, mismos
grupos, mismo número.

> Si este paso te pide ser "proveedor de tecnología" o se complica, **ahí paramos y nos
> vamos a Manychat**. No vale la pena pelearse con Meta por $45 dólares al mes. Pero
> primero hay que intentarlo, porque el ahorro es permanente.

### A4. Avisarme cuando esté
Con eso me pasas tres datos y yo conecto el resto.

---

## PARTE B — Lo que construyo yo mientras tanto

No depende del trámite. Se prueba subiendo imágenes a mano.

| Orden | Qué | Para qué |
|---|---|---|
| B1 | Migración: tabla `pendientes` | El lugar donde se apuntan las cosas |
| B2 | Pantalla `/admin/pendientes` | La libreta: lista, "Yo lo veo", "Listo", abrir chat |
| B3 | Clasificador IA | Lee la imagen o el texto y decide si merece pendiente |
| B4 | Detalle de comprobante | Ver la foto, corregir el monto, **Aprobar** → `pagos` |
| B5 | `/api/whatsapp/webhook` | Se enchufa el día que Meta apruebe |

**Cuando termine B2 ya puedes usar la pantalla**, subiendo fotos a mano, y decirme si
la lista está como la necesitas — antes de que exista la conexión automática.

---

## Hoy mismo, gratis, sin esperar nada

**Configura respuestas rápidas en WhatsApp Business.** Ajustes → Herramientas para
empresas → Respuestas rápidas. Crea una:

- Atajo: `/ahorita`
- Mensaje: *"Ya lo vi, en un rato te confirmo"*

Dos minutos. Desde hoy dejan de quedar clientes colgados mientras se construye lo demás.

---

## Si el trámite se atora

Plan B: Manychat, ~$45 USD/mes. **No se pierde nada del código** — el webhook queda
igual, solo cambia quién se lo manda. Es un cambio de medio día.
