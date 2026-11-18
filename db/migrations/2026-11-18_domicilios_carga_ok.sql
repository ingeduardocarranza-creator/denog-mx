-- Lista de carga: claves de los productos ya cargados al carro por domicilio.
alter table public.domicilios add column if not exists carga_ok jsonb not null default '[]'::jsonb;
