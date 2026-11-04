-- Comisiones de colaboradores por ventas propias ("es mi cliente").
-- El colaborador la marca en el punto de venta (venta o domicilio), el admin
-- la aprueba poniendo el % de utilidad, y el monto cae al monedero del colaborador
-- en Jarvis. El admin la marca pagada cuando entrega el dinero.
-- Sin llaves foráneas a clientes (evita relaciones ambiguas en PostgREST).
create table if not exists comisiones_colaborador (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null,
  origen text not null check (origen in ('venta','domicilio')),
  transaccion_id uuid,
  domicilio_id uuid,
  total_venta numeric not null default 0,
  utilidad numeric,
  porcentaje numeric,
  monto numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada','pagada')),
  nota text,
  creada_en timestamptz not null default now(),
  resuelta_por uuid,
  resuelta_en timestamptz,
  pagada_en timestamptz,
  pagada_por uuid
);
create unique index if not exists comisiones_unica_transaccion on comisiones_colaborador (transaccion_id) where transaccion_id is not null;
create unique index if not exists comisiones_unica_domicilio on comisiones_colaborador (domicilio_id) where domicilio_id is not null;
create index if not exists comisiones_estado_idx on comisiones_colaborador (estado, colaborador_id);
alter table comisiones_colaborador enable row level security;
grant all on table comisiones_colaborador to service_role;

-- Comisión por producto: cada producto puede tener su propio % de utilidad
-- (si queda vacío se usa el % estándar de jarvis_config). La solicitud guarda
-- el % que resulta de mezclar lo vendido, y el admin lo ajusta al aprobar.
alter table productos_tienda add column if not exists comision_pct numeric check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 100));
alter table comisiones_colaborador add column if not exists porcentaje_sugerido numeric;
create table if not exists jarvis_config (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table jarvis_config enable row level security;
grant all on table jarvis_config to service_role;
insert into jarvis_config (clave, valor) values ('comision_pct_default', '10'::jsonb) on conflict do nothing;
