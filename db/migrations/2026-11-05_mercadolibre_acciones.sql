-- MercadoLibre: bitácora de los cambios que el sistema hace en tus publicaciones
-- (pausar, poner días de entrega). Guarda cómo estaba antes, por si hay que
-- deshacerlo. Solo-servidor: RLS prendido y sin políticas.
create table if not exists public.ml_acciones (
  id             bigserial primary key,
  item_id        text not null,
  accion         text not null,
  valor          text,
  antes          jsonb,
  ok             boolean not null,
  mensaje        text,
  hecho_por      uuid,
  hecho_en       timestamptz not null default now()
);
create index if not exists ml_acciones_item_idx on public.ml_acciones (item_id, hecho_en desc);
alter table public.ml_acciones enable row level security;
grant all on public.ml_acciones to service_role;
grant usage, select on sequence public.ml_acciones_id_seq to service_role;
