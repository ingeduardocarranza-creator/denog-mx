-- Bodega Nogales: paquetes SIN guía (delivery en bolsa de Walmart, pickup en
-- tienda). Se registran con tienda + foto(s) en lugar de número de guía.
-- Aplicada en Supabase el 11 oct 2026.

alter table public.paquetes_recibidos alter column numero_guia drop not null;
alter table public.paquetes_recibidos add column if not exists tipo text not null default 'guia';
alter table public.paquetes_recibidos add column if not exists tienda text;
alter table public.paquetes_recibidos drop constraint if exists paquetes_recibidos_tipo_check;
alter table public.paquetes_recibidos add constraint paquetes_recibidos_tipo_check
  check (tipo in ('guia', 'delivery', 'pickup') and (tipo <> 'guia' or numero_guia is not null));
