-- Tareas del plan que exigen evidencia fotográfica para marcarse hechas.
alter table public.jarvis_tareas add column if not exists requiere_foto boolean not null default false;
alter table public.jarvis_tareas_hechas add column if not exists foto_url text;
