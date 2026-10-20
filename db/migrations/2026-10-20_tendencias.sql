-- Tendencias: qué publicar en el grupo de WhatsApp.
-- Ya aplicada en Supabase el 20 oct 2026.

-- Tablas que estaban expuestas al anon key (RLS apagado). Todas se usan solo
-- desde el servidor con service_role, que ignora RLS: activarlo sin políticas
-- cierra el acceso desde el navegador sin romper nada.
alter table public.gastos enable row level security;
alter table public.pendientes_sin_responder_archivo enable row level security;
alter table public.respaldo_pedidos_cant_20260905 enable row level security;
alter table public.respaldo_pagos_repuestos_20260906 enable row level security;
alter table public.respaldo_ajustes_historicos_20260906 enable row level security;
alter table public.respaldo_pagos_desde_comprobante_20260906 enable row level security;
alter table public.respaldo_reatribuciones_20260907 enable row level security;
alter table public.respaldo_pedidos_cant_20260917 enable row level security;
grant all on public.gastos to service_role;

-- Una fila por descripción distinta de producto (no por pedido). La llena la
-- IA desde /admin/tendencias → "Etiquetar con IA".
create table if not exists public.producto_etiquetas (
  descripcion_norm text primary key,   -- descripción en minúsculas y sin espacios dobles
  tipo        text,                     -- "Body mist", "Leggings", "Café molido"…
  marca       text,
  familia     text,
  temporadas  text[] not null default '{}',  -- llaves de lib/tendencias/comun.js
  etiquetado_en timestamptz not null default now()
);
alter table public.producto_etiquetas enable row level security;
grant all on public.producto_etiquetas to service_role;

-- Cada lista generada con búsqueda en internet.
create table if not exists public.tendencias_listas (
  id          uuid primary key default gen_random_uuid(),
  creado_en   timestamptz not null default now(),
  creado_por  uuid references public.clientes(id),
  enfoque     text,
  productos   jsonb not null default '[]',
  publicados  text[] not null default '{}',  -- claves de productos marcados "ya lo publiqué"
  busquedas   integer
);
alter table public.tendencias_listas enable row level security;
grant all on public.tendencias_listas to service_role;
create index if not exists tendencias_listas_creado on public.tendencias_listas (creado_en desc);
