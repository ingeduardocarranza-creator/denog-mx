-- Catálogo de WhatsApp (Commerce Manager: "Denog Catálogo").
-- denog.mx sube los productos activos con stock y los baja solos cuando se
-- agotan o se desactivan. Esta tabla recuerda qué producto ya está arriba y con
-- qué contenido, para mandar solo lo que cambió.
-- Ver lib/whatsapp/catalogo.js y /api/cron/whatsapp-catalogo.

create table if not exists whatsapp_catalogo_items (
  producto_id   bigint primary key,
  retailer_id   text not null,
  -- Huella del contenido enviado (nombre, precio, foto…): si cambia, se reenvía.
  huella        text not null,
  estado        text not null default 'subido' check (estado in ('subido', 'error', 'bajado')),
  error         text,
  subido_en     timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table whatsapp_catalogo_items enable row level security;

-- Lección del proyecto: una tabla nueva no trae permisos para service_role.
grant select, insert, update, delete on public.whatsapp_catalogo_items to service_role;

-- Bitácora: una fila por corrida (manual o automática).
create table if not exists whatsapp_catalogo_corridas (
  id            bigint generated always as identity primary key,
  ejecutado_en  timestamptz not null default now(),
  origen        text not null default 'cron',
  elegibles     int not null default 0,
  subidos       int not null default 0,
  bajados       int not null default 0,
  sin_cambio    int not null default 0,
  omitidos_foto int not null default 0,
  errores       int not null default 0,
  detalle       text
);

alter table whatsapp_catalogo_corridas enable row level security;
grant select, insert, update, delete on public.whatsapp_catalogo_corridas to service_role;
grant usage, select on all sequences in schema public to service_role;
