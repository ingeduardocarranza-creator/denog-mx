-- MercadoLibre · Fase 1: conexión por API y publicaciones ligadas al catálogo por SKU.
--
-- ml_conexion: una sola fila (la cuenta de Lalo) con los tokens de la API.
-- ml_publicaciones: las publicaciones de MercadoLibre, una fila por publicación
--   (o por variante, si la publicación tiene variantes), ligadas a
--   productos_tienda por el SKU (seller_custom_field / SELLER_SKU) contra
--   productos_tienda.codigo_barras, o a mano desde la pantalla.
--
-- Ambas son solo-servidor: RLS prendido y sin políticas (se leen con la llave
-- de servicio desde las rutas /api/mercadolibre/*). Los tokens nunca llegan al
-- navegador.

create table if not exists public.ml_conexion (
  id            integer primary key default 1 check (id = 1),
  ml_user_id    bigint,
  ml_nickname   text,
  access_token  text,
  refresh_token text,
  expira_en     timestamptz,
  conectado_en  timestamptz not null default now(),
  conectado_por uuid
);

create table if not exists public.ml_publicaciones (
  id                 bigserial primary key,
  item_id            text not null,
  variacion_id       bigint not null default 0,
  titulo             text,
  sku                text,
  gtin               text,
  precio             numeric,
  stock_ml           integer,
  estado_ml          text,
  tiempo_preparacion integer,
  tipo_envio         text,
  miniatura          text,
  enlace             text,
  producto_id        bigint references public.productos_tienda(id) on delete set null,
  -- ligada | sin_sku | sin_coincidencia | ambigua
  liga_estado        text not null default 'sin_coincidencia',
  liga_manual        boolean not null default false,
  sincronizado_en    timestamptz not null default now(),
  unique (item_id, variacion_id)
);

create index if not exists ml_publicaciones_producto_idx on public.ml_publicaciones (producto_id);
create index if not exists ml_publicaciones_liga_idx on public.ml_publicaciones (liga_estado);

alter table public.ml_conexion enable row level security;
alter table public.ml_publicaciones enable row level security;

grant all on public.ml_conexion to service_role;
grant all on public.ml_publicaciones to service_role;
grant usage, select on sequence public.ml_publicaciones_id_seq to service_role;
