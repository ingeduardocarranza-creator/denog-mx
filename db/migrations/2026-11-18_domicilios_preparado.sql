-- Preparación del domicilio: lo agenda el admin y lo prepara quien empaca.
alter table public.domicilios add column if not exists preparado boolean not null default false;
alter table public.domicilios add column if not exists preparado_en timestamptz;
