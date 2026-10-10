# Plan de trabajo — Plantillas de WhatsApp para Denog USA Compras

**Para:** revisión y apoyo de Gemini
**De:** Lalo (Eduardo Carranza), dueño de Denog USA Compras
**Fecha:** 7 de septiembre de 2026

---

## 1. Contexto del negocio

Denog USA Compras es un negocio de compras por encargo en Hermosillo, Sonora,
México. Compra productos en tiendas de Estados Unidos (Amazon, Walmart, Target,
Costco, TJ Maxx, Ross, Marshalls) y los entrega a sus clientes en México cada
~15 días.

Los clientes **piden por WhatsApp**. Ese es el canal principal del negocio: el
cliente manda la foto o el enlace del producto, se le cotiza, abona, y cuando
llega la entrega recoge en el mostrador o pide envío a domicilio.

Ya existe una plataforma propia (denog.mx, Next.js + Supabase) que maneja
pedidos, entregas, punto de venta, caja y estados de cuenta. **Ya recibe**
mensajes de WhatsApp por webhook de la API de Meta (Cloud API). Lo que **no
tiene todavía es envío saliente**.

---

## 2. Qué se quiere lograr

Mandar automáticamente al cliente, por WhatsApp:

1. **El ticket de compra** — una imagen PNG con el folio de la transacción, lo
   que recogió, lo que se llevó de la tienda, cómo pagó y el saldo que le queda.
2. **El estado de cuenta** — una imagen PNG con el detalle de sus entregas,
   abonos y saldo.
3. **El aviso de que su pedido ya llegó** y está listo para recoger.

---

## 3. Qué ya está construido (lado técnico)

| Pieza | Estado |
|---|---|
| Recepción de mensajes de WhatsApp (webhook) | **Funcionando** |
| Credenciales de Meta (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`) | **Configuradas** |
| Tabla de transacciones con folio (M-142 mostrador / D-142 domicilio) | **Funcionando** |
| Generación del ticket como imagen PNG en el servidor | **Funcionando** — endpoint `/api/tickets/imagen?transaccion_id=...` |
| Generación del estado de cuenta como imagen PNG | **Funcionando** — endpoint `/api/estados-cuenta/imagen` |
| **Envío saliente de mensajes de WhatsApp** | **NO existe — hay que construirlo** |
| Plantillas aprobadas por Meta | **NO existen — es el trámite de este plan** |

Lo que falta técnicamente son tres llamadas a la API de Meta:

1. Subir la imagen → `POST /{phone-number-id}/media` → devuelve un `media_id`
2. Mandar el mensaje con ese `media_id`
3. Guardar el resultado (entregado / fallido) para poder auditar

Es trabajo acotado. **El cuello de botella no es el código, es la aprobación de
Meta**, que puede tardar y por eso conviene empezarla ya.

---

## 4. Las reglas de Meta que aplican (verificadas en su documentación oficial)

### 4.1 La ventana de 24 horas — el dato que cambia la estrategia

- La ventana de atención al cliente dura **24 horas** y se abre **cuando el
  cliente te escribe o te llama**. Si vuelve a escribir antes de que expire, se
  reinicia a 24 horas.
- **Dentro de la ventana** puedes mandar **cualquier tipo de mensaje sin
  plantilla y sin aprobación previa**, incluidas **imágenes libres**.
- **Fuera de la ventana**, solo puedes mandar **plantillas pre-aprobadas**.
- En todos los casos, el cliente debe haber dado **opt-in** para recibir
  mensajes del negocio.

**Por qué esto importa tanto para Denog:** como los clientes piden por WhatsApp,
en la mayoría de los casos **la ventana ya está abierta** cuando recogen su
pedido. Para esos casos **el ticket se puede mandar hoy mismo, como imagen
libre, sin esperar ninguna aprobación de Meta.**

Las plantillas hacen falta solo para los casos fuera de ventana: el cliente que
recogió sin haber escrito ese día, o al que se le manda el estado de cuenta días
después.

### 4.2 Categorías de plantilla

Meta tiene tres: **Utility**, **Marketing** y **Authentication**.

Para calificar como **Utility** (que es lo que se busca — es más barata y más
fácil de aprobar) la plantilla debe cumplir **las dos** condiciones:

1. Ser **no promocional**: sin ninguna intención de promover o persuadir.
2. Ser **específica de la transacción, pedido, cuenta o servicio del usuario**, o
   esencial para él.

Reglas específicas de Meta para mensajes de pedidos:

> "Estos mensajes no deben promover, recomendar, hacer upsell o cross-sell de
> productos; incluir ofertas; ni intentar conseguir renovaciones."

**Advertencia crítica:** si una plantilla mezcla contenido —por ejemplo, una
actualización de pedido **con una promoción**— Meta la recategoriza como
**Marketing**. Una sola frase de más ("¡y aprovecha nuestras ofertas!") tumba la
categoría.

### 4.3 Rechazos y apelaciones

- Un rechazo de **Utility** se puede **apelar dentro de 60 días**.
- Un rechazo de **Marketing** o **Authentication** **no se puede apelar**: hay
  que crear una plantilla nueva.

Por eso conviene mandar las plantillas bien redactadas desde la primera vez.

---

## 5. Las tres plantillas propuestas

Redactadas para calificar como **Utility**. Todas llevan encabezado de tipo
**IMAGEN**, porque el contenido principal es el PNG del ticket o del estado de
cuenta.

### Plantilla 1 — `ticket_de_compra`

- **Categoría:** Utility
- **Idioma:** Español (México) — `es_MX`
- **Encabezado:** IMAGEN (se manda el PNG del ticket)
- **Cuerpo:**

```
Hola {{1}}, aquí está tu ticket de compra.

Folio: {{2}}
Fecha: {{3}}
Total pagado: ${{4}}

Guarda este ticket para cualquier aclaración sobre tu pedido.
```

- **Pie:** `Denog USA Compras`
- **Variables de ejemplo:** {{1}} Ibeth Higuera · {{2}} M-142 · {{3}} 7 de
  septiembre de 2026 · {{4}} 500.00

### Plantilla 2 — `estado_de_cuenta`

- **Categoría:** Utility
- **Idioma:** `es_MX`
- **Encabezado:** IMAGEN (el PNG del estado de cuenta)
- **Cuerpo:**

```
Hola {{1}}, este es el estado de cuenta de tus pedidos.

Saldo pendiente: ${{2}}
Próxima entrega: {{3}}

En la imagen viene el detalle de cada artículo y de tus abonos.
```

- **Pie:** `Denog USA Compras`
- **Variables de ejemplo:** {{1}} Ibeth Higuera · {{2}} 320.00 · {{3}} 20 de
  septiembre de 2026

### Plantilla 3 — `pedido_listo`

Esta es la más estratégica: es la que **abre la conversación**. Cuando el
cliente contesta, se abren 24 horas en las que todo lo demás se puede mandar
libre, sin plantilla.

- **Categoría:** Utility
- **Idioma:** `es_MX`
- **Encabezado:** TEXTO — `Tu pedido ya llegó`
- **Cuerpo:**

```
Hola {{1}}, tu pedido de la entrega del {{2}} ya está en tienda.

Artículos: {{3}}
Saldo por pagar: ${{4}}

Puedes pasar a recogerlo o responder a este mensaje para coordinar tu envío a domicilio.
```

- **Pie:** `Denog USA Compras`
- **Variables de ejemplo:** {{1}} Ibeth Higuera · {{2}} 20 de septiembre de 2026
  · {{3}} 4 · {{4}} 320.00

---

## 6. Riesgos de rechazo y cómo evitarlos

| Riesgo | Cómo se evita |
|---|---|
| Que Meta la recategorice como Marketing | Cero lenguaje promocional. Nada de "aprovecha", "oferta", "descuento", "no te lo pierdas", "síguenos". Solo el dato de la transacción. |
| La imagen de ejemplo trae logo y redes sociales | El pie del ticket incluye los iconos de Facebook, Instagram y TikTok y la dirección denog.mx. Es marca, no promoción, y normalmente pasa. **Pero si rechazan por esto**, la salida es generar una versión del PNG sin la fila de redes para el envío por WhatsApp. Vale la pena tenerlo previsto. |
| Variables mal ejemplificadas | Meta rechaza si los ejemplos de las variables no son realistas. Usar nombres, folios y montos que se vean como los reales. |
| Falta de opt-in | Hay que poder demostrar que el cliente aceptó recibir mensajes. Como los clientes escriben primero para pedir, el opt-in existe de hecho, pero conviene dejarlo por escrito en el sitio y en el primer contacto. |
| Nombre de plantilla inválido | Solo minúsculas, números y guiones bajos. Sin espacios, sin acentos. |

---

## 7. Pasos del trámite

1. **Verificar el negocio** en Meta Business Manager, si no está verificado.
   Sin verificación los límites de envío son muy bajos.
2. **Confirmar el opt-in**: dejar por escrito en denog.mx y en el mensaje de
   bienvenida que al escribir por WhatsApp el cliente acepta recibir avisos
   sobre sus pedidos.
3. **Crear las tres plantillas** en Meta Business Manager →
   WhatsApp Manager → Plantillas de mensajes. Categoría **Utility** en las tres.
4. **Subir una imagen de ejemplo** para el encabezado de las plantillas 1 y 2.
   Debe ser un ticket y un estado de cuenta reales (con datos de ejemplo).
5. **Enviar a revisión.** La revisión suele tardar de minutos a 24-48 horas.
6. **Si rechazan una Utility**, apelar dentro de los 60 días explicando que el
   mensaje es un comprobante de una transacción que el cliente ya realizó.
7. **Una vez aprobadas**, entregar los nombres exactos de las plantillas y sus
   variables al equipo técnico para conectarlas.

---

## 8. Qué se le pide a Gemini

1. **Revisar la redacción** de las tres plantillas y decir si alguna frase puede
   leerse como promocional o persuasiva a ojos de un revisor de Meta.
2. **Proponer una redacción alternativa** de cada una, por si la primera es
   rechazada, sin cambiar el sentido.
3. **Revisar si falta alguna plantilla** que este negocio vaya a necesitar
   (por ejemplo: aviso de que un producto no llegó, o confirmación de que se
   recibió un abono).
4. **Confirmar los requisitos vigentes** de verificación de negocio y de opt-in
   para una cuenta de WhatsApp Business API en México, y si hay algún requisito
   adicional para el giro de compras por encargo / importación.
5. **Redactar el texto del opt-in** para poner en denog.mx y en el mensaje de
   bienvenida de WhatsApp.

---

## 9. Nota honesta sobre el orden de trabajo

La ventana de 24 horas cambia las prioridades. Como los clientes de Denog
escriben por WhatsApp para pedir, **la mayoría de los tickets caen dentro de la
ventana** y se pueden mandar como imagen libre, sin plantilla y sin esperar a
Meta.

Por eso el orden más rentable es:

1. **Primero** construir el envío saliente (subir imagen + mandar mensaje) y
   usarlo dentro de la ventana. Eso ya da valor desde el día uno.
2. **En paralelo**, meter las plantillas a aprobación.
3. **Cuando aprueben**, agregar la lógica que decide sola: si la ventana está
   abierta manda imagen libre; si está cerrada, manda la plantilla.

Así el negocio no se queda esperando un trámite para empezar a usar lo que ya
está construido.

---

## Fuentes

- [Template categorization — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
- [Service messages — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)
