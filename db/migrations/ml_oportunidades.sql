-- Fase 4: oportunidades de mercado (ofertas de EE. UU. cruzadas con el catálogo de MercadoLibre México).
create table if not exists public.ml_oportunidades (
  oferta_id uuid primary key,
  nombre text not null,
  tienda text,
  precio_usd numeric,
  imagen_url text,
  url_oferta text,
  familia text,
  ml_producto_id text,
  ml_nombre text,
  ml_foto text,
  ml_categoria text,
  vendedores int,
  precio_min numeric,
  precio_mediana numeric,
  precio_max numeric,
  envio_gratis_pct int,
  ranking int,
  tendencia boolean default false,
  costo_mxn numeric,
  precio_objetivo numeric,
  comision_pct numeric,
  envio_est numeric,
  ganancia numeric,
  sobre_costo_pct numeric,
  margen_pct numeric,
  tipo text not null default 'sin_coincidencia',
  descartada boolean not null default false,
  actualizado_en timestamptz not null default now()
);
create index if not exists ml_oportunidades_tipo_idx on public.ml_oportunidades (tipo, sobre_costo_pct desc);
alter table public.ml_oportunidades enable row level security;
grant select, insert, update, delete on public.ml_oportunidades to service_role;
alter table public.ml_oportunidades add column if not exists borrador_id bigint;
alter table public.ml_oportunidades add column if not exists costo_fuente text, add column if not exists producto_id bigint, add column if not exists stock_catalogo int;
