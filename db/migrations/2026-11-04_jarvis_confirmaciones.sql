-- Confirmación de pedidos empacados que siguen "en tienda" (Jarvis).
-- El colaborador confirma, por cliente y por entrega, si el pedido sigue en tienda
-- (con foto), ya se entregó (se cierra como Entregado, sin cobro ni aviso) o no está.
create table if not exists public.jarvis_confirmaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  entrega_id uuid not null,
  resultado text not null check (resultado in ('en_tienda','entregado','no_esta')),
  foto_url text,
  piezas int not null default 0,
  monto numeric not null default 0,
  confirmado_por uuid,
  creada_en timestamp not null default timezone('America/Hermosillo', now()),
  avisado_en timestamp,
  avisado_por uuid,
  resuelto_en timestamp,
  resuelto_por uuid,
  nota text,
  unique (cliente_id, entrega_id)
);
alter table public.jarvis_confirmaciones enable row level security;
grant all on table public.jarvis_confirmaciones to service_role;

alter table public.pedidos add column if not exists regularizado_en timestamp;
alter table public.pedidos add column if not exists regularizado_por uuid;
