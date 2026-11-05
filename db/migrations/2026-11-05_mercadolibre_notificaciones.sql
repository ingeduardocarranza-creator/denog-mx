-- MercadoLibre · avisos en tiempo real (webhook). Aquí solo se GUARDAN los
-- avisos tal como llegan (ventas, envíos, reclamos, mensajes, publicaciones);
-- la Fase 2 los procesa (procesada_en) para crear pedidos y alertas.
-- Solo-servidor: RLS prendido y sin políticas.

create table if not exists public.ml_notificaciones (
  id             bigserial primary key,
  ml_id          text unique,
  topic          text not null,
  recurso        text,
  ml_user_id     bigint,
  application_id text,
  intentos       integer,
  enviada_en     timestamptz,
  recibida_en    timestamptz not null default now(),
  procesada_en   timestamptz,
  error          text
);
create index if not exists ml_notificaciones_pendientes_idx on public.ml_notificaciones (recibida_en) where procesada_en is null;
alter table public.ml_notificaciones enable row level security;
grant all on public.ml_notificaciones to service_role;
grant usage, select on sequence public.ml_notificaciones_id_seq to service_role;
