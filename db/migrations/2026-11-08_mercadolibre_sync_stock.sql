-- Sincronizar stock del catálogo hacia MercadoLibre (interruptor por publicación).
alter table public.ml_publicaciones add column if not exists sync_stock boolean not null default false;
alter table public.ml_publicaciones add column if not exists sync_stock_en timestamptz;
alter table public.ml_publicaciones add column if not exists sync_stock_msg text;
