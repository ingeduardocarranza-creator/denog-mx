# Plan Integral Denog — los 3 módulos completos

> Documento maestro. Sustituye la recomendación de `PLAN_IA_SUPERVISOR.md`,
> que queda como el **detalle técnico** de la parte de WhatsApp (Olas 2 y 4).
> Agosto 2026.

---

## 1. Primero: qué de esto ya está construido

Revisé el repo función por función contra tus 11 ideas. El resultado cambia todo el plan:

| # | Idea | Fuente de datos que necesita | Ya existe en tu sistema |
|---|---|---|---|
| **MÓDULO 1 — Supervisor** | | | |
| 1.1 | Conciliación bancaria | Fotos de WhatsApp | Visión IA (`sugerir-nombre`), tabla `pagos`, patrón de botón Aprobar |
| 1.2 | Radar de Cotizaciones | Fotos de WhatsApp | **Kanban completo** en `/admin/mercadito`, calculadora en `/admin/cotizador` |
| 1.3 | Semáforo de Atención | **Flujo de mensajes** | Nada |
| 1.4 | Resúmenes de chat | **Historial completo** | Nada |
| 1.5 | Demanda oculta | Tabla `cotizaciones` (idea 1.2) | Nada — depende de acumular datos |
| 1.6 | Alertas de resurtido | **`pedidos` + `pagos` que ya tienes** | **Los datos ya están completos** |
| **MÓDULO 2 — Cobranza** | | | |
| 2.1 | Temporizador de apartado | `pedidos_mercadito` + stock | Datos sí; el concepto de vencimiento no existe |
| 2.2 | Botones de cobranza 1 clic | Datos propios | **`waTemplates` ya funciona** en `/admin/mercadito` |
| 2.3 | Ruta de entregas Hermosillo | Datos propios | **`/admin/domicilios` + Google Distance Matrix, radio de 15 km** |
| 2.4 | Regla de tono casual | — | Es una regla de **un prompt**, no un módulo |
| **MÓDULO 3 — Denog Hub** | | | |
| 3.1 | Checklists diarios | Datos propios | Nada |
| 3.2 | Anillos de productividad | Deriva de 3.1 | Nada |
| 3.3 | Métricas de administrador | `pedidos` + `pagos` | **`/admin/colaboradores` ya es un ranking** por hoy/quincena/mes con venta, utilidad y margen por vendedor |

### El hallazgo

**De 11 funciones, solo 3 dependen de conectar WhatsApp** (1.3 Semáforo, 1.4 Resúmenes y los "tiempos de respuesta" de 3.3).

Otras 2 (comprobantes y cotizaciones) funcionan **pegando la imagen** — no necesitan conexión.

Y **6 corren sobre datos que ya están en tu Supabase hoy.** Esas se pueden construir esta semana, sin pagar nada, sin tocar tu WhatsApp.

Tu instinto de que "es un plan integral" es correcto. Mi error del mensaje anterior fue tratar la tubería de WhatsApp como el cimiento. **No lo es. Es una de cuatro obras, y no la primera.**

---

## 2. Cómo funciona tu venta de verdad (esto rehizo el plan)

El flujo real es:

```
1. Tú publicas fotos en el grupo          (grupo = solo lectura, nadie escribe)
2. El cliente REENVÍA esa foto a tu 1 a 1
3. En el 1 a 1 se cierra TODO: precio, apartado, transferencia, entrega
```

Tres consecuencias que cambian el plan:

### 2.1 El riesgo de "perder los grupos" prácticamente desaparece

Yo lo marqué como el peligro principal. Estaba mal calibrado, por dos razones:

- **El grupo es solo un tablón de anuncios.** No hay conversación que automatizar ahí. Que la API no soporte grupos no te quita nada, porque no necesitas que la API lea el grupo.
- **La "coexistencia" ya es global** (desde finales de 2025, México incluido). Tu número sigue en la app del celular — publicas al grupo igual que hoy — y en paralelo la API lee los 1 a 1. No migras, no pierdes historial, no pierdes número.

**Lo único que sí hay que verificar antes de pagar:** la coexistencia **desactiva las listas de difusión** de la app (las existentes quedan de solo lectura; después difundes desde Manychat). Si hoy dependes de listas de difusión, eso sí es un cambio operativo. Y la integración de coexistencia de Manychat sigue marcada como **beta**.

### 2.2 El costo es bastante menor de lo que te dije

Meta cobra por **plantillas que tú inicias fuera de la ventana de 24 horas**. Las respuestas dentro de una conversación que **el cliente abrió** son gratis.

En tu negocio el cliente **siempre** abre la conversación (te reenvía la foto). O sea: **el flujo de venta completo cae en la ventana gratis.** Lo único que pagarías por mensaje son los recordatorios de cobranza proactivos, a centavos cada uno.

Cálculo corregido: **~$40–55 USD/mes** (Manychat + Make), no $60–120.

### 2.3 Hay DOS tipos de foto, no uno — y los confundí

Este fue mi error de diseño más grande:

| | **Carril A — Foto de TU catálogo** | **Carril B — Foto de afuera** |
|---|---|---|
| Qué es | "Quiero este, el que publicaste" | "¿Me puedes conseguir esto?" |
| Frecuencia | **Probablemente la mayoría** | Menos |
| Qué necesita | Identificar producto → precio → stock → **apartado** | Extraer marca/talla → **cotizar** |
| A dónde va | Pedido / apartado (Módulo 2) | Radar de Cotizaciones (Módulo 1) |

Yo metí todo al "Radar de Cotizaciones". Mal. El Carril A no es una cotización — **es una venta de algo que ya tienes en stock**, y es exactamente donde se conecta el Temporizador de Apartado del Módulo 2.

### 2.4 La idea que más te va a servir: huella de imagen

Cuando el cliente reenvía una foto del catálogo, **es literalmente tu propia foto**. No hace falta preguntarle a la IA "¿qué producto es este?" — basta comparar una **huella digital de la imagen** contra las fotos de tu catálogo.

```
Foto entrante → huella → ¿coincide con productos_tienda?
   SÍ  → sabes el producto exacto, precio y stock.  $0, instantáneo, sin equivocarse.
   NO  → ahí sí entra la IA: ¿es comprobante? ¿es encargo nuevo?
```

Por qué importa: la mayoría de tus mensajes se resuelven **sin gastar un centavo de IA y sin posibilidad de que se equivoque**. La IA queda solo para lo que de verdad la necesita.

- **Requisito operativo pequeño:** las fotos que publicas al grupo deben ser **las mismas que están en `productos_tienda`** (subirlas al catálogo y de ahí publicarlas). Hoy ya tienes `imagen_url` y `galeria` en esa tabla.
- **Hay que probarlo antes de apostarle:** WhatsApp recomprime las imágenes al reenviarlas. La técnica aguanta bien la recompresión, pero **es una prueba de medio día con 20 fotos reenviadas reales**, y hasta no verla no se da por hecha. Si no funciona, el respaldo es la IA describiendo y cruzando contra el catálogo.

### 2.5 Semáforo y Resúmenes valen más de lo que pensé

Si **el 100%** de tus 1 a 1 son ventas en curso, entonces:

- un mensaje sin responder no es ruido, **es una venta en riesgo** — el Semáforo deja de ser un adorno;
- y como toda la venta (producto, precio, pago, entrega) se negocia en **un solo hilo**, el Resumen de chat *es* el expediente del pedido. Por eso te estorba tanto leer el historial completo.

**Conclusión:** la Ola 4 baja de riesgo, baja de precio y sube de valor. Sigue sin ir primero — pero ya no es "el lujo del final".

---

## 3. Los 3 motores (esto es lo que hace que sea "integral")

Aquí está la parte que se pierde cuando planeas módulo por módulo. Si construyes tus 11 ideas por separado, vas a escribir **la misma lógica cinco veces**. Mira:

- Semáforo de atención = *condición sobre datos → tarjeta de alerta*
- Temporizador de apartado = *condición sobre datos → tarjeta de alerta*
- Resurtido = *condición sobre datos → tarjeta de alerta*
- Cotización estancada = *condición sobre datos → tarjeta de alerta*
- Transferencia sin revisar = *condición sobre datos → tarjeta de alerta*

Son **la misma cosa cinco veces**. Igual pasa con los textos: cobranza, resurtido, confirmación de pago y cotización enviada son todos *"genera un texto casual y editable → botón wa.me"*.

Entonces se construyen **tres motores, una sola vez**:

### Motor A — Alertas
```
db:   tabla `alertas` (tipo, cliente_id, referencia_id, severidad,
                        titulo, detalle, estado, vence_en, creado_en)
lib:  lib/alertas/reglas.js   ← una función por regla, fáciles de agregar
cron: /api/cron/alertas       ← corre cada 15 min, evalúa todas las reglas
ui:   /admin/alertas          ← "Centro de Alertas", una sola pantalla
      + badge en el menú lateral (igual que ya hace Mercadito)
```
Agregar una alerta nueva en el futuro = **escribir una función**, no una pantalla.

### Motor B — Redacción IA
```
lib/ia/redactar.js       ← un solo prompt con TU tono
app/components/BotonWhatsApp.jsx  ← genera, deja editar, abre wa.me
```
Tu regla ("sencillo, casual, editable, nada de insignias técnicas, solo *Compra Segura*") vive **en un archivo**. Si mañana quieres cambiar el tono, lo cambias en un lugar y cambia en todo el sistema. Si está regada en 6 pantallas, nunca vuelve a ser consistente.

### Motor C — Visión IA
```
lib/ia/analizarImagen.js  ← un prompt, tres usos:
                             comprobante / producto a cotizar / alta de catálogo
```
El tercer uso **ya lo tienes** (`app/api/pedidos/sugerir-nombre`). Se absorbe aquí.

> Estos tres motores son ~3 días de trabajo y son la diferencia entre un sistema que crece fácil y uno que se vuelve inmanejable en seis meses.

---

## 4. Las cuatro olas

Ordenadas por **retorno ÷ costo**, no por el orden en que se te ocurrieron.

---

### 🌊 OLA 1 — El dinero que ya está en tu base de datos
**~1.5 semanas · $0/mes en apps nuevas · cero riesgo a tu operación**

| Entrega | Qué resuelve |
|---|---|
| Motor A (Alertas) + Centro de Alertas | Cimiento de todo lo demás |
| Motor B (Redacción IA) + `<BotonWhatsApp>` | Cimiento de toda la comunicación |
| **Temporizador de liberación de inventario** (2.1) | Stock apartado sin pagar = capital muerto en tu bodega |
| **Alertas de resurtido** (1.6) | Ventas que ya podías hacer y no estás haciendo |
| **Botones de cobranza de 1 clic** (2.2) | Dinero que ya te deben |
| Integración con ruta de Hermosillo (2.3) | Reusa `/admin/domicilios` que ya existe |

**Por qué va primero:** las tres funciones de negocio de esta ola **recuperan dinero y stock que hoy estás perdiendo**, no ahorran tiempo. Y no requieren ni una app nueva ni un solo mensaje de WhatsApp.

**Cambio en la base de datos:** una tabla (`alertas`) y dos campos (`apartado_vence_en`, `apartado_notificado_en`).

**Verificación:** después de una semana, cuenta cuántos apartados vencidos liberó y cuántos clientes de resurtido contactaste. Si son cero, la regla está mal calibrada — ajústala antes de seguir.

---

### 🌊 OLA 2 — "Compartir a Denog" + bandeja de dos carriles
**~1.5 semanas · ~$5–10 USD/mes (solo IA) · cero riesgo**

> **Corrección importante:** el equipo contesta **desde el celular**, no desde WhatsApp Web.
> La bandeja de pegar con Ctrl+V no sirve. Pero **ya tienes la solución construida**:
> la app de Expo en `mobile/` con su sección `(staff)` completa (POS, encargos,
> mercadito, equipo, clientes), builds de EAS y `bundleIdentifier` publicado.

**El flujo real, en el celular:**

```
WhatsApp → mantener presionada la foto → Compartir → Denog
       → la app la manda a /api/whatsapp/ingesta
       → huella de imagen o IA
       → cae en el carril que le toca
```

**Un toque más de lo que ya haces.** Sin computadora, sin cambiar de app, sin pagar conexión.

| Entrega | Qué resuelve |
|---|---|
| **Share extension** en la app (`expo-share-intent`) | La captura desde el celular |
| **Huella de imagen** sobre `productos_tienda` | Identifica la foto reenviada sin IA, sin error, gratis |
| Motor C (Visión IA) — solo para lo que no hace match | Cimiento |
| **Carril A → apartado** (foto del catálogo) | La venta de stock que ya tienes |
| **Panel de Transferencias** (1.1) | Tu dolor #1 |
| **Carril B → Radar de Cotizaciones** (1.2) | Los encargos específicos |

**Detalles técnicos de la share extension:**
- `expo-share-intent` v5.x soporta Expo SDK 54 (tú tienes 54.0.36) y `expo-linking` ya está instalado.
- Configurar para aceptar **varias imágenes de una vez** — los clientes mandan tandas.
- **La fricción real:** cada cambio requiere un build de EAS y redistribuir. En Android es rápido; en iOS pasa por TestFlight/App Store. No es bloqueante, pero deja de ser "cambio instantáneo" como en la web. Vale la pena dejar la lógica pesada en las rutas `/api/` (que sí se despliegan al instante) y que la app solo mande la foto.

**Empieza por la prueba de huella de imagen — medio día.** Toma 20 fotos que clientes te hayan reenviado y mídelas contra tu catálogo. Si aciertan, el resto de la ola se simplifica muchísimo y baja el costo de IA. Si no, se sigue con IA y no se pierde nada más que esa media tarde.

**Por qué va aquí y no antes:** usa el Motor A (una transferencia sin revisar en 4 h genera alerta), el Motor B (la confirmación al cliente) y el temporizador de apartado de la Ola 1 (el Carril A desemboca ahí). Construida antes, la harías dos veces.

**Y lo más importante:** esta ola **arranca el reloj de tus datos**. La Demanda Oculta (1.5) necesita 2–3 meses de cotizaciones acumuladas para servir de algo. Cada semana que no capturas es una semana que retrasas esa inteligencia. Por eso capturar temprano vale aunque sea a mano.

**Verificación:** 20 comprobantes reales cuadrados contra tu estado de cuenta bancario, y 20 fotos reenviadas que caigan en el carril correcto. Si el monto falla más del 5%, el panel genera más trabajo del que ahorra.

> ⏱ **Arranca el trámite con Meta/Manychat DURANTE la Ola 1.** Verificación de negocio y onboarding son días de espera, no días de trabajo. Si lo mandas al inicio, para cuando termines la Ola 2 ya está listo y la Ola 4 se vuelve un cambio de 2–3 días. Trámite en paralelo, código en serie.

---

### 🌊 OLA 3 — Denog Hub
**~1 semana · $0/mes · independiente de todo lo anterior**

| Entrega | Qué resuelve |
|---|---|
| Tabla `tareas_colaborador` + plantillas de checklist diario | 3.1 |
| Anillos de productividad | 3.2 |
| **Enchufar metas a `/admin/colaboradores`** (que ya existe) | 3.3 — no se construye de cero |

**Por qué puede moverse de lugar:** esta ola no comparte nada con las demás. Si tu cuello de botella real es que el equipo no ejecuta, **súbela a primer lugar**. Si el problema es que tú estás saturado leyendo WhatsApp, déjala aquí. Tú sabes cuál de los dos es.

Nota: los "tiempos de respuesta" de 3.3 quedan pendientes hasta la Ola 4 — el resto de las métricas ya las calcula tu pantalla actual.

---

### 🌊 OLA 4 — Automatización de WhatsApp (la única que cuesta)
**~2–3 días de código si el trámite ya está hecho · ~$40–55 USD/mes · riesgo bajo**

| Entrega | Qué resuelve |
|---|---|
| Manychat (coexistencia) + Make → `/api/whatsapp/ingesta` | Ya no se pega nada, entra solo |
| **Semáforo de Atención** (1.3) | Solo posible aquí — y aquí cada alerta es una venta en riesgo |
| **Resúmenes de chat** (1.4) | Solo posible aquí — el resumen *es* el expediente del pedido |
| Tiempos de respuesta por colaborador (3.3) | Cierra las métricas del Hub |
| Confirmación automática al cliente al aprobar | Cierra el círculo de 1.1 |

**Por qué el código es tan corto:** la bandeja, los dos carriles, la huella de imagen, los prompts y los paneles ya existen desde la Ola 2. Lo único que cambia es **de dónde entra la imagen**: en vez de un Ctrl+V, un webhook. Nada más.

**Lo que sí hay que revisar antes de pagar (2 preguntas, no técnicas):**
1. ¿Usas listas de difusión hoy? La coexistencia las deja en solo lectura (después difundes desde Manychat).
2. ¿Tu número pasa el onboarding de coexistencia de Manychat? Sigue marcado como beta y la elegibilidad Meta la confirma número por número.

Si ambas salen bien, esta ola dejó de ser la apuesta cara que parecía.

> El detalle técnico completo de esta ola (esquema `wa_contactos`/`wa_mensajes`, idempotencia, cola con cron, Supabase Storage) está en `PLAN_IA_SUPERVISOR.md`. Sigue siendo válido.

---

### 🌊 OLA 5 — Inteligencia de negocio
**Automática, si hiciste la Ola 2 a tiempo**

**Demanda oculta** (1.5): consultas SQL sobre `cotizaciones` — qué producto pidieron 8 personas distintas y no tienes en catálogo. No se "construye", **se cosecha**. Solo necesita que la Ola 2 lleve 2–3 meses corriendo.

---

## 5. Resumen de tiempo y dinero

**Orden definitivo**, según tus respuestas (dolor = saturación leyendo WhatsApp · 20–60 msj/día · equipo en celular):

```
SEM 1  ██████   Los 3 motores + prueba de huella      $0
SEM 2  ██████   Compartir a Denog + Transferencias    $5-10/mes   ← aquí baja tu carga
SEM 3  ██████   Radar + apartados + resurtido + cobranza
SEM 4  ████     Denog Hub                             $0
─────────────────────────────────────────────────────
       ~4 semanas · 8 de tus 11 funciones · ~$10/mes
─────────────────────────────────────────────────────
OLA 4  █        Manychat: OPCIONAL, ya no urgente     +$40-55/mes
```

**La Ola 4 dejó de ser necesaria a corto plazo.** Con 20–60 mensajes al día y "Compartir a Denog" tomando ~3 segundos por foto, son **1 a 3 minutos de toques al día**. Eso no justifica $50 USD mensuales todavía. Manychat vuelve a la mesa cuando quieras el **Semáforo** y los **Resúmenes de chat**, que siguen siendo lo único que no se puede hacer sin él — o cuando el volumen crezca lo suficiente para que esos 3 minutos se vuelvan 20.

**Costo estable: ~$10 USD/mes.** Si después sumas Manychat, ~$50–65.

**Aplicaciones necesarias:**

- **Olas 1–3:** las que ya tienes (Vercel, Supabase, dominio) + una cuenta de API de Anthropic con saldo. Metes $20 USD y te duran meses.
- **Ola 4:** Manychat (plan + add-on de WhatsApp, con coexistencia), cuenta de WhatsApp Business en Meta, Make.com Core.

---

## 6. Lo que yo NO haría

- **No** construir las 11 funciones como 11 pantallas separadas. Tres motores primero, o dentro de seis meses cada cambio de tono te va a costar tocar seis archivos.
- **No** empezar por WhatsApp. Es lo más visible y lo más caro; no es lo más rentable.
- **No** dejar que la IA apruebe pagos ni mande mensajes sin que un humano apriete el botón.
- **No** construir la Demanda Oculta ahora. Sin datos no muestra nada y vas a concluir que no sirve.
- **No** hacer las Olas 1, 2 y 3 en paralelo estando solo. Una terminada en producción vale más que tres a medias.
- **No** borrar nada: cotizaciones descartadas, apartados vencidos, alertas atendidas. Ese histórico es exactamente de donde sale la Ola 5.

---

## 7. Lo único que necesito que decidas

**¿Qué te duele más hoy?**

- **"Se me pierde dinero y stock"** → Ola 1 tal cual está.
- **"Estoy saturado leyendo WhatsApp"** → adelanta la Ola 2, pero construye el Motor A y B de todos modos primero (3 días).
- **"Mi equipo no ejecuta"** → sube la Ola 3 al primer lugar.

Las tres respuestas usan los mismos motores. Solo cambia el orden.

---

## Siguiente paso

Cuando elijas, lo primero a escribir es la migración de la Ola 1: tabla `alertas` + los dos campos de apartado. Es una migración corta y es el cimiento de las tres olas siguientes.
