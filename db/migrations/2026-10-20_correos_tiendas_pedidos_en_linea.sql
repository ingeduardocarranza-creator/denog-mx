-- Gmail de las tiendas: avisos de pedido → Paquetes Nogales; boletines → Ofertas.
-- Ya aplicada en Supabase el 20 oct 2026.

-- Cada correo leído del Gmail de las tiendas, una sola vez.
create table if not exists public.correos_procesados (
  message_id  text primary key,
  tipo        text not null,          -- promocion | pedido | otro
  tienda      text,
  asunto      text,
  fecha       timestamptz,
  procesado_en timestamptz not null default now()
);
alter table public.correos_procesados enable row level security;
grant all on public.correos_procesados to service_role;

-- Pedidos hechos en línea, según los avisos de la tienda (confirmado,
-- enviado, entregado). Uno por envío: un pedido con 2 guías = 2 filas.
create table if not exists public.pedidos_en_linea (
  id             uuid primary key default gen_random_uuid(),
  tienda         text not null,
  numero_pedido  text not null,
  guia           text not null default '',   -- normalizada con limpiarGuia; '' = sin guía aún
  paqueteria     text,
  estado         text not null default 'confirmado',  -- confirmado | enviado | en_reparto | entregado | listo_pickup | cancelado
  productos      jsonb not null default '[]',
  total_usd      numeric,
  fecha_estimada date,
  entregado_en   timestamptz,               -- cuando la tienda dijo "entregado"
  primer_correo  timestamptz,
  ultimo_correo  timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (tienda, numero_pedido, guia)
);
alter table public.pedidos_en_linea enable row level security;
grant all on public.pedidos_en_linea to service_role;
create index if not exists pedidos_en_linea_guia on public.pedidos_en_linea (guia) where guia <> '';
create index if not exists pedidos_en_linea_reciente on public.pedidos_en_linea (ultimo_correo desc);
