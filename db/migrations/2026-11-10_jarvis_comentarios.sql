-- Retroalimentación del admin a cada colaborador, por día (la ve en su pantalla).
create table if not exists public.jarvis_comentarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  fecha date not null,
  valoracion smallint check (valoracion between 1 and 3),
  comentario text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  unique (usuario_id, fecha)
);
alter table public.jarvis_comentarios enable row level security;
grant all on public.jarvis_comentarios to service_role;
