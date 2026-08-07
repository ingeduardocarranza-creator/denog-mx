# Preguntas de diseño — Denog

> **No contestes todo esto de una sentada.** Contesta la **Sección 0** y luego solo
> la sección de lo que vayamos a construir primero. Lo demás se queda aquí esperando.
>
> Cada pregunta está aquí porque **cambia el código**. Si una pregunta no cambia nada,
> la quité.

---

## SECCIÓN 0 — Las tres que desatoran todo

Sin estas tres, todo lo demás es adivinar.

1. **¿Qué te duele más HOY?**
   `a)` Se me pierde dinero y stock · `b)` Estoy saturado leyendo WhatsApp · `c)` Mi equipo no ejecuta
   → *Define con qué ola arrancamos. Las tres usan los mismos motores, solo cambia el orden.*

2. **¿Cuántos mensajes de clientes te llegan al día, más o menos?**
   `a)` menos de 20 · `b)` 20–60 · `c)` más de 60
   → *Debajo de 20, pegar a mano es cómodo y Manychat es un lujo. Arriba de 60, la Ola 4 se vuelve urgente y hay que pensar en asignación por colaborador.*

3. **¿Tu equipo contesta WhatsApp desde el celular o desde WhatsApp Web en computadora?**
   → *Si es Web, pegar con Ctrl+V es trivial y la Ola 2 rinde de inmediato. Si es puro celular, no se puede pegar y hay que ir directo a la Ola 4 o repensar la captura.*

---

## SECCIÓN 1 — Catálogo y grupo
*(define si la huella de imagen es viable)*

4. **Las fotos que publicas al grupo, ¿de dónde salen?** ¿Las subes primero a tu catálogo, o las tomas con el celular y las publicas directo?
   → *Si no pasan por el catálogo, no hay contra qué comparar la huella. Es el requisito #1 de toda la Ola 2.*

5. **¿Cuántas fotos publicas por semana?**
   → *Define si vale la pena automatizar el registro de fotos o se hace a mano.*

6. **¿Una foto = un producto, o publicas fotos con varios artículos juntos?**
   → *Si una foto trae 5 productos, la huella identifica la foto pero no cuál de los 5 quiere. Habría que preguntarle al cliente o partir la foto.*

7. **¿El precio va escrito en la foto o lo mandas aparte?**
   → *Si va en la foto, la huella te da el precio publicado y puedes detectar cuando cambió.*

8. **¿Repites fotos de temporadas anteriores?**
   → *Una foto vieja reenviada puede apuntar a stock que ya no existe. Cambia el mensaje que se le da al cliente.*

---

## SECCIÓN 2 — Apartados
*(Módulo 2 · Ola 1)*

9. **¿Cuánto tiempo apartas hoy?** ¿24 h, 48 h, hasta el próximo viaje?
   → *Es el número que hace correr el reloj. Sin él no hay temporizador.*

10. **¿El apartado baja el stock de inmediato, o solo lo marca como "comprometido"?**
    → *Decide si un apartado sin pagar bloquea la venta a otro cliente. Es la diferencia entre perder una venta y sobrevender.*

11. **¿Un apartado sin anticipo cuenta como apartado?** (ya tienes `requiere_anticipo` por cliente)
    → *Define si el reloj arranca al pedir o al pagar. Cambia por completo la regla.*

12. **Antes de liberar, ¿se le avisa al cliente? ¿Cuántas veces?**
    → *Define cuántas alertas y cuántos mensajes se generan por apartado.*

13. **Cuando se vence, ¿se libera solo o alguien tiene que confirmar?**
    → *Automático es más limpio pero da miedo. Recomiendo: alerta + botón de liberar, y automático solo si después de un mes te sientes cómodo.*

14. **¿Hay clientes a los que SÍ les guardas más tiempo?**
    → *Si sí, el plazo va por cliente, no global. Es un campo más.*

---

## SECCIÓN 3 — Transferencias
*(Módulo 1 · Ola 2)*

15. **¿Cuántos comprobantes te llegan al día?**
    → *Debajo de 5, esto no vale una pantalla. Arriba de 15, es tu mayor ahorro de tiempo.*

16. **¿A cuántas cuentas bancarias te transfieren?**
    → *Si son varias, la IA tiene que identificar a cuál entró para que la conciliación sirva de algo.*

17. **¿Qué pasa si el monto NO coincide con lo que debe?** ¿pago parcial, pagó de más, pagó dos pedidos juntos?
    → *Este es el caso que rompe todos los sistemas de conciliación. Hay que decidirlo antes, no después.*

18. **¿Aceptas que pague un tercero** (la mamá, el esposo)?
    → *Si sí, el nombre del ordenante no sirve para identificar al cliente y hay que enlazar a mano.*

19. **¿Quién concilia hoy contra el estado de cuenta del banco, y cada cuándo?**
    → *La IA lee la captura, pero no verifica que el dinero llegó. Ese cruce sigue siendo humano y hay que dejarle su lugar.*

20. **¿Te han mandado comprobantes falsos o editados?**
    → *Si ya te pasó, la aprobación necesita un paso extra y conviene no confirmarle al cliente hasta ver el banco.*

---

## SECCIÓN 4 — Cotizaciones / encargos
*(Módulo 1 · Ola 2)*

21. **¿Cuántos encargos específicos por semana?**
    → *Define si el Kanban es una pantalla o basta una lista.*

22. **¿Cuánto tardas hoy en cotizar uno?** ¿minutos, horas, hasta el próximo viaje?
    → *Define desde cuántas horas una cotización se considera "estancada" y genera alerta.*

23. **¿Quién cotiza: solo tú o el equipo también?**
    → *Define si hace falta asignar responsable y medir por persona.*

24. **Además de cristal templado, ¿qué más NO vendes?**
    → *Cada regla es una línea de código. Es más barato ponerlas todas de una vez.*

25. **¿La fórmula del `/admin/cotizador` aplica siempre, o varía por producto?**
    → *Si aplica siempre, el precio estimado sale solo. Si varía, es un campo manual.*

26. **Cuando el cliente acepta la cotización, ¿qué pasa exactamente?** ¿se vuelve encargo con fecha de entrega? ¿pide anticipo?
    → *Define a dónde desemboca el Kanban. Sin esto el Radar es un tablero que no lleva a ningún lado.*

---

## SECCIÓN 5 — Cobranza y entregas
*(Módulo 2 · Ola 1)*

27. **¿Cuántos pedidos listos sin recoger tienes ahorita?**
    → *El número que justifica (o no) todo el Módulo 2.*

28. **¿Cuántos días esperas antes del primer recordatorio? ¿Y cuántos recordatorios antes de rendirte?**
    → *Es la regla de la alerta. Necesito los dos números.*

29. **¿Qué pasa con un pedido que nunca recogen?** ¿lo revendes? ¿se lo cobras igual?
    → *Define el estado final y si genera adeudo.*

30. **La ruta local en Hermosillo, ¿cuesta extra al cliente? ¿Es gratis desde cierto monto?**
    → *Ya tienes el cálculo de distancia con radio de 15 km. Falta la regla de cobro.*

31. **¿Cualquiera del equipo manda el mensaje de cobranza o solo tú?**
    → *Define permisos y si el mensaje lleva la firma de quién lo mandó.*

32. **Dame 2 o 3 mensajes REALES que hayas mandado tú**, tal cual los escribes.
    → *Esto es lo que hace que la IA suene a ti y no a robot. Es la pregunta más valiosa de toda esta sección.*

---

## SECCIÓN 6 — Equipo / Denog Hub
*(Módulo 3 · Ola 3)*

33. **¿Cuántos colaboradores son y qué hace cada uno?**
    → *Define si los checklists son por rol o iguales para todos.*

34. **Las tareas diarias, ¿son las mismas siempre o cambian cada día?**
    → *Plantilla fija = se genera sola cada mañana. Variable = alguien la arma diario, y eso es trabajo nuevo para ti.*

35. **¿Quién arma el checklist: tú cada mañana, o se genera solo?**
    → *Si te toca a ti todos los días, el Hub te agrega trabajo en vez de quitártelo. Hay que diseñarlo distinto.*

36. **Los anillos, ¿los ven todos entre sí o cada quien el suyo?**
    → *Competencia abierta motiva a unos equipos y quema a otros. Tú los conoces.*

37. **¿Hay bono o pago atado a estas metas?**
    → *Si el número afecta el sueldo, necesita historial no editable y auditoría. Es otro nivel de rigor.*

38. **¿Qué es una "meta cumplida" hoy, sin sistema?**
    → *Si no existe la definición hoy, el sistema no la va a inventar.*

---

## SECCIÓN 7 — Alertas
*(motor de la Ola 1)*

39. **¿Cada alerta la ves tú, el colaborador, o los dos?**
    → *Define a quién se le muestra qué. Si todo te llega a ti, no delegaste nada.*

40. **¿Cuántas horas sin respuesta de un humano ya es una alerta?**
    → *Un número. Distinto en horario laboral que en la noche — dime también tu horario.*

41. **¿Basta con el badge en el panel, o quieres que te avise fuera** (correo, WhatsApp)?
    → *Fuera del panel es más trabajo y más ruido. Yo empezaría solo con el badge.*

---

## SECCIÓN 8 — WhatsApp automático
*(Ola 4 · solo si decides pagarla)*

42. **¿Usas listas de difusión hoy?**
    → *La coexistencia las deja en solo lectura. Si las usas mucho, hay que planear la migración a Manychat.*

43. **¿Es un solo número el que atiende, o varios?**
    → *Varios números = varias conexiones = más costo.*

44. **¿Alguien de tu equipo tiene acceso al Business Manager de Meta?**
    → *El onboarding necesita verificación de negocio. Es el trámite que hay que arrancar antes que el código.*

---

## Cómo usar esto

Contesta la **Sección 0**. Con esas tres respuestas te digo cuál es la siguiente sección
que importa, y esa la contestamos con calma. Las demás se quedan escritas para cuando
toquen — no se pierden, y no hay que resolverlas hoy.
