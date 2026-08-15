# Plan Denog — el asistente que toma nota

> Plan vigente. `PLAN_INTEGRAL.md` y `PLAN_IA_SUPERVISOR.md` quedan como historial.

---

## 1. Qué es, en una frase

**Una IA que lee tus conversaciones de WhatsApp en segundo plano y va anotando en el
sitio web todo lo que requiere acción y nadie ha atendido — para que después ustedes
dos lo resuelvan caso por caso, con calma.**

La IA **no contesta, no aprueba, no concilia**. Solo toma nota para que nada se pierda.

---

## 2. Por qué ya no propongo capturar a mano

Yo proponía que ustedes compartieran a la app lo que se fuera a atrasar. **Tenías razón
en rechazarlo:** eso depende de que se acuerden justo en el momento en que están
saturados, que es exactamente cuando el sistema falla. Si depende de disciplina en el
peor momento, no sirve.

**La IA tiene que leer sola.** Punto.

---

## 3. Sobre el riesgo de que te baneen la cuenta

Es la duda correcta —de ese número vive el negocio— pero el peligro **no está donde
parece**.

### Lo que de verdad provoca baneos

| Causa real | ¿Aplica a ti? |
|---|---|
| Herramientas **no oficiales**: extensiones de Chrome, scrapers, apps modificadas (GB WhatsApp, WhatsApp Plus) | **No** |
| Mandar mensajes masivos a gente que **nunca dio permiso** | **No** |
| Tasa alta de bloqueos y reportes de tus destinatarios | **No** |
| Mandar promociones en cadena sin que te las pidan | **No** |

**Tu perfil es el más seguro que existe:** solo vas a *leer*, y a contestar desde el
celular dentro de conversaciones que **el cliente abrió**. Ese uso no genera baneos.

### La confusión a aclarar

**La Cloud API es la API oficial de Meta.** No es una alternativa "menos oficial" a
Manychat — es *la de Meta*. Manychat corre **encima de esa misma API**. Ninguna de las
dos es más segura que la otra frente a un baneo, porque **son la misma tubería**.

### Entonces, ¿para qué sirve Manychat?

Para **facilidad de alta y soporte**, no para protección:

| | Cloud API directo | Manychat |
|---|---|---|
| Costo mensual | **$0** de plataforma | ~$40–55 USD |
| Riesgo de baneo | El mismo | El mismo |
| Alta y coexistencia | La configuras tú | Te la resuelven |
| Si algo se rompe | Lo resuelves tú | Hay a quién escribirle |
| Funciones que sí usarías | Todas (solo webhook) | ~20% de lo que pagas |

**Las dos opciones son legítimas.** Si esos $40–55 al mes te compran tranquilidad y un
alta sin dolores de cabeza, es una razón válida para pagarlos — solo que la razón es
*comodidad y soporte*, no *seguridad*.

**Costo del resto del sistema en cualquier caso: la IA, ~$10–20 USD/mes.**

### ⚠️ Dónde SÍ está tu riesgo de baneo (importante)

No está en leer. Está en el **Módulo 2**: los recordatorios de cobranza y las alertas de
resurtido. Si eso se convierte en mandar plantillas en masa por API a clientes que no
escribieron recientemente, **ahí sí** te ganas reportes, bloqueos y baja de calidad.

**Por eso la cobranza se queda como está planeada: un botón `wa.me` que una persona
aprieta y manda desde su celular.** Es un mensaje normal, no una plantilla masiva. Cero
riesgo. Esa decisión de diseño vale más para proteger tu número que cualquier plataforma
que contrates.

---

## 4. Lo que NO cambia en tu operación

Esto es clave y es la razón por la que esto es viable:

- Tu número **sigue en el celular**, con la app de WhatsApp Business de siempre.
- **Sigues publicando fotos al grupo** exactamente igual.
- **Siguen contestando desde el celular** exactamente igual.
- No se migra nada, no se pierde historial, no se pierde el número.

Se llama **coexistencia** y desde finales de 2025 está disponible en México. La API solo
**escucha**. Nadie del equipo cambia su forma de trabajar.

Lo único a confirmar: la coexistencia deja tus **listas de difusión** en solo lectura.
Si las usas, hay que planearlo.

---

## 5. Cómo funciona

```
Cliente escribe / manda comprobante / pide algo de otra tienda
        ↓
Meta manda el mensaje a tu servidor      (webhook, en segundos)
        ↓
La IA lo lee y decide: ¿esto requiere acción que se pueda olvidar?
        ↓
    Es la venta normal → no hace nada.  (foto reenviada del grupo, talla, saludo)
    Lo demás, incluso si duda → escribe UN renglón en Pendientes
        ↓
Ustedes lo ven en el sitio web y lo resuelven caso por caso
```

### Lo que la IA anota

| Tipo | Qué extrae | Quién lo resuelve |
|---|---|---|
| **Comprobante de pago** | monto, fecha, banco, ordenante, referencia | **Una persona concilia y aprueba.** Nunca la IA |
| **Pedido específico de otra tienda** | marca, modelo, talla, color, cantidad | Una persona cotiza y responde |
| **Mensaje sin responder** | de quién, hace cuánto, qué pedía | Una persona contesta |

Esa tercera línea es el "sin que se pierda nada": **si un cliente escribió y ninguno de
los dos contestó en X minutos, entra a la lista solo.**

### La pieza que resuelve "a veces contestamos ambos"

Meta avisa a tu servidor **también cuando ustedes contestan desde el celular**
(se llama *message echo*). Entonces el sistema sabe solo que ya alguien atendió, y el
pendiente se cierra sin que nadie tenga que marcarlo.

Y para lo que sí requiere trabajo (conciliar, cotizar), sigue el botón **"Yo lo veo"**
que estampa tu nombre para que el otro no lo repita.

---

## 6. Qué se construye

| Pieza | Qué hace |
|---|---|
| Alta en Meta + coexistencia | El trámite. Se arranca primero porque son días de espera |
| `/api/whatsapp/webhook` | Recibe todo: mensajes de clientes y ecos de los suyos |
| Clasificador IA | Decide si algo merece pendiente. **Ante la duda, avisa** — solo se calla con la venta normal |
| Tabla `pendientes` | Un renglón por cosa que falta hacer |
| Pantalla **Pendientes** | Lista, filtros, "Yo lo veo", "Listo", abrir chat |
| Detalle de comprobante | Ver la foto, corregir el monto, **Aprobar** → registra en `pagos` |

**Regla de oro del clasificador:** ante la duda, **sí** crear pendiente.

> **Actualizado el 15/ago/2026.** Antes decía lo contrario ("ante la duda, no crear").
> Se invirtió a petición de Eduardo, después de la primera prueba real. El motivo es el
> modelo de uso: él revisa y valida todo de todas formas, así que un pendiente de más
> cuesta dos segundos de lectura y uno de menos cuesta un cliente, un pago sin conciliar
> o un pedido perdido. Los costos no son simétricos.
>
> El riesgo sigue existiendo y hay que vigilarlo: una lista con demasiado ruido se
> abandona. Si eso pasa, la salida **no** es volver al criterio silencioso, sino afinar
> el clasificador con los errores reales marcados desde el panel (botón "Esto no era").
>
> Lo que sigue sin generar pendiente nunca es la venta normal: reenviar una foto del
> grupo, preguntar talla o color de algo ya publicado, cortesías y saludos, y preguntas
> de seguimiento sobre algo ya en curso. Eso no es "duda" — es ruido conocido.

**La especificación completa de la sección está en `PENDIENTES.md`.** Ese documento
manda sobre este en todo lo relativo a Pendientes: objetivo, límites, categorías
actuales y planeadas, y el ciclo de corrección.

**Tiempo estimado:** ~2 semanas de código, más el trámite de Meta corriendo en paralelo
desde el día uno.

---

## 7. Qué NO va en la primera versión

- Convertir un pedido específico en Encargo con fecha de entrega → después
- Resúmenes de conversación completos → después (primero que la lista funcione)
- Temporizador de apartado, resurtido, Denog Hub → después
- **Que la IA conteste algo al cliente** → no está en el plan, ni ahora ni luego

---

## 8. Gratis y hoy mismo

**WhatsApp Business trae "Respuestas rápidas".** Configura `/ahorita`:
*"Ya lo vi, en un rato te confirmo"*. Dos minutos, cero código, y desde hoy dejas de
tener clientes colgados mientras se construye lo demás.

---

## 9. Decisiones ya tomadas

1. **Listas de difusión:** no las usa. La coexistencia no le afecta en nada.
2. **Tiempo sin respuesta → pendiente automático:** 15 minutos.
3. **Horario de atención** (fuera de este horario NO se generan pendientes de
   "mensaje sin responder"):
   - Lunes a viernes: 10:00 am – 7:00 pm
   - Sábado: 10:00 am – 5:00 pm
   - Domingo: cerrado
4. **Acceso al Business Manager de Meta:** Andrea Verónica (dueña) y Eduardo Carranza
   (desarrollador), ambos con acceso total a la página y al portfolio "Denog mx".
5. **Monto de transferencia que no coincide** (pago parcial, de más, o dos pedidos
   juntos): el pendiente se crea siempre, etiquetado como "no coincide", con el monto
   detectado. Nunca lo resuelve la IA — siempre pasa a revisión manual.

## 10. Credenciales de Meta (listas)

- **Phone Number ID:** `206272094692390`
- **WABA ID:** `2988570078091964`
- **Token permanente del usuario del sistema:** generado y guardado por Andrea Verónica
  (no se documenta aquí por seguridad — vive en las variables de entorno del proyecto).

## 11. Ya está construido (B1–B5)

| Pieza | Dónde vive |
|---|---|
| Tabla `pendientes` | `db/migrations/2026-08-06_pendientes.sql` |
| Pantalla `/admin/pendientes` | `app/admin/pendientes/page.js` |
| Clasificador IA | `lib/whatsapp/clasificador.js` (Claude Haiku, mismo patrón que sugerir-nombre) |
| Aprobar comprobante → pagos | `app/api/pendientes/aprobar-comprobante/route.js` + `db/migrations/2026-08-06_pagos_whatsapp.sql` |
| Estado de conversación + barrido "sin responder" | `lib/whatsapp/sweepSinResponder.js`, tabla `conversaciones_whatsapp` (`db/migrations/2026-08-06_conversaciones_whatsapp.sql`), corre solo cada vez que el menú admin consulta el badge (cada 20s, sin necesidad de un cron aparte) |
| Webhook | `app/api/whatsapp/webhook/route.js` |

Decisiones de B4 (cómo se aprueba un comprobante):
- Al aprobar, se crea un pago en la misma tabla `pagos` que usan Mercadito y Encargos
  (tipo "Anticipo", método "Transferencia") — mismo lugar, mismos reportes.
- El monto lo propone la IA pero **siempre lo confirma o corrige una persona** antes de
  aprobar.
- Se elige a mano a qué "estado de cuenta" (entrega) se abona — por defecto se propone la
  entrega más próxima, pero se puede cambiar.
- Si el número de WhatsApp no coincide con ningún cliente registrado (compradores del
  grupo casi nunca tienen cuenta en el sitio), el pago se guarda con nombre/teléfono
  suelto, sin crear una cuenta nueva.

Nota técnica de B5, honesta: el formato exacto en que Meta manda los "ecos" de mensajes
enviados desde el celular (coexistencia) no se pudo confirmar sin tráfico real — el código
asume un campo `message_echoes`, documentado por Meta, pero **hay que revisarlo apenas
lleguen los primeros mensajes de prueba** y ajustar `app/api/whatsapp/webhook/route.js` si
el nombre del campo es distinto. Si esto no funciona, el barrido de "sin responder" sigue
funcionando igual (se basa en si el cliente volvió a escribir, no solo en el eco).

## 11 bis. Trampas de la coexistencia (aprendidas a la mala)

- **La API ocupa uno de los 5 espacios de dispositivo.** WhatsApp permite el celular
  "cerebro" + 4 dispositivos vinculados. Si los 5 están ocupados, la conexión con la API
  falla en silencio: el número queda "Sin conexión" y el código de verificación para
  revincularlo **nunca llega**. Solución: desvincular un dispositivo (Ajustes →
  Dispositivos vinculados) y reintentar. Esto costó una sesión entera de diagnóstico.
- Si la app no se abre en el celular "cerebro" por más de 14 días, la coexistencia se
  desconecta sola.
- WhatsApp para Windows y WearOS no funcionan en coexistencia. Web y Mac sí, pero se
  desvinculan al conectar la API y hay que volver a vincularlos.
- Los mensajes de grupos no llegan a la API (para Denog no importa: el grupo es solo de
  difusión de fotos).
- La cuenta de WhatsApp también debe estar suscrita a la app. Si el webhook está bien
  configurado pero no llega nada, verificar con
  `POST /{WABA_ID}/subscribed_apps` desde el Explorador de la API Graph.
- **La cuenta de Denog es de tipo "SMB"** (negocio pequeño con app de WhatsApp Business).
  Para ese tipo Meta bloquea el registro por API: `POST /{PHONE_ID}/register` devuelve
  *"Register endpoint is not available for SMB businesses"*. Tampoco hay botón en
  WhatsApp Manager. **El único camino es el Embedded Signup de coexistencia**, que se
  lanza desde una página propia (ver B7), no desde ninguna pantalla de Meta.
- Diagnóstico útil: `GET /{PHONE_ID}?fields=status,platform_type,code_verification_status`.
  Si `platform_type` es `ON_PREMISE` y `status` es `DISCONNECTED`, el número quedó atado
  a la API vieja (dada de baja por Meta) y hace falta rehacer el onboarding por
  coexistencia.
- **La coexistencia NO se puede activar solo.** La documentación oficial de Meta
  ("Onboard WhatsApp Business app users") lo dice en Requisitos: *"You must already be
  a Solution Partner or Tech Provider."* Un negocio no puede conectar su propio número
  a coexistencia desde su propia página — el diálogo se abre pero salta al permiso
  genérico de OAuth y nunca muestra el QR. Se intentó (B7) y así se comprobó.
- **El código de verificación de "Vincular una cuenta de WhatsApp Business" no llega
  por SMS.** Llega como un chat dentro de la app de WhatsApp Business, mandado por la
  cuenta oficial de Facebook Business. Requiere app 2.24.17+.
- **Los mensajes de grupo nunca llegan a la API**, ni con coexistencia. El grupo de
  difusión de fotos de Denog seguirá siendo 100% manual. El asistente solo ve chats 1 a 1
  (que es donde caen comprobantes, pedidos específicos y "sin responder").
- La coexistencia apaga en la app: listas de difusión, mensajes temporales, ver una vez y
  ubicación en tiempo real. Y desvincula todos los dispositivos vinculados una vez.
- El CSP del sitio (`next.config.mjs`) bloqueaba `connect.facebook.net`. Ya está
  permitido, junto con `graph.facebook.com` y los frames de `facebook.com`.

## 11 ter. Proveedores de coexistencia (comparados en ago 2026)

Todos corren sobre la misma Cloud API oficial: **ninguno cambia el riesgo de baneo**.
Ese riesgo viene del comportamiento (mensajes masivos, reportes), no del proveedor.

| Proveedor | Costo aprox. | Nota |
|---|---|---|
| **Dualhook** | ~$12 USD/mes | Webhook Override: Meta manda directo a nuestro servidor, el código B1–B5 no se toca. No guarda mensajes. WABA queda en el portafolio propio. Empresa chica. |
| **360dialog** | ~$5–59 USD/mes | BSP establecido, muy usado en LatAm. Recargo de 7% en ciertos mensajes de marketing. |
| **Manychat** | ~$15–25 USD/mes | Coexistencia en beta. No pasa webhooks crudos: habría que rehacer parte de B5 (recibir vía External Request). No sincroniza historial viejo. Da bandeja y automatizaciones. |
| **Wati / respond.io** | $59–79 USD/mes | Plataformas de bandeja completa. Caras y guardan todos los mensajes en sus servidores. |
| **Número aparte "asistente"** | $0 | Número nuevo en Cloud API (self-service, sin socio). El equipo reenvía lo que hay que anotar. Cero riesgo al número principal, pero depende de disciplina. |
| **Tech Provider propio** | $0 + trámite | Verificación de negocio. Pensado para quien da servicio a terceros. Desproporcionado. |

## 12. Qué falta para encenderlo

1. Correr en Supabase (SQL editor, en este orden) las migraciones que faltan:
   `2026-08-06_pendientes.sql`, `2026-08-06_pagos_whatsapp.sql`,
   `2026-08-06_conversaciones_whatsapp.sql`.
2. Agregar a las variables de entorno del proyecto (`.env.local` y en Vercel):
   `WHATSAPP_TOKEN` (el token permanente), `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN` (uno que tú inventes),
   `WHATSAPP_APP_SECRET` (de developers.facebook.com → tu app → Configuración → Básica).
   Ver `.env.example`.
3. Desplegar el proyecto para que exista una URL pública de
   `/api/whatsapp/webhook`.
4. En developers.facebook.com → tu app → WhatsApp → Configuración: pegar esa URL como
   "Callback URL" y el mismo `WHATSAPP_VERIFY_TOKEN` como "Verify token" → Verificar y
   guardar → suscribirse al campo `messages`.
5. Probar mandando un mensaje de prueba desde un celular ajeno al número de Denog y
   confirmar que aparece en `/admin/pendientes`.

Los puntos 1 a 4 ya están hechos. **El pendiente real es la conexión del número**, y va
en este orden:

6. **Esperar a Meta.** Ticket abierto el 7/ago/2026 (Direct Support → Dev: Phone Number
   & Registration → Registration Issues), severidad STANDARD. Piden que limpien el
   registro On-Premises fantasma del número. Ver `docs/TICKET_META.md`.
   Ese registro es lo que muy probablemente impide que llegue el código de verificación,
   y bloquearía también el onboarding de cualquier proveedor. Sin esto, nada avanza.
7. **Cuando Meta lo libere**, contratar un proveedor de coexistencia (ver §11 ter).
   Recomendado: Dualhook o 360dialog, porque mandan los webhooks directo al servidor y
   `app/api/whatsapp/webhook/route.js` sigue funcionando sin cambios.
8. Recién ahí, la prueba end-to-end del punto 5.

La página `/admin/conectar-whatsapp` (B7) se queda en el repo: no sirvió para el
onboarding —Meta lo bloquea para quien no es socio— pero documenta el intento y sirve si
algún día Denog llegara a ser Tech Provider.
