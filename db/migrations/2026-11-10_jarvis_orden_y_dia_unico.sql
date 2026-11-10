-- Actividades de un solo día (dinámicas, ej. paquetería) y orden manual por colaborador.
alter table public.jarvis_tareas add column if not exists dia_unico date;
create table if not exists public.jarvis_orden_equipo (
  usuario_id uuid not null,
  item text not null,
  posicion integer not null,
  primary key (usuario_id, item)
);
alter table public.jarvis_orden_equipo enable row level security;
grant all on public.jarvis_orden_equipo to service_role;
