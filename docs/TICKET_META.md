# Ticket para soporte de Meta — desatorar el número

## ✅ RESUELTO (10 ago 2026)

Tras completar la verificación del negocio (dominio) y desvincular los
dispositivos vinculados en la app, se reintentó la coexistencia por
Dualhook por cuarta vez. Fue la primera vez que el flujo pasó completo por
el diálogo de OAuth (selector de número existente → confirmar cuenta →
zona horaria → revisión de permisos → confirmar) sin fallar en el paso del
QR/código, hasta "Finalizing your connection".

Confirmado en Graph API:

```json
{
  "is_on_biz_app": true,
  "platform_type": "CLOUD_API",
  "status": "CONNECTED",
  "id": "206272094692390"
}
```

El Phone Number ID **no cambió** — sigue siendo `206272094692390` — así que
no hace falta actualizar variables de entorno.

No se puede aislar con certeza cuál de las dos acciones fue la que
destrabó el número (verificación del negocio vs. limpiar dispositivos
vinculados), o si fue la combinación de ambas. Queda como aprendizaje para
un futuro caso similar: si un número queda en `ON_PREMISE`/`DISCONNECTED`
sin explicación, revisar primero que el WABA tenga verificación de negocio
completa y los dispositivos vinculados limpios, antes de considerar borrar
el registro.

**Siguiente paso:** correr B8 (prueba end-to-end del webhook) para
confirmar que los mensajes entrantes llegan y se clasifican correctamente.

---

## ⚠️ GIRO (9 ago 2026, superado): el WABA está sin configurar — prerequisitos faltantes

**El borrado quedó SUSPENDIDO.** Al buscar la opción de eliminar en
Configuración del negocio → Cuentas de WhatsApp → DENOG COMPRAS USA, se
descubrió que el WABA no cumple prerequisitos documentados:

| Campo | Estado |
|---|---|
| Verificación del negocio | ❌ **No verificado** |
| Método de pago | ❌ **No se encontró ninguno** |
| Dirección | ❌ Sin dirección |
| Divisa | ❌ No se encontró ninguna |
| Zona horaria | ❌ Sin información |
| Estado de la cuenta | ✅ Aprobada |

**Por qué importa.** El asistente de desarrolladores de Meta ya lo había
listado al principio ("acepta los Términos, agrega un método de pago válido,
completa la Verificación del Negocio si es requerida") y se pasó por alto —
se siguió el camino del `deregister` que venía en el mismo mensaje.

Encaja con la evidencia: Dualhook reportó que Meta cerró las 3 sesiones **sin
ningún ID de error, sin payload y sin razón de fallo**. Un fallo silencioso
es el patrón típico de un chequeo de elegibilidad incumplido, no de un bug.
Además, las guías de BSP piden explícitamente "información de negocio
completa: nombre, dirección, sitio web".

**Plan revisado (todo gratis y reversible, en este orden):**

1. ✅ Completar la información del negocio (zona horaria, divisa)
2. ✅ Agregar método de pago al WABA
3. ✅ Iniciar la Verificación del Negocio
4. ⏳ Reintentar la conexión por Dualhook (tras la verificación)
5. Solo si eso falla, retomar el borrado del registro

### Ejecución (10 ago 2026)

**Zona horaria y divisa:** `America/Hermosillo` y `MXN`. Guardado.

**Método de pago:** Visa terminada en 0654. Guardado. Datos fiscales del
WABA: razón social + dirección fiscal (Av. Plaza Mayor 5, Int. 5, Villa
Satélite, Hermosillo, Sonora 83200) + fin comercial = sí.

**Datos del portafolio (ya estaban completos):**

| Campo | Valor |
|---|---|
| Nombre legal | ANDREA VERONICA PEREZ VALENZUELA |
| Dirección | Av. Plaza Mayor 5, Int. 5, Villa Satélite, Hermosillo, Sonora 83200 |
| Teléfono | +526625486432 |
| Sitio web | https://denog.mx/ |
| RFC | PEVA960707PT3 |

**Verificación del negocio — enviada el 10 ago 2026.** Opciones elegidas:

- Caso de uso: *"La app requiere acceso a los permisos en Meta for Developers"*
- Tipo de negocio: **Sociedad unipersonal** (traducción de *sole
  proprietorship* — persona física que opera bajo nombre comercial/DBA)
- Registro: **Registrado** (alta ante el SAT + constancia de situación
  fiscal = registro gubernamental con documento oficial)
- Nombre del negocio: ANDREA VERONICA PEREZ VALENZUELA · Nombre alternativo:
  Denog
- Confirmación de vínculo: **SMS** al +52 662 548 6432

Meta indica **~2 días hábiles** de revisión.

**Actualización: el primer intento (SMS) fue rechazado sin motivo explícito.**
Al reintentar con más cuidado, se descubrió que ese primer intento saltó
directo de "elegir método" a "información enviada" — **nunca pidió subir el
documento**, aunque la pantalla decía "verifica con un documento y...". Muy
probablemente el rechazo fue por falta de documento adjunto.

**Segundo intento (10 ago 2026) — verificado exitosamente por dominio:**

En vez de repetir SMS/WhatsApp, se usó **verificación por dominio**, que es
más determinista (no depende de que llegue un mensaje) y da resultado
inmediato en vez de pasar a revisión manual:

1. Se agregó `denog.mx` en Configuración → Orígenes de datos → Dominios
2. Meta dio una metaetiqueta: `<meta name="facebook-domain-verification" content="blwyu8tnhwipg3rmz9fmv8959cedzv" />`
3. Se agregó al `<head>` vía `metadata.other` en `app/layout.js` (commit
   `5327e44`), desplegado en Vercel
4. Confirmado en el código fuente servido y verificado en Meta → **dominio
   verificado**
5. Se retomó la verificación del negocio, esta vez con sitio web
   `https://denog.mx/` (sin www, para que coincida exactamente con el
   dominio verificado)

**Resultado: "Verificación para ANDREA VERONICA PEREZ VALENZUELA — Verificada"
✅ (10 ago 2026, sin esperar los 2 días hábiles).**

Con esto, los 4 prerequisitos que faltaban en el WABA quedaron completos:
divisa, zona horaria, método de pago, y ahora verificación del negocio.

### 📌 Pendiente para cuando aprueben la verificación

1. **Reintentar la conexión de coexistencia por Dualhook** (ya está toda
   configurada — webhook `https://denog.mx/api/whatsapp/webhook`, verify
   token `denog-webhook-2026-Chapon`; solo falta que el paso del código
   funcione). Antes, volver a correr el diagnóstico:
   `GET /206272094692390?fields=is_on_biz_app,platform_type,status,code_verification_status`
   y ver si `platform_type` cambió a `CLOUD_API`.

2. **Solicitar la Cuenta Comercial Oficial (palomita verde de WhatsApp).**
   Es **gratis** — no se compra, Meta la otorga según la notoriedad de la
   marca, y la verificación del negocio es requisito previo. No está
   garantizada, pero no cuesta nada pedirla. No confundir con Meta Verified
   (palomita azul), que es una suscripción de pago que **no** desbloquea nada
   de la API y no aporta a este proyecto.

3. Si tras la verificación el `platform_type` sigue en `ON_PREMISE` y la
   conexión vuelve a fallar, retomar el borrado del registro (ver sección de
   abajo, con el análisis de riesgo de Dualhook).

**Nota sobre la decisión "Registrado" vs "Aún no registrado":** se verificó
contra guías de BSP (Wati, CueDesk, SleekFlow). El criterio no es persona
física vs moral, sino si existe registro gubernamental con documentos
oficiales obtenibles. El alta ante el SAT lo es. "Aún no registrado" es para
negocios informales sin papeles, y aun así Meta pide documentos — más
débiles (recibos de luz, contratos) que una constancia fiscal.

**Nota:** la opción que sí aparece en el menú "..." es *"Eliminar del
portafolio comercial"*, que borra el WABA completo — mucho más drástico que
borrar la entrada del número, y no cubierto por el análisis de Dualhook. **No
usarla.** La interfaz de Números de teléfono no ofrece papelera para este
número.

## DECISIÓN PREVIA (superada): borrar la entrada del número y reintentar

Tras la respuesta de Dualhook (ver más abajo), se decidió ejecutar el
borrado. Orden acordado:

1. **Copia de seguridad local de chats** en el celular (WhatsApp Business →
   Ajustes → Chats → Copia de seguridad). Cubre lo único irreversible.
2. **Borrar la entrada** en Administrador de WhatsApp → Números de teléfono →
   ícono de papelera → Siguiente.
3. **Esperar** de 3 minutos a 3 horas a que surta efecto.
4. **Verificar** en el Explorador de la API que el registro desapareció.
5. **Reintentar** la conexión por Dualhook con el número limpio.

### ⚠️ Pendiente de código para después del re-alta

Cuando el número se vuelva a dar de alta, **Meta asigna un Phone Number ID
nuevo**. El actual (`206272094692390`) deja de servir, y probablemente
también el token permanente. Hay que actualizar:

- `WHATSAPP_PHONE_NUMBER_ID` en `.env.local` y en las variables de entorno de
  Vercel
- posiblemente `WHATSAPP_TOKEN` / `WHATSAPP_BUSINESS_ACCOUNT_ID`

Si no se actualizan, el webhook no recibirá nada aunque la conexión funcione.


## Actualización (ago 2026): evidencia reunida tras 3 intentos fallidos

Se intentó conectar coexistencia por 3 vías independientes — página propia
(Embedded Signup con app "Denog Web"), y Dualhook (Meta Tech Partner oficial) —
las 3 fallan en el mismo punto: el paso del QR / código de acceso ("Código de
verificación no válido", cámara "No se pudo escanear el código").

Se revisó `business.facebook.com/wa/manage/activity-log` completo (desde
feb 2025, el registro más antiguo disponible). **Ningún proveedor externo
aparece jamás** — solo "Sistema de Meta" (actualizaciones automáticas de
perfil) y el propio equipo de Denog. Nunca hubo un BSP, Tech Provider ni app
de terceros contratada antes de este proyecto.

Conclusión: el registro `ON_PREMISE` lo generó el propio sistema de Meta —
posiblemente al vincular la página de Facebook/Instagram del negocio a
WhatsApp Business — no un proveedor al que se le pueda pedir que lo libere.
Por eliminación, **solo Meta puede limpiarlo.**

## Tickets enviados

| Fecha | Canal | Resultado |
|---|---|---|
| ago 2026 | Direct Support (business.facebook.com), tema "Dev: Phone Number & Registration" | Cerrado automáticamente por "Meta AI Agent" sin revisión humana |
| 9 ago 2026 | whatsapp.com/contact (formulario "Contactar con WhatsApp") — Ticket #2099720597604817 | Respuesta automática genérica (IA), sin resolver. Se respondió pidiendo escalar a humano |
| 9 ago 2026 | Direct Support (business.facebook.com) | URL no cargó — probando ruta alterna vía developers.facebook.com/support/bugs/ |
| 9 ago 2026 | Herramienta "Reportar un error" (developers.facebook.com) | Bug de la propia herramienta: botón "Siguiente" no se habilita, falla en Chrome y Safari |
| 9 ago 2026 | Meta AI Developer Assistant (developers.facebook.com/support/) | Sugirió probar `POST /{Phone-Number-ID}/deregister` antes de re-registrar |
| 9 ago 2026 | Graph API Explorer: `POST /206272094692390/deregister` | Error: "Phone number is not currently linked in Facebook Hosted System" (OAuthException, code 100). fbtrace_id: `AP_txpTGySbHDHFyxhwErh_` — **evidencia clave** |
| 9 ago 2026 | Direct Support real (vía enlace generado por el AI Developer Assistant, no la URL escrita a mano) — tema "Dev: Account & WABA" > "Account Activity Issues" — **Caso #28274950395500339** | Clasificado severidad STANDARD, cerrado por "Meta AI Agent" en 1 min ("no relevant information"), sin revisión humana. No se puede reabrir |

## Hallazgo clave (9 ago 2026): el número está en un candado de dos vías

Se probaron las dos únicas acciones posibles sobre el número vía API, con resultado opuesto y simétrico:

- `POST /206272094692390/register` → **"Register endpoint is not available for SMB businesses."**
- `POST /206272094692390/deregister` → **"Phone number is not currently linked in Facebook Hosted System"** (fbtrace_id: `AP_txpTGySbHDHFyxhwErh_`)

Es decir: el sistema de Meta no permite registrarlo (porque supuestamente ya está vinculado a algo) ni desregistrarlo (porque supuestamente no está vinculado a nada). Es una contradicción a nivel de backend — ninguna acción vía API pública puede resolverla. Es la prueba más fuerte hasta ahora de que el arreglo requiere intervención manual de un ingeniero de Meta con acceso al backend, y el `fbtrace_id` es la referencia exacta que deberían poder buscar en sus logs internos.


**Problema en una línea:** el número de Denog quedó registrado en la API vieja
(On-Premises, que Meta dio de baja) y ese registro fantasma impide verificarlo
y conectarlo por coexistencia. Nadie puede arreglarlo desde fuera — solo Meta.

## Replanteo (9 ago 2026, tras investigar la documentación oficial)

Tres hallazgos que cambian el plan:

### 0. LA RUTA CORRECTA (confirmada por el propio soporte de Meta)

Tras abrir el caso #27401449072866325 con tema "Dev: Onboarding" y tipo
"Appeal API Onboarding Decision", **un agente de Meta respondió con la ruta
exacta** (primera respuesta útil en todo el proceso):

> "Please open a new Direct Support Ticket using the **'Question Topic:
> Onboarding, Request Type: Onboarding Status Pending'** so that your request
> can be routed to the correct team for assistance."

O sea:
- **Question Topic: Dev: Onboarding** ✅ (ya era el correcto)
- **Request Type: "Onboarding Status Pending"** ← este es el que faltaba

**PERO: esa opción no existe en nuestro portal.** Se revisó la lista
completa. Bajo "Dev: Onboarding" solo hay 3 tipos de solicitud:

1. Troubleshoot Meta Business Verification
2. Appeal API Onboarding Decision (Rejected after your phone number added)
3. App Review Questions/Issues

Se abrió el caso #27588421380849331 explicando textualmente que la opción no
existe y listando las 3 disponibles. **El bot respondió con exactamente el
mismo mensaje** y cerró el caso un minuto después.

Es un bucle cerrado: el soporte automático nos manda a una cola a la que no
tenemos acceso, y cierra cualquier caso que no encaje. Los tipos de cola
"WABiz:" y "TechProvider:" que menciona la documentación **solo existen para
socios (Tech Providers), no para negocios**.

### Consecuencia práctica

Un Tech Provider (como Dualhook o 360dialog) **sí tiene acceso a la cola
"TechProvider: Onboarding"** que Meta nos indicó. Nosotros no. La vía que
queda es pedirle a un proveedor que abra el ticket a nombre nuestro —
no que arregle el número (ya dijeron que no pueden), sino que **escale el
caso por su canal de socio**.

**Estado: se le pidió a Dualhook el 9 ago 2026.** En espera de respuesta.

### Vía investigada y descartada por ahora: borrar el número del WABA

El asistente de desarrolladores de Meta sugirió eliminar el número desde
Administrador de WhatsApp → Números de teléfono → papelera. Se investigó
antes de ejecutarlo:

**Confirmado (varias fuentes independientes coinciden):** tras borrar la
conexión de un número a un WABA, Meta impone un **período de espera de 1 a 2
meses** antes de que el número vuelva a ser elegible para coexistencia. Wati,
ChakraHQ, Eazybe y Wcapi reportan lo mismo. Además recomiendan no
re-registrar durante ese lapso, porque Meta puede reiniciar el conteo.

**No confirmado:** si borrar un registro fantasma (`DISCONNECTED`, que nunca
llegó a operar) afecta a la app de WhatsApp Business en el celular. Las
fuentes describen el caso contrario al nuestro — números que sí estaban
activos en la API y se "liberan" para volver a usarse en la app. Ninguna
aborda un registro fantasma con la app ya activa.

**No aplica:** la restricción de "no se puede borrar si hubo tráfico de pago
en 30 días" — este número nunca envió nada por Cloud API.

**Procedimiento (documentado, BusinessChat):** Configuración del negocio →
Cuentas de WhatsApp → [cuenta] → Configuración → Administrador de WhatsApp →
Números de teléfono → ícono de papelera → Siguiente. El único bloqueo que
Meta advierte en ese paso es haber enviado mensajes de pago en los últimos
30 días. **No aplica a nosotros.** Tarda entre 3 minutos y 3 horas en surtir
efecto según la fuente.

**Matiz importante sobre el cooldown:** todas las fuentes que reportan los
1-2 meses describen números que **sí llegaron a estar registrados y
conectados** a un WABA. El nuestro nunca lo estuvo (nunca se registró, está
`DISCONNECTED`, cero tráfico). Es posible que el cooldown no aplique — pero
ninguna fuente lo confirma para un registro fantasma.

**Incógnita que queda:** varias fuentes dicen que tras borrar, el número
"puede volver a usarse en WhatsApp o **re-registrarse** en la app de WhatsApp
Business". Ese "re-registrarse" es ambiguo y es el riesgo residual: no queda
claro si la app del celular se cierra la sesión. Una guía de Salesforce
sugiere además que el número no debería estar en uso por la app al momento de
borrarlo. Ninguna fuente aborda directamente nuestro escenario.

**Conclusión:** el procedimiento es claro y el único bloqueo documentado no
nos aplica. Lo que no se puede resolver leyendo es si la app del celular se
ve afectada. Esa pregunta se le hizo a Dualhook (Tech Partner) — es la mejor
fuente experta disponible y es gratis.

### Respuesta de Dualhook (9 ago 2026) — cambia el análisis de riesgo

**Sobre sus datos de sesión.** Tienen exactamente 3 intentos nuestros, todos
del 9 de agosto: 04:47 y 05:02 UTC en la etapa del QR, y 05:10 en la de
creación de número. **Los tres sin ningún ID de error, sin payload de error y
sin razón de fallo** — Meta cerró las sesiones sin reportarles nada. Esa es
toda su visibilidad, y por eso no pueden diagnosticar el "código inválido".

Pero un dato valioso: **los nombres de esas etapas pertenecen a la rama de
onboarding de app de WhatsApp Business de Meta.** Es decir, confirmado por un
Tech Partner: *estamos en el flujo de coexistencia correcto y eligiendo las
opciones correctas. El problema no es cómo estamos ejecutando el signup.*

**Sobre el riesgo a la app del celular (pregunta 1):**

> "La cuenta de la app en el teléfono y la entrada del número en el WABA son
> dos registros separados. Borrar la entrada del WABA en WhatsApp Manager
> elimina el activo del lado de la plataforma; **no borra la cuenta de la app
> de WhatsApp Business, ni sus chats, ni su historial en el dispositivo, y no
> obliga a re-registrar la app.**"

Y añaden que esa separación aplica especialmente a nuestro caso, porque los
dos registros **nunca llegaron a unirse**: la entrada está `DISCONNECTED`,
`NOT_VERIFIED`, nunca registrada, y la app misma ofrece "Conectar a la
plataforma empresarial". *Nada se le entregó nunca a la plataforma, así que
no hay nada que una eliminación pueda desmontar.*

Donde sí duele borrar una entrada es cuando el número **está activamente
registrado en Cloud API y cursando tráfico** — ahí la eliminación lo
desregistra. No es nuestra situación.

Aun así no lo llaman libre de riesgo, porque Meta no publica garantía escrita
para esta combinación exacta. **Recomiendan hacer una copia de seguridad
local de los chats en el celular antes de tocar nada** — quita la única parte
irreversible del asunto.

**Sobre el cooldown de 1-2 meses (pregunta 2): lo desmienten.**

> "No podemos confirmar un cooldown de coexistencia de uno a dos meses. Esa
> cifra no aparece en la documentación publicada por Meta hasta donde
> podemos encontrar, no está en nuestra documentación, y no aparece en
> ningún lugar de nuestro historial de soporte."

Advierten que si vino de un foro o de una respuesta de IA, hay que tomarla
con cautela — tuvieron un caso esta semana donde el propio agente de IA de
Meta dio consejo que contradecía la documentación publicada de Meta.

**El cooldown que sí es real y documentado** es el error **133016**:
aproximadamente 10 intentos de register/deregister por número en una ventana
móvil de 72 horas, tras lo cual el número queda bloqueado otras 72 horas.
**Horas o días, no meses.** (https://dualhook.com/docs/whatsapp-error-133016)

Como nuestro número nunca se registró y `/register` es rechazado de plano,
prácticamente no hemos consumido intentos contra ese tope.

Son honestos sobre lo que no saben: nunca han tenido que limpiar un registro
fantasma así, así que no tienen caso de primera mano en ninguna dirección.

### Corrección: de dónde salió el "1-2 meses"

Salió de centros de ayuda de terceros (Wati, ChakraHQ, Eazybe, Wcapi), **no
de documentación de Meta**. Dualhook tiene razón en cuestionarlo, y hay una
segunda confirmación independiente: el Tech Provider de Ecuador señaló en el
foro exactamente lo mismo — *"third-party BSP help centers quote 7 days /
30-60 days with no official source"*. Esas guías se repiten entre sí sin
fuente oficial.

Nota justa: esas cifras describen la **elegibilidad** para coexistencia
(error #3441045, "se necesita más actividad"), que es un mecanismo distinto
del límite de reintentos 133016. Podrían coexistir. Pero la elegibilidad es
una señal opaca y sin umbral documentado — nadie sabe realmente cómo funciona.

### Hallazgos del foro de desarrolladores de Meta (9 ago 2026)

Se revisaron hilos reales del foro oficial. Tres cosas importantes:

**1. No somos un caso raro.** Varios hilos describen exactamente lo mismo:

- *"WhatsApp embedded signup coexistence QR code fails"* — un Tech Provider
  independiente y otro usuario con ManyChat, mismo síntoma ("There is an
  error fetching the QR code for pairing"). Sin respuesta.
- *"Phone number stuck in coexistence mode"* (HookFlow AI, Tech Provider) —
  número atorado por un vínculo de coexistencia obsoleto. Probaron
  desconectar desde la app (la opción no aparece), contactar al BSP anterior,
  el reporte de errores y Direct Support. Sin resolución.
- *"Why is coexistence onboarding blocked by #3441045..."* (Tech Provider,
  Ecuador) — mismo patrón, y un comentario revelador de otro desarrollador:
  *"this community is kinda dead"*.

**2. El bug de la herramienta "Reportar un error" es de Meta, no nuestro.**
El hilo de Ecuador lo describe textualmente: *"the platform bug report form
does not advance past the product selection step for our app (Siguiente stays
aria-disabled with any category selected)"*. Es exactamente lo que nos pasó,
en Chrome y en Safari. Afecta a todos, incluidos Tech Providers.

**3. Pista verificada y descartada: restricciones en la cuenta personal.**
Varias guías de BSP (ChatDaddy, Eazybe) señalan que el escaneo del QR puede
fallar si hay restricciones sobre la **cuenta personal del administrador**.
Se revisó `facebook.com/business-support-home` con la cuenta de Andrea
Verónica: *"No hay problemas con las cuentas ni con los activos"*. **Sin
restricciones ni en el portafolio ni en la cuenta personal.** Descartado.

### Dato adicional

El panel de Ayuda de Meta Business Suite reporta *"No encontramos
restricciones para este activo"* sobre el portafolio Denog mx. Confirma que
**no hay sanción ni bloqueo de cuenta** — el problema es exclusivamente el
valor incorrecto de `platform_type`, no una penalización.

### 1. Usamos la cola de soporte equivocada — las dos veces

La documentación oficial de Meta ("Onboard WhatsApp Business app users",
sección *Need support?*) dice textualmente que para problemas de
onboarding de coexistencia hay que elegir:

- **Question Topic: "WABiz: Onboarding"** (no "Dev: Account & WABA" ni
  "Dev: Phone Number & Registration", que fueron los dos que usamos)
- **Request Type: "Embedded Signup - Coexistence Onboarding"**

Es muy probable que por eso el bot respondió "no relevant information" las
dos veces: el caso nunca llegó al equipo que sabe de esto.

### 2. La conexión quizá no es escaneando un QR

Según la doc oficial, el flujo correcto es:

1. En la compu aparece un **código de verificación**
2. En el celular **llega un mensaje de la cuenta oficial de Facebook Business**
   dentro de WhatsApp (un chat normal, no SMS)
3. En ese mensaje se toca **"Conectar"** → **"Conectar a la plataforma
   empresarial"**
4. Se toca **"Confirmar"**
5. Se pega el código de verificación

Nunca confirmamos si ese mensaje llegó al celular. Estuvimos intentando
escanear el QR con la cámara desde otra parte de la app.

### 3. Falta un diagnóstico que no habíamos corrido: `is_on_biz_app`

Meta documenta este campo justo para verificar el estado de coexistencia.
Si `is_on_biz_app` sale **false**, el problema no es el que creíamos —
significaría que Meta ni siquiera reconoce el número como activo en la app
de WhatsApp Business, que es un diagnóstico distinto (y con otra solución).

Consulta a correr en el Explorador de la API Graph:

```
GET /206272094692390?fields=is_on_biz_app,platform_type,status,code_verification_status
```

**Resultado (9 ago 2026):**

```json
{
  "is_on_biz_app": true,
  "platform_type": "ON_PREMISE",
  "status": "DISCONNECTED",
  "code_verification_status": "NOT_VERIFIED",
  "id": "206272094692390"
}
```

Esto **afina el diagnóstico y lo mejora**. La documentación oficial dice que
la coexistencia funciona cuando `is_on_biz_app` es `true` **y**
`platform_type` es `CLOUD_API`.

- `is_on_biz_app: true` ✅ — Meta sí reconoce el número como activo en la app
  de WhatsApp Business. No hay problema de elegibilidad, antigüedad ni
  actividad (que era la causa #1 en todas las guías de troubleshooting).
- `platform_type: ON_PREMISE` ❌ — este es el único valor incorrecto.

O sea: el bloqueo es **un solo campo mal en la base de datos de Meta**, no un
problema de configuración de nuestro lado. Nada que podamos cambiar por API
(ya se probó `register` y `deregister`, ambos rechazados).

## Dónde abrirlo (en este orden)

1. **Desde la app, en el celular** — el canal más directo para problemas del número:
   WhatsApp Business → Ajustes ⚙️ → Ayuda → Contáctanos.
   Ahí describe el problema y adjunta captura del estado "Sin conexión".

2. **Direct Support de Meta** — https://business.facebook.com/direct-support/
   Si pide elegir cuenta, selecciona el portafolio **Denog mx**.
   Tipo de pregunta sugerido: *"WABiz: Onboarding"*.
   Meta responde normalmente en 24 h hábiles.

3. **Reporte de error de desarrollador** — https://developers.facebook.com/support/bugs/
   Último recurso si los dos anteriores no dan acceso.

## Datos que va a pedir (tenlos a la mano)

| Dato | Valor |
|---|---|
| Número | +52 1 662 548 6432 |
| Phone Number ID | 206272094692390 |
| WABA ID | 2988570078091964 |
| Portafolio comercial | Denog mx |
| App de Meta | Denog Web (1072956465162756) |

## Texto del ticket — español

> Nuestro número de WhatsApp Business (+52 1 662 548 6432, Phone Number ID
> 206272094692390, WABA ID 2988570078091964, portafolio "Denog mx") está atorado
> en un estado inconsistente y no podemos conectarlo ni verificarlo.
>
> Al consultar el número en la API Graph obtenemos:
>
> - status: DISCONNECTED
> - platform_type: ON_PREMISE
> - code_verification_status: NOT_VERIFIED
>
> El número está en uso normal y activo en la app de WhatsApp Business en el
> celular. Nunca usamos la API On-Premises, así que ese platform_type es
> incorrecto.
>
> Hemos intentado lo siguiente, sin éxito:
>
> 1. En Configuración del negocio → Cuentas de WhatsApp → Agregar → "Vincular una
>    cuenta de WhatsApp Business": el diálogo dice que envió un código de
>    verificación a la app, pero el código nunca llega (revisamos chats, chats
>    archivados y SMS; la app está actualizada).
> 2. POST /206272094692390/register devuelve el error
>    "Register endpoint is not available for SMB businesses."
> 3. Verificamos que no sea el límite de dispositivos vinculados: solo hay 2 de
>    los 4 espacios ocupados.
>
> Solicitamos que liberen o limpien el registro On-Premises antiguo de este
> número, para poder completar el onboarding por coexistencia (Cloud API + app de
> WhatsApp Business en el mismo número) con un proveedor oficial.
>
> Gracias.

## Texto del ticket — inglés (para Direct Support / bug report)

> Our WhatsApp Business phone number (+52 1 662 548 6432, Phone Number ID
> 206272094692390, WABA ID 2988570078091964, business portfolio "Denog mx") is
> stuck in an inconsistent state and we are unable to verify or connect it.
>
> Querying the phone number via the Graph API returns:
>
> - status: DISCONNECTED
> - platform_type: ON_PREMISE
> - code_verification_status: NOT_VERIFIED
>
> The number is actively in use on the WhatsApp Business app on a phone. We have
> never used the On-Premises API, so this platform_type is incorrect.
>
> We have tried the following, without success:
>
> 1. Business Settings → WhatsApp Accounts → Add → "Link a WhatsApp Business
>    account": the dialog states a verification code was sent to the WhatsApp
>    Business app, but the code never arrives (we checked chats, archived chats
>    and SMS; the app is on the latest version).
> 2. POST /206272094692390/register returns the error
>    "Register endpoint is not available for SMB businesses."
> 3. We ruled out the linked-device limit: only 2 of the 4 slots are in use.
>
> We are requesting that the stale On-Premises registration for this number be
> cleared, so we can complete Coexistence onboarding (Cloud API alongside the
> WhatsApp Business app on the same number) through an official provider.
>
> Thank you.
