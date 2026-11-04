create table if not exists public.jarvis_mensajes (
  usuario_id uuid not null,
  tipo text not null check (tipo in ('admin_manana','arranque','cierre')),
  fecha date not null,
  contenido jsonb not null,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  primary key (usuario_id, tipo, fecha)
);
alter table public.jarvis_mensajes enable row level security;
grant all on public.jarvis_mensajes to service_role;
