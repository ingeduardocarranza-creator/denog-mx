-- Bandeja de mensajes de venta por WhatsApp — arregla el desfase.
-- Ver claude/ventas-whatsapp-desfase.md (proyecto "Sitio web Denog").
--
-- EL PROBLEMA QUE RESUELVE
-- Cada mensaje de WhatsApp llega como una petición HTTP aparte y Vercel las
-- corre en paralelo. El diseño anterior emparejaba "al vuelo": cada mensaje
-- buscaba en `pedidos` el borrador más viejo al que le faltara su casilla.
-- Procesar una foto tarda 3-5 s (bajarla de Meta, subirla a Storage, análisis
-- de imagen con IA); procesar un texto tarda ~1 s. Cuando Eduardo reenvía 100
-- mensajes de un jalón, los textos terminan ANTES que las fotos que los
-- preceden, así que el texto de un cliente se pegaba a la foto de OTRA venta.
-- A partir de ahí todo se recorre un lugar y nunca se recupera solo (envío del
-- 2 sep 2026: 53 textos, 49 fotos, todo desfasado).
--
-- LA SOLUCIÓN: separar lo lento de lo que necesita orden.
--   1. Al llegar, el mensaje se guarda aquí crudo — un solo INSERT, sin IA y
--      sin descargas. Es lo primero que hace el webhook, así el orden de
--      inserción sigue de cerca el orden real de envío.
--   2. El enriquecimiento (bajar la foto, preguntarle a la IA) se hace en
--      paralelo, pero cada petición solo toca SU PROPIA fila. No hay carreras
--      porque ya nadie compite por el mismo borrador.
--   3. El armado de `pedidos` se hace después, en UN solo proceso, recorriendo
--      la bandeja en orden estricto: una foto abre una venta, el siguiente
--      texto la cierra. Determinista, sin efecto dominó.
--
-- Correr una sola vez en el SQL editor de Supabase.

create table if not exists whatsapp_ventas_bandeja (
  mensaje_wa_id text primary key,          -- dedup: Meta entrega el mismo mensaje 2 veces
  orden         bigserial,                 -- desempate dentro del mismo segundo
  recibido_en   timestamptz not null,      -- msg.timestamp de WhatsApp (granularidad de 1 s)
  telefono      text not null,
  clase         text not null,             -- 'media' (foto/video/doc) | 'texto'
  tipo_wa       text,                      -- image | video | document | text | ...
  media_id      text,
  texto         text,                      -- caption del adjunto o cuerpo del mensaje
  imagen_path   text,                      -- ruta en el bucket, tras descargarla
  datos         jsonb,                     -- lo que sacó la IA (descripcion, cliente, usd, talla…)
  estado        text not null default 'pendiente',  -- pendiente | listo | armado | omitido
  intentos      int  not null default 0,
  error         text,
  pedido_id     uuid,                      -- fila de `pedidos` que originó/completó
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table whatsapp_ventas_bandeja drop constraint if exists whatsapp_ventas_bandeja_estado_check;
alter table whatsapp_ventas_bandeja add constraint whatsapp_ventas_bandeja_estado_check
  check (estado in ('pendiente', 'listo', 'armado', 'omitido'));

-- El armado siempre recorre en este orden y se detiene en el primer hueco.
create index if not exists idx_bandeja_orden
  on whatsapp_ventas_bandeja(recibido_en, orden);

-- Para encontrar rápido lo que falta enriquecer o armar.
create index if not exists idx_bandeja_estado
  on whatsapp_ventas_bandeja(estado, recibido_en, orden);

grant select, insert, update, delete on whatsapp_ventas_bandeja to service_role;
grant usage, select on sequence whatsapp_ventas_bandeja_orden_seq to service_role;

alter table whatsapp_ventas_bandeja enable row level security;
-- RLS activado sin políticas: solo la llave de servicio entra, mismo criterio
-- que el resto de las tablas de WhatsApp.

-- Candado del armado: el armado tiene que ser UNO A LA VEZ (es lo que le da
-- el orden). Se usa una fila-candado con caducidad en vez de un advisory lock
-- de Postgres porque PostgREST reparte cada petición en una conexión distinta
-- del pool y un lock de sesión no sobreviviría entre dos llamadas.
create table if not exists whatsapp_ventas_armado (
  id        int primary key default 1,
  tomado_en timestamptz,
  constraint whatsapp_ventas_armado_fila_unica check (id = 1)
);

insert into whatsapp_ventas_armado (id, tomado_en) values (1, null)
on conflict (id) do nothing;

grant select, insert, update on whatsapp_ventas_armado to service_role;
alter table whatsapp_ventas_armado enable row level security;
