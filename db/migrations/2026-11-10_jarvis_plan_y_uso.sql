-- Jarvis: plan de trabajo del admin (tareas puntuales con prioridad), meta de venta y registro de uso.
-- Ya aplicada en Supabase (jarvis_plan_y_uso). Aditiva: no cambia ni borra nada existente.
create table if not exists public.jarvis_tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  emoji text not null default '📌',
  prioridad smallint not null default 2 check (prioridad in (1,2,3)), -- 1 alta, 2 media, 3 baja
  es_venta boolean not null default false,
  para_usuario uuid,            -- null = todos los colaboradores
  fecha_limite date,
  xp integer not null default 20,
  activa boolean not null default true,
  creada_por uuid,
  creada_en timestamptz not null default now()
);
create table if not exists public.jarvis_tareas_hechas (
  tarea_id uuid not null references public.jarvis_tareas(id) on delete cascade,
  usuario_id uuid not null,
  hecha_en timestamptz not null default now(),
  xp integer not null default 0,
  primary key (tarea_id, usuario_id)
);
create table if not exists public.jarvis_aperturas (
  usuario_id uuid not null,
  fecha date not null,
  aperturas integer not null default 1,
  primera_en timestamptz not null default now(),
  ultima_en timestamptz not null default now(),
  primary key (usuario_id, fecha)
);
alter table public.jarvis_plantillas add column if not exists es_venta boolean not null default false;
update public.jarvis_plantillas set es_venta = true where para = 'colaborador' and verif in ('seguimientos','entregas');
alter table public.jarvis_tareas enable row level security;
alter table public.jarvis_tareas_hechas enable row level security;
alter table public.jarvis_aperturas enable row level security;
grant all on public.jarvis_tareas to service_role;
grant all on public.jarvis_tareas_hechas to service_role;
grant all on public.jarvis_aperturas to service_role;
