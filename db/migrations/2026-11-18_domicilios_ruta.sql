-- Domicilios: datos completos + coordenadas para armar la ruta del día.
-- Todo es aditivo y nullable: los domicilios y direcciones existentes no cambian.

-- 1) Domicilios: ubicación, horario estructurado y datos de acceso
alter table public.domicilios
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocodificado_en timestamptz,
  add column if not exists direccion_id bigint,            -- dirección guardada que se usó (la copia en texto se conserva)
  add column if not exists hora_exacta time,               -- solo si el cliente exige hora; si es null manda la ventana de "horario"
  add column if not exists recibe_nombre text,
  add column if not exists entre_calles text,
  add column if not exists instrucciones_acceso text,
  add column if not exists orden_ruta integer;             -- orden manual (null = automático)

-- 2) Direcciones guardadas: coordenadas, principal y soporte para clientes externos
alter table public.direcciones_clientes
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists es_principal boolean not null default false,
  add column if not exists recibe_nombre text,
  add column if not exists entre_calles text,
  add column if not exists instrucciones_acceso text,
  add column if not exists telefono_externo text,          -- cliente externo del POS (sin cuenta): se identifica por teléfono
  add column if not exists nombre_externo text;

alter table public.direcciones_clientes alter column cliente_id drop not null;

alter table public.direcciones_clientes
  drop constraint if exists direcciones_clientes_dueno_chk;
alter table public.direcciones_clientes
  add constraint direcciones_clientes_dueno_chk
  check (cliente_id is not null or telefono_externo is not null);

create index if not exists direcciones_clientes_tel_ext_idx
  on public.direcciones_clientes (telefono_externo) where telefono_externo is not null;
create index if not exists domicilios_fecha_estado_idx
  on public.domicilios (fecha_preferida, estado);
