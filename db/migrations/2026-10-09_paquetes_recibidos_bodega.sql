-- Bodega Nogales: registro de paquetes recibidos (guía + hasta 3 fotos).
-- El usuario con rol 'bodega' solo ve /bodega; el admin lo revisa en
-- /admin/paquetes-nogales. Solo registra: no se liga a pedidos.

create table if not exists public.paquetes_recibidos (
  id                  uuid primary key default gen_random_uuid(),
  numero_guia         text not null,
  paqueteria          text,
  fotos               text[] not null default '{}',
  notas               text,
  recibido_por        uuid references public.clientes(id),
  recibido_por_nombre text,
  recibido_en         timestamptz not null default now()
);

-- Una guía solo se registra una vez (sin importar mayúsculas/espacios).
create unique index if not exists paquetes_recibidos_guia_unica
  on public.paquetes_recibidos (upper(regexp_replace(numero_guia, '\s', '', 'g')));
create index if not exists paquetes_recibidos_recibido_en
  on public.paquetes_recibidos (recibido_en desc);

alter table public.paquetes_recibidos enable row level security;
grant all on public.paquetes_recibidos to service_role;

drop trigger if exists bitacora_paquetes_recibidos on public.paquetes_recibidos;
create trigger bitacora_paquetes_recibidos
  after insert or delete or update on public.paquetes_recibidos
  for each row execute function registrar_en_bitacora();

-- Fotos de evidencia: bucket privado, se ven con URL firmada desde el admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencia-paquetes', 'evidencia-paquetes', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
