# Pendientes de WhatsApp — qué es, qué hace y qué no hace

> Especificación de la sección. Complementa `PLAN.md` (que cuenta el porqué y el
> trámite con Meta). Si algo aquí contradice a `PLAN.md`, manda este documento.
>
> Definido el 15/ago/2026 con Eduardo, después de la primera prueba real.

---

## 1. Objetivo, en una frase

**Un embudo que filtra las conversaciones de WhatsApp y separa lo que requiere acción,
para que una persona lo revise caso por caso.**

La palabra clave es **filtrar**. No resolver, no decidir, no contestar. El sistema
reduce cientos de mensajes al día a una lista corta de cosas que alguien tiene que
mirar. Quien decide siempre es una persona.

---

## 2. El principio que gobierna todo

> **La validación es humana. Siempre. Sin excepción.**

El sistema nunca aprueba un pago, nunca confirma un pedido, nunca contesta a un
cliente, nunca cierra un trato. Su único trabajo es **poner cosas enfrente de los
ojos correctos**.

Esto no es una limitación temporal ni una versión reducida. Es el diseño. Un
asistente que filtra bien y no decide nada es útil y seguro. Uno que decide mal es
un pasivo.

---

## 3. Lo que el sistema SÍ hace

1. Lee cada mensaje 1 a 1 que entra al número del negocio.
2. Decide si ese mensaje contiene algo que se puede olvidar.
3. Si sí, escribe **un renglón** en la lista de Pendientes, con un resumen de una
   línea y los datos que alcanzó a extraer.
4. Marca como atendido lo que ya se atendió (cuando el cliente vuelve a escribir, o
   cuando llega el eco de que alguien contestó desde el celular).
5. Detecta conversaciones que quedaron colgadas y las sube a la lista solas.

## 4. Lo que el sistema NUNCA hace

- **No le contesta nada a ningún cliente.** Ni un "ya lo vimos". Nunca.
- **No aprueba ni concilia pagos.** Extrae el monto y lo propone; una persona lo
  confirma o lo corrige antes de que se registre.
- **No decide si un monto está bien o mal.** Si no cuadra, lo marca y lo manda a
  revisión — nunca lo resuelve.
- **No borra ni cierra pendientes por su cuenta**, salvo la señal objetiva de que la
  conversación ya siguió (cliente volvió a escribir / hubo respuesta del equipo).
- **No toca el grupo de difusión.** Los mensajes de grupo ni siquiera le llegan.
- **No inventa datos.** Si no alcanza a leer el banco o la referencia, lo deja vacío;
  no lo adivina.

---

## 5. El umbral: preferimos ruido a olvido

**Cambio de criterio (15/ago/2026).** El diseño original decía: *"ante la duda, NO
generes pendiente — es preferible que se escape uno a llenar la lista de ruido."*

**Se invierte.** Ahora: **ante la duda, SÍ genera el pendiente.**

El motivo es el modelo de uso real. Eduardo revisa y valida todo de todas formas, así
que un pendiente de más cuesta dos segundos de lectura. Un pendiente de menos cuesta
un cliente, un pago sin conciliar o un pedido perdido. Los costos no son simétricos.

**El riesgo que esto trae, dicho claro:** una lista con demasiado ruido se abandona.
Si a las semanas la lista se vuelve impracticable, la solución no es volver al criterio
silencioso — es afinar el clasificador con los errores reales marcados desde el panel
(ver §7).

**El umbral flojo NO aplica a la venta normal.** Son dos reglas distintas y no hay que
confundirlas:

- *Umbral flojo* → para decidir **si algo requiere acción**. Ante la duda, avisa.
- *Regla dura* → la venta normal **se calla siempre**. Eso no es "duda", es el flujo
  que ya funciona bien.

Si el umbral flojo se aplicara también a la venta normal, cada foto reenviada del grupo
se volvería un pendiente falso y la lista sería inservible en una semana.

**Lo que no genera pendiente nunca:**

- El cliente reenvía una foto que Denog publicó en su grupo y dice que la quiere.
- Preguntas de talla, color o disponibilidad sobre algo que Denog ya publicó.
- Cortesías: gracias, saludos, emojis sueltos.
- Preguntas de seguimiento sobre algo ya en curso ("¿ya llegó lo mío?").

### 5.1 La distinción crítica: producto del grupo vs. pedido específico

Es el caso más difícil del sistema y donde más se puede ensuciar la lista. Las dos
situaciones se parecen — en ambas llega una foto de un producto — pero son opuestas:

| | Producto del grupo (venta normal) | Pedido específico |
|---|---|---|
| Qué pasó | Denog publicó la foto; el cliente la reenvía porque le interesa | El cliente vio algo en OTRA tienda y pide que se lo consigan |
| Qué dice el cliente | "me interesa", "lo quiero", "apártamelo", "¿cuánto?", "¿qué tallas hay?" | "¿me lo consigues?", "¿puedes traer…?", "¿encuentras…?", "te encargo…" |
| Cómo se ve la imagen | Foto de producto al estilo de Denog, normalmente con precio puesto por ellos | Captura de una tienda o página: se ve la interfaz, el logo de la tienda, botón de comprar, precio en dólares |
| Acción | **Ninguna.** El equipo ya sabe qué hacer | Alguien tiene que cotizar y responder |

**El discriminador real no es "¿hay una foto de producto?" sino "¿el cliente está
pidiendo que le CONSIGAN algo que Denog no ha ofrecido?"**

**Trampa a evitar:** *reenviado ≠ del grupo*. El marcador de "reenviado" de WhatsApp no
distingue de dónde viene. Los clientes también reenvían capturas de Amazon, SHEIN o
Temu. El prompt original trataba "reenviado" como señal fuerte de venta normal, y eso
está mal: hay que mirar **qué se ve en la imagen** y **qué pide el texto**, no solo la
bandera de reenvío.

**Casos límite y cómo resolverlos:**

- Foto del grupo + "¿me consigues otro igual pero en azul?" → **pedido específico**
  (pide algo que no se publicó).
- Link a otra tienda, con o sin texto → **pedido específico**, casi siempre.
- Foto ambigua sin texto → aquí sí aplica el umbral flojo: **genera el pendiente**.
- Foto del grupo + "me interesa" → **nada**. Es la venta normal, sin excepción.

---

## 6. Las categorías

### Activas hoy

| Categoría | Qué captura | Quién la resuelve |
|---|---|---|
| **Comprobante** (o anticipo) | Cualquier aviso de pago: captura de transferencia, foto de depósito, o texto tipo "ya te transferí". Extrae monto, banco, referencia, ordenante. No distingue pago completo de anticipo. | Una persona concilia y aprueba |
| **Pedido específico** | Encargo de algo que Denog no ha publicado: texto, link (Amazon, SHEIN…) o foto de otra tienda. Extrae marca, modelo, talla, color, cantidad, link. | Una persona cotiza y responde |
| **Sin responder** | El cliente escribió y nadie contestó en 15 min, dentro del horario de atención (L-V 10-19h, sáb 10-17h). No lo genera la IA sino un barrido periódico. | Una persona contesta |

### Planeadas (en este orden)

| Categoría | Qué capturaría | Por qué importa |
|---|---|---|
| **Reclamo o queja** | "Me llegó dañado", "no era la talla", "nunca llegó" | Si se pierde, se pierde el cliente |
| **Cancelación** | "Ya no lo quiero", "me salió un imprevisto" | Libera mercancía apartada |
| **Apartado o compromiso** | "Me lo apartas", "paso el viernes" | Genera un compromiso con fecha que alguien debe recordar |

Descartada por ahora: cambios de datos de entrega.

### Cómo se agrega una categoría nueva

Hoy cada categoría vive en **tres lugares**: el `check` de la columna `tipo` en
Postgres, el prompt de `lib/whatsapp/clasificador.js`, y las pestañas de
`app/admin/pendientes/page.js`. Agregar una implica tocar los tres y correr una
migración.

**Pendiente de refactor:** mover el catálogo a un solo archivo
(`lib/whatsapp/categorias.js`) del que se deriven el prompt, las pestañas y la
validación, y quitar el `check` rígido de la base. Mientras no se haga, agregar
categorías es más caro de lo que debería.

---

## 7. Cuando la IA se equivoca

El clasificador se va a equivocar en ambas direcciones, y el panel tiene que dejar
corregirlo. **Los errores marcados son el material con el que se afina** — con casos
reales de Denog, no con suposiciones.

**Falsos positivos** (metió algo que no era): botón **"Esto no era"** en cada
pendiente. No lo borra: lo marca como descartado y guarda el motivo. Requiere un
estado nuevo `descartado` y una columna de motivo.

**Falsos negativos** (se le escapó algo): más difícil, porque no hay renglón que
marcar. Opción mínima: poder agregar un pendiente a mano desde el panel (teléfono +
nota), que además queda como ejemplo de algo que debió detectarse.

Cada cierto tiempo se revisan los descartados y los agregados a mano, y con eso se
ajusta el prompt. Ese es el ciclo de mejora.

---

## 8. Ciclo de vida de un pendiente

```
nuevo  →  visto  →  resuelto
  │        (alguien apretó      (ya se concilió,
  │         "Yo lo veo", para    cotizó o contestó)
  │         que el otro no
  │         lo repita)
  │
  └──→  descartado   (botón "Esto no era" — no debió existir)
```

Cierre automático (única cosa que el sistema cierra solo): un pendiente de
`sin_responder` se marca resuelto si el cliente vuelve a escribir o si llega el eco de
que alguien del equipo respondió. Los de comprobante y pedido **siempre** los cierra
una persona.

---

## 9. Qué NO va todavía

- Que la IA conteste algo al cliente → **no está en el plan, ni ahora ni después**.
- Convertir un pedido específico en Encargo con fecha de entrega.
- Resúmenes de conversaciones completas.
- Detección de intención de compra o priorización por valor del cliente.

---

## 10. Cómo saber si esto está funcionando

Preguntas para revisar en unas semanas, no métricas de tablero:

- ¿Se está revisando la lista todos los días, o ya se abandonó?
- De lo que aparece, ¿qué proporción resultó ser ruido? (los descartados lo dicen)
- ¿Cuántas veces alguien encontró algo importante en el chat que la lista no traía?
- ¿La sección de Pendientes reemplazó al hábito de revisar el WhatsApp a mano, o se
  volvió trabajo extra encima?

Si la respuesta a la última es "trabajo extra", algo está mal en el umbral o en las
categorías, y hay que ajustar antes de agregar funciones nuevas.
