-- Enlace explícito entre el texto del cliente y su foto.
--
-- POR QUÉ
-- El orden de llegada no sirve como pista y ya está medido (ver
-- claude/ventas-whatsapp-desfase.md). En una ráfaga de reenvío, WhatsApp
-- estampa ~30 mensajes en 3 segundos y a nuestro webhook llegan
-- sistemáticamente en el patrón "texto → foto → texto → foto": el texto del
-- cliente entra ANTES que su propia foto, porque una foto tarda más en salir
-- del lado de Meta. Así cada foto se emparejaba con el texto de la venta
-- siguiente. Y ni siquiera mandando uno por uno el orden es constante: el
-- 2 sep Eduardo mandó unas veces el texto primero y otras la foto primero.
--
-- LA SOLUCIÓN
-- Que el enlace venga DENTRO del mensaje. Si el texto del cliente se manda
-- como RESPUESTA a la foto (deslizar sobre la foto y escribir), WhatsApp
-- incluye `context.id` con el id del mensaje citado. Eso es un enlace exacto:
-- no importa en qué orden lleguen ni cuál se atrase.
--
-- Es opcional: un texto sin respuesta sigue emparejándose por orden, como
-- hasta ahora.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table whatsapp_ventas_bandeja add column if not exists responde_a text;

-- Para resolver rápido "¿quién respondió a esta foto?" al armar.
create index if not exists idx_bandeja_responde_a
  on whatsapp_ventas_bandeja(responde_a) where responde_a is not null;
