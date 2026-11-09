-- Sincronizar stock del catálogo hacia MercadoLibre (interruptor por publicación).
alter table public.ml_publicaciones add column if not exists sync_stock boolean not null default false;
alter table public.ml_publicaciones add column if not exists sync_stock_en timestamptz;
alter table public.ml_publicaciones add column if not exists sync_stock_msg text;
-- Modo "bajo pedido" cuando el catálogo llega a 0 (piezas y días que muestra MercadoLibre).
alter table public.ml_publicaciones add column if not exists bajo_pedido_piezas integer not null default 10;
alter table public.ml_publicaciones add column if not exists bajo_pedido_dias integer not null default 9;
