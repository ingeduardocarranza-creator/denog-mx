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

-- Funciones SECURITY DEFINER que cualquiera con el anon key podía ejecutar
-- por /rest/v1/rpc (aplicar_conteo_inventario podía cambiar el inventario).
-- Solo el servidor las usa: se les quita a anon/authenticated.
revoke execute on function public.aplicar_conteo_inventario(uuid, bigint, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.siguiente_folio(text, text) from public, anon, authenticated;
revoke execute on function public.asignar_folio() from public, anon, authenticated;
revoke execute on function public.impedir_borrar_pago() from public, anon, authenticated;
revoke execute on function public.registrar_en_bitacora() from public, anon, authenticated;
grant execute on function public.aplicar_conteo_inventario(uuid, bigint, integer, text, uuid) to service_role;
grant execute on function public.siguiente_folio(text, text) to service_role;
grant execute on function public.asignar_folio() to service_role;
grant execute on function public.impedir_borrar_pago() to service_role;
grant execute on function public.registrar_en_bitacora() to service_role;

alter function public.generar_codigo_recoleccion() set search_path = public;
alter function public.trg_asignar_codigo_recoleccion() set search_path = public;
alter function public.impedir_comprobante_resuelto_sin_pago() set search_path = public;
alter function public.publicar_en_mercadito_si_hay_stock() set search_path = public;

-- Ofertas del día: lo que se lee de los sitios de ofertas (Hip2Save, DealNews,
-- Costco Insider) ya clasificado por la IA. Una fila por oferta vista; las
-- que no sirven quedan con util=false para no volver a pagarlas.
create table if not exists public.ofertas (
  id            uuid primary key default gen_random_uuid(),
  fuente        text not null,
  guid          text not null,
  titulo_original text,
  url_fuente    text,
  url           text,
  imagen_url    text,
  publicado_fuente timestamptz,
  procesada     boolean not null default false,
  util          boolean,
  tienda        text,
  nombre        text,
  precio_usd    numeric,
  precio_antes_usd numeric,
  tipo          text,
  familia       text,
  temporadas    text[] not null default '{}',
  gancho        text,
  publicado     boolean not null default false,
  descartado    boolean not null default false,
  creado_en     timestamptz not null default now(),
  unique (fuente, guid)
);
alter table public.ofertas enable row level security;
grant all on public.ofertas to service_role;
create index if not exists ofertas_recientes on public.ofertas (creado_en desc) where util and not descartado;

-- Tallas y colores para el texto de WhatsApp (título, color, tallas, precio).
alter table public.ofertas add column if not exists tallas text, add column if not exists colores text;

-- Medir qué se vende: cuándo se publicó cada oferta, y qué pedidos por
-- WhatsApp traen su título en el texto de la foto (pedidos.notas).
alter table public.ofertas add column if not exists publicado_en timestamptz;

create or replace function public.tendencias_resultados(p_desde timestamptz)
returns table(oferta_id uuid, pedidos int, piezas int, utilidad numeric)
language sql stable
set search_path = public
as $$
  select o.id, count(p.id)::int, coalesce(sum(coalesce(p.cantidad, 1)), 0)::int, coalesce(sum(p.utilidad), 0)
  from ofertas o
  join pedidos p
    on p.creado_via = 'whatsapp'
   and p.notas is not null
   and p.creado_en >= (o.creado_en - interval '1 day')::timestamp
   and position(lower(o.nombre) in lower(p.notas)) > 0
  where o.publicado and o.creado_en >= p_desde and length(o.nombre) >= 12
  group by o.id
$$;
revoke execute on function public.tendencias_resultados(timestamptz) from public, anon, authenticated;
grant execute on function public.tendencias_resultados(timestamptz) to service_role;

-- Link directo a la tienda (producto exacto o búsqueda en esa tienda).
alter table public.ofertas add column if not exists url_tienda text, add column if not exists enlace_tipo text;
