# Plan de implementación — IA como Supervisor Silencioso (Denog)

> ⚠️ **Este documento ya no es el plan maestro.** Es el **detalle técnico** de la
> parte de WhatsApp (Olas 2 y 4). El plan general de los tres módulos está en
> **`PLAN_INTEGRAL.md`** — léelo primero.
>
> Documento de planeación. No hay código en producción todavía.
> Objetivo de esta primera etapa: **Radar de Cotizaciones** y **Aprobación de Transferencias**.
> Fecha: agosto 2026.

---

## 0. Punto de partida (lo que ya tienes)

Revisé el repo antes de proponer nada. Esto importa porque el plan **no arranca de cero**, se enchufa a lo que ya funciona:

| Pieza existente | Dónde | Por qué importa aquí |
|---|---|---|
| Next.js 16 (App Router, JS) + Supabase | `app/`, `lib/supabase.js` | El stack ya está definido, no hay que decidir nada |
| Auth por JWT en cookie + `requerirStaff` / `requerirAdmin` | `lib/auth/session.js` | Los paneles nuevos se protegen igual que los actuales |
| Cliente Supabase con `SERVICE_ROLE_KEY` dentro de cada route | `app/api/**/route.js` | Patrón ya establecido: las API routes escriben, el navegador no |
| Tabla `clientes` (nombre, teléfono, celular_contacto, rol, límite de crédito) | — | **Es tu identidad única de cliente. No se duplica.** |
| Tabla `pagos` (cliente_id, entrega_id, pedido_mercadito_id, monto, método, tipo, vendedor_id) | — | Aquí vive el dinero real y de aquí salen los estados de cuenta |
| Tabla `pedidos` (Encargos) con `precio_venta`, `costo_mxn`, `estado` | — | Destino natural de una cotización aceptada |
| Patrón de estados + `historial` jsonb + botones `wa.me` con plantillas | `app/admin/mercadito/page.js` | **Ya inventaste el patrón de UI que necesita el Radar.** Se replica, no se reinventa |
| Visión con Claude Haiku sobre una foto de producto | `app/api/pedidos/sugerir-nombre/route.js` | Ya tienes el patrón de prompt→JSON funcionando y `@anthropic-ai/sdk` instalado |
| Migraciones SQL manuales, en español, con `$$...$$` | `db/migrations/` | El formato del nuevo SQL debe ser idéntico |

**Conclusión honesta:** el 60% de lo que pides ya existe en forma de patrón dentro de tu propio código. Lo verdaderamente nuevo es *la tubería de entrada desde WhatsApp* y *la capa de interpretación con IA*. Ahí es donde hay que pensar bien.

---

## 1. Las seis decisiones de arquitectura (y mi razonamiento)

### Decisión 1 — Guardar el mensaje crudo SIEMPRE, separado de la interpretación de la IA

Dos capas, no una:

- **Capa cruda (`wa_mensajes`)**: lo que llegó, tal cual, sin interpretar. Inmutable.
- **Capa de dominio (`transferencias`, `cotizaciones`)**: lo que la IA *cree* que significa.

**Por qué:** tu prompt va a estar malo las primeras semanas. Es inevitable. Si guardas solo la interpretación, cada mejora del prompt empieza desde cero y pierdes los casos reales que la IA falló. Con la capa cruda puedes **reprocesar el histórico** cada vez que mejoras el prompt y medir si mejoró o empeoró. También es tu defensa cuando un cliente reclame "yo sí mandé el comprobante".

Costo: una tabla extra y unos MB. Beneficio: poder iterar sin volar a ciegas. No hay discusión.

### Decisión 2 — La IA corre en tu Next.js, no en Make.com

Make.com hace **una sola cosa**: reenviar el payload crudo de Manychat a `POST /api/whatsapp/ingesta`. Nada más. Ni condiciones, ni parseo, ni llamadas a IA.

**Por qué:**

- La regla "descartar cristal templado" es **lógica de negocio**. En Make vive en una caja gráfica que nadie versiona, nadie revisa y nadie puede probar. En tu repo vive en un archivo, con git, y la puedes cambiar en 30 segundos.
- Ya tienes `@anthropic-ai/sdk` y un prompt de visión funcionando. Reusar es más barato que aprender los módulos de IA de Make.
- Depurar: si algo falla, prefieres un `console.error` en Vercel que un escenario de Make en rojo sin contexto.
- Costo: los escenarios de Make cobran por operación. Un escenario de 1 módulo cuesta 1 operación; uno de 6 módulos cuesta 6. Con volumen de WhatsApp eso se nota.

**Regla de oro:** Make es un cable, no un cerebro.

### Decisión 3 — La IA nunca toca la tabla `pagos`. Propone; el humano aprueba

`transferencias` es una tabla de **antesala**. Cuando presionas "Aprobar", ahí sí se hace el `insert` en `pagos` y se guarda `transferencias.pago_id`.

**Por qué:** `pagos` alimenta estados de cuenta, reportes y saldos de clientes. Una alucinación de la IA ahí no es un bug, es un descuadre contable que descubres tres semanas después. La antesala te da un punto de control humano que además es donde vive tu botón de "Aprobar" — que ya querías.

Además: si `transferencias.pago_id` ya tiene valor, el botón no vuelve a insertar. **Doble clic no cobra dos veces.**

### Decisión 4 — Idempotencia desde el día uno

Cada mensaje trae un ID único de Manychat. Se guarda en `wa_mensajes.manychat_message_id` con constraint `unique`.

**Por qué:** Make reintenta webhooks fallidos. Manychat también. Sin esto, un timeout tuyo de 3 segundos se convierte en tres comprobantes duplicados en la bandeja y un colaborador aprobando el mismo pago dos veces. Es la clase de bug que no aparece en pruebas y sí en producción un sábado.

### Decisión 5 — El endpoint responde rápido; la IA corre después

`/api/whatsapp/ingesta` hace lo mínimo (validar → guardar mensaje → guardar imagen → responder `200`) en menos de 1 segundo. El análisis con IA se dispara aparte.

**Por qué:** Manychat/Make tienen timeout. Una llamada a visión puede tardar 3-8 segundos. Si la metes en el mismo request, con volumen alto vas a perder mensajes.

**Cómo:** `wa_mensajes.estado = 'pendiente'` funciona como cola. Dos disparadores:
1. `after()` de Next 16 — procesa de inmediato en el 95% de los casos.
2. Un **Vercel Cron cada 2 minutos** que barre los `pendiente` con más de 2 minutos de antigüedad. Es la red de seguridad para cuando la IA se cae o Anthropic devuelve 529.

Sin la red de seguridad, un error transitorio = mensaje perdido para siempre.

### Decisión 6 — Imágenes a Supabase Storage, bucket privado

El endpoint descarga la URL temporal de WhatsApp **en el momento** y la sube a un bucket `whatsapp` (privado). Se guarda el `path`, no la URL.

**Por qué:** las URLs de WhatsApp expiran. Un comprobante de transferencia es tu evidencia ante una aclaración con el cliente y tu respaldo fiscal. Privado porque son datos bancarios de terceros: nombre del ordenante, banco, monto. Para mostrarlas en el panel y para mandarlas a la IA se generan **signed URLs de 5 minutos**.

---

## 2. Esquema de base de datos propuesto

Cuatro tablas nuevas. Ninguna modifica las existentes salvo un índice.

```
clientes ──┬── wa_contactos ──── wa_mensajes ──┬── transferencias ──→ pagos
           │   (identidad WA)     (bandeja       │   (antesala $)
           │                       cruda)        │
           │                                     └── cotizaciones ───→ pedidos
           │                                         (radar Kanban)
           └── (ya existente: pedidos, pagos, mercadito...)
```

### `wa_contactos` — puente entre WhatsApp y tu tabla `clientes`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `manychat_id` | text **unique** | el `subscriber_id` de Manychat |
| `telefono` | text | normalizado a 10 dígitos, como en `clientes` |
| `nombre_wa` | text | nombre del perfil de WhatsApp |
| `cliente_id` | uuid → `clientes(id)` | **nullable**: se llena al identificarlo |
| `ultimo_entrante_en` | timestamptz | para el Semáforo de Atención |
| `ultimo_saliente_en` | timestamptz | idem |
| `creado_en` | timestamptz | |

**Por qué tabla aparte y no columnas en `clientes`:** mucha gente te escribe sin ser cliente registrado todavía. Si metes eso en `clientes` ensucias tu padrón, tus reportes y tu score. `wa_contactos` es la sala de espera; el `cliente_id` se llena por match de teléfono automático o a mano desde el panel.

El **Semáforo de Atención** sale gratis de estas dos fechas: `ultimo_entrante_en > ultimo_saliente_en` y han pasado N horas → alerta. No requiere tabla nueva.

### `wa_mensajes` — bandeja cruda (la fuente de verdad)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `contacto_id` | uuid → `wa_contactos` | |
| `manychat_message_id` | text **unique** | idempotencia |
| `direccion` | text | `entrante` / `saliente` |
| `tipo` | text | `texto` / `imagen` / `otro` |
| `texto` | text | |
| `imagen_url_original` | text | URL temporal, solo para auditoría |
| `imagen_path` | text | ruta en Supabase Storage |
| `estado` | text | `pendiente` / `procesado` / `error` / `ignorado` |
| `intencion` | text | salida de la IA: `comprobante` / `cotizacion` / `pregunta` / `otro` |
| `analisis` | jsonb | JSON completo devuelto por la IA |
| `error` | text | mensaje del último fallo |
| `intentos` | int | para no reintentar infinito |
| `recibido_en` / `procesado_en` | timestamptz | |

Índices: `(estado, recibido_en)` para la cola, `(contacto_id, recibido_en desc)` para el resumen de chat.

### `transferencias` — antesala de conciliación bancaria

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `mensaje_id` | uuid **unique** → `wa_mensajes` | un comprobante por mensaje |
| `contacto_id` / `cliente_id` | uuid | |
| `monto` | numeric | extraído por la IA |
| `fecha_pago` | date | |
| `banco_origen`, `ordenante`, `referencia`, `clave_rastreo` | text | |
| `confianza` | numeric(3,2) | 0.00–1.00, autodeclarada por la IA |
| `estado` | text | `pendiente` / `aprobada` / `rechazada` / `duplicada` |
| `pago_id` | uuid → `pagos` | **candado anti-doble-cobro** |
| `revisado_por` | uuid → `clientes` | quién apretó Aprobar |
| `revisado_en` | timestamptz | |
| `motivo_rechazo` | text | |
| `conciliado_banco` | boolean default false | ver riesgo #3 |

Índice: `(estado, creado_en)`. Y para detectar duplicados en la UI: `(monto, fecha_pago, referencia)`.

### `cotizaciones` — Radar (Kanban)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `mensaje_id` | uuid → `wa_mensajes` | |
| `contacto_id` / `cliente_id` | uuid | |
| `imagen_path` | text | la foto del producto |
| `descripcion`, `marca`, `modelo`, `talla`, `color`, `categoria` | text | extraídos por la IA |
| `cantidad` | int default 1 | |
| `notas_cliente` | text | lo que escribió además de la foto |
| `estado` | text | `nueva` / `cotizando` / `enviada` / `aceptada` / `rechazada` / `descartada` |
| `motivo_descarte` | text | ej. `regla_cristal_templado` |
| `precio_estimado`, `precio_cotizado` | numeric | |
| `asignado_a` | uuid → `clientes` | colaborador responsable |
| `prioridad` | text | `normal` / `alta` |
| `pedido_id` | uuid → `pedidos` | cuando se convierte en Encargo real |
| `historial` | jsonb | **mismo patrón que `pedidos_mercadito`** |
| `creado_en` / `actualizado_en` | timestamptz | |

**Nota sobre la regla de cristal templado:** se implementa en **dos capas**.
1. Filtro determinista por texto (regex sobre `cristal templado`, `mica de vidrio`, `tempered glass`) — barato, instantáneo, no depende de la IA.
2. Campo `descartar` en la respuesta JSON de la IA, para cuando el producto se ve en la foto pero no se menciona.

Y **no se borra**: se guarda con `estado='descartada'`. Así puedes medir cuánta demanda estás dejando ir y auditar falsos positivos (una funda con protector incluido no debería descartarse).

---

## 3. Contratos de datos (fijar esto ANTES de escribir código)

### 3.1 Make.com → `POST /api/whatsapp/ingesta`

```
Header: x-denog-token: <WHATSAPP_INGESTA_TOKEN>

{
  "manychat_id": "1234567890",
  "message_id": "wamid.HBgN...",
  "telefono": "6621234567",
  "nombre_wa": "Ana López",
  "direccion": "entrante",
  "tipo": "imagen",
  "texto": "aquí está mi pago",
  "imagen_url": "https://...temporal...",
  "recibido_en": "2026-08-04T18:32:00Z"
}
```

Respuesta siempre `200 {ok:true}` salvo token inválido (`401`). **Nunca devuelvas 500 a Make** por un error de negocio: provoca reintentos infinitos.

### 3.2 Salida esperada de la IA (un solo prompt, JSON estricto)

```json
{
  "intencion": "comprobante | cotizacion | pregunta | otro",
  "confianza": 0.0,
  "comprobante": {
    "monto": 1250.00, "fecha": "2026-08-03", "banco": "BBVA",
    "ordenante": "ANA LOPEZ", "referencia": "0123456789",
    "clave_rastreo": "..."
  },
  "cotizacion": {
    "descripcion": "...", "marca": "...", "modelo": "...",
    "talla": "...", "color": "...", "cantidad": 1,
    "categoria": "Ropa | Calzado | ...", "descartar": false,
    "motivo_descarte": null
  },
  "resumen": "una línea de qué quiere el cliente"
}
```

Los bloques que no apliquen vienen en `null`. Un solo llamado por mensaje. **Modelo: Haiku**, no Sonnet — es extracción estructurada, no razonamiento. Y si el mensaje no trae imagen, no se manda visión.

---

## 4. Plan por fases

Regla que te recomiendo respetar con disciplina: **no pasar a la siguiente fase sin cumplir el criterio de verificación.** Es lo que evita construir tres módulos sobre una tubería que resultó estar rota.

---

### Fase 0 — Preparación (½ día, sin código de producto)

1. Variables de entorno nuevas en `.env.local`, `.env.example` y Vercel:
   - `WHATSAPP_INGESTA_TOKEN` (string largo aleatorio)
   - `MANYCHAT_API_KEY` (para responder al cliente al aprobar)
   - `ANTHROPIC_API_KEY` — *ya la tienes*
   - `CRON_SECRET`
2. Crear bucket **privado** `whatsapp` en Supabase Storage.
3. Escribir y correr `db/migrations/2026-08-XX_wa_supervisor.sql` en el SQL Editor.

**Verificación:** insertar un `wa_contactos` y un `wa_mensajes` a mano desde el SQL Editor y borrarlos. Si las FK y los `check` no truenan, el esquema está bien.

---

### Fase 1 — Tubería de ingesta, **sin IA** (1–2 días)

Archivos:

```
app/api/whatsapp/ingesta/route.js     ← recibe de Make
lib/whatsapp/normalizar.js            ← teléfono a 10 dígitos, tipo de mensaje
lib/whatsapp/storage.js               ← descargar imagen → Supabase Storage
app/admin/whatsapp/page.js            ← bandeja cruda, solo lectura
app/api/whatsapp/bandeja/route.js     ← listar últimos 100 mensajes
```

Qué hace `ingesta`: valida token → `upsert` contacto (match automático con `clientes` por teléfono) → `insert` mensaje (ignora si el `message_id` ya existe) → descarga imagen a Storage → responde 200.

En Make: un escenario de **dos módulos** (Webhook de Manychat → HTTP POST). Nada más.

**Verificación (la más importante del proyecto):** deja esto corriendo **2 o 3 días reales** y revisa la bandeja. Vas a descubrir cosas que ningún plan predice: audios, stickers, mensajes reenviados sin texto, fotos de 6 MB, gente mandando 8 fotos seguidas. Ajusta aquí, no después.

> Beneficio secundario: cuando llegues a la Fase 2 ya tendrás cientos de mensajes reales para probar el prompt, sin esperar a que lleguen nuevos.

---

### Fase 2 — El clasificador IA (2–3 días)

```
lib/ia/clasificarMensaje.js           ← prompt + parseo + validación del JSON
lib/ia/reglas.js                      ← regla cristal templado y futuras
app/api/whatsapp/procesar/route.js    ← toma pendientes, clasifica, escribe análisis
app/api/cron/wa-pendientes/route.js   ← red de seguridad (Vercel Cron 2 min)
vercel.json                           ← definición del cron
```

Escribe en `wa_mensajes.analisis` / `.intencion` / `.estado`. **Todavía no crea filas en `transferencias` ni `cotizaciones`** — primero se valida la calidad de la extracción.

**Verificación:** un script que reprocesa los mensajes de la Fase 1 y te da una tabla comparativa. Métrica objetivo antes de seguir: **intención correcta ≥ 90%** y **monto de comprobante correcto ≥ 95%**. Si el monto falla más de eso, el panel de transferencias genera más trabajo del que ahorra.

---

### Fase 3 — Panel de Aprobación de Transferencias (2–3 días)

Es el más valioso y el más contenido: una sola tabla, una sola acción.

```
app/admin/transferencias/page.js
app/api/transferencias/listar/route.js
app/api/transferencias/aprobar/route.js     ← inserta en pagos
app/api/transferencias/rechazar/route.js
lib/manychat/enviarMensaje.js               ← confirmación automática al cliente
```

Flujo de aprobar (en este orden, sin excepción):
1. Verificar `estado='pendiente'` y `pago_id is null`. Si no, salir sin hacer nada.
2. `insert` en `pagos` con `vendedor_id = sesion.id`.
3. `update transferencias` con `pago_id`, `estado='aprobada'`, `revisado_por`, `revisado_en`.
4. Llamar a Manychat para mandar la confirmación al cliente. **Si esto falla, el pago igual quedó registrado** — se marca para reintento, no se revierte.

UI: fila con miniatura del comprobante (clic = signed URL), monto y fecha **editables antes de aprobar**, selector de cliente si la IA no lo identificó, aviso amarillo si `confianza < 0.8`, aviso rojo si ya existe otra transferencia con mismo monto+fecha+referencia.

**Verificación:** aprobar 10 transferencias reales y cuadrarlas contra tu estado de cuenta bancario. Doble clic en Aprobar no debe generar dos pagos.

---

### Fase 4 — Radar de Cotizaciones (3–4 días)

```
app/admin/cotizaciones/page.js              ← Kanban
app/api/cotizaciones/listar/route.js
app/api/cotizaciones/actualizar/route.js    ← mover de columna, asignar, precio
app/api/cotizaciones/convertir/route.js     ← cotización aceptada → pedidos
```

Columnas: `Nuevas → Cotizando → Enviada → Aceptada / Rechazada`, más una pestaña aparte **"Descartadas"** (ahí caen los cristales templados; sirve para auditar la regla).

Tarjeta: foto, descripción/marca/talla extraídas y **editables**, nombre del cliente, tiempo transcurrido, colaborador asignado, botón `wa.me` con texto pre-generado y editable.

Reusa directo de `app/admin/mercadito/page.js`: `STATUS_META`, `pillStyle`, el patrón `waTemplates`, el `historial` jsonb. No inventes UI nueva — que el equipo reconozca la pantalla es una ventaja real.

> **Ojo con los nombres:** ya existe `/admin/cotizador` — es tu calculadora de precio (USD + tax + tipo de cambio + margen). El Radar va en `/admin/cotizaciones`, que es otra cosa. Vale la pena **extraer la fórmula del cotizador a `lib/precios/calcular.js`** y reusarla para llenar `precio_estimado` desde la tarjeta del Radar: cotizas sin cambiar de pantalla.

**Verificación:** procesar 20 fotos reales. Ninguna con "cristal templado" debe llegar a `Nuevas`; ninguna funda normal debe caer en `Descartadas`.

---

### Fase 5 y en adelante (después de que 3 y 4 estén en uso real)

- **Semáforo de Atención**: vista SQL sobre `wa_contactos` + badge en el menú lateral. Barato, ya tienes los datos.
- **Resúmenes de chat**: Haiku sobre los últimos N mensajes del contacto, cacheado en `wa_contactos.resumen`.
- **Demanda oculta**: agregación sobre `cotizaciones` (descripción normalizada, conteo por semana).
- **Módulo 2 (Cobranza)**: temporizador de apartado + botones de 1 clic. Se apoya en `pedidos`/`entregas` existentes, no necesita las tablas de WhatsApp.
- **Módulo 3 (Denog Hub)**: `tareas_colaborador` + anillos. Independiente de todo lo anterior; puede correr en paralelo si tienes ayuda.

---

## 5. Riesgos y cómo los mitigo

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | La IA inventa un monto y se aprueba sin leer | Monto y fecha **editables**; aviso visual si `confianza < 0.8`; miniatura del comprobante siempre visible junto al campo |
| 2 | Comprobantes falsos o editados | La IA **no valida autenticidad, y no debe pretender hacerlo**. Campo `conciliado_banco` para el cruce real contra tu estado de cuenta. Es un control aparte, humano |
| 3 | Doble aprobación / doble cobro | Candado `pago_id is null` + `manychat_message_id unique` |
| 4 | Mensajes perdidos por timeout | Cola `estado='pendiente'` + Vercel Cron de rescate |
| 5 | Costo de IA se dispara | Haiku; sin visión cuando no hay imagen; `intentos` máximo 3; ignorar mensajes salientes |
| 6 | Datos bancarios de terceros expuestos | Bucket privado + signed URLs de 5 min + solo `requerirStaff` |
| 7 | El equipo ignora el panel y sigue en WhatsApp | Fase 3 primero (es la que les quita trabajo). Badge de pendientes en el menú lateral, como ya hace Mercadito |
| 8 | Cambios en la API de Manychat | Toda la comunicación saliente aislada en `lib/manychat/` — un solo archivo que tocar |

---

## 6. Lo que yo NO haría

- **No** dejar que la IA mande mensajes al cliente sin aprobación humana en esta etapa. Genera el texto, el humano lo suelta.
- **No** meter reglas de negocio en Make.
- **No** usar Supabase Realtime todavía. Polling cada 30 s, igual que el resto de tu admin. Menos piezas móviles.
- **No** construir Módulo 2 y 3 en paralelo con esto si estás solo. Transferencias en producción vale más que tres módulos a medias.
- **No** borrar nada nunca (cotizaciones descartadas, mensajes ignorados). El histórico es lo que después te da la Inteligencia de Negocio que pides en el Módulo 1.

---

## 7. Orden de ejecución sugerido

```
Fase 0  ██                        ½ día
Fase 1  ████                      1-2 días  → dejar correr 2-3 días
Fase 2  ██████                    2-3 días
Fase 3  ██████                    2-3 días  → PRIMER VALOR REAL
Fase 4  ████████                  3-4 días
```

**~2 semanas de trabajo efectivo** para tener Transferencias y Radar en producción, contando los días de observación de la Fase 1.

El hito que importa es el final de la Fase 3: a partir de ahí el sistema ya te está ahorrando trabajo todos los días, y todo lo demás se construye sobre una tubería que ya demostró funcionar con mensajes reales.

---

## Siguiente paso

Cuando apruebes este plan, lo primero a escribir es la migración SQL de la Fase 0 y el endpoint de ingesta de la Fase 1 — nada de IA todavía.
