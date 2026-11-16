-- Reenvío programado de la venta por WhatsApp (Admin → Reenvío WhatsApp).
-- El agente de Claude en la Mac lee estas tablas cada mañana, reenvía desde
-- los grupos privados "Mensajes fijos" y "Publicaciones ventas" a los grupos
-- de compras y al Estado, y anota el resultado en whatsapp_reenvio_envios.
-- Ver claude/manual-reenvio-whatsapp-grupos.md.

create table if not exists whatsapp_reenvio_config (
  id                int primary key default 1 check (id = 1),
  pausado           boolean not null default false,
  hora_default      time not null default '08:30',
  destino_grupo1    boolean not null default true,
  destino_grupo2    boolean not null default true,
  destino_estado    boolean not null default true,
  -- Lo llena el agente al revisar el buzón (aviso de la noche y envío).
  buzon_pendientes  int,
  buzon_revisado_en timestamptz,
  actualizado_en    timestamptz not null default now()
);
insert into whatsapp_reenvio_config (id) values (1) on conflict (id) do nothing;

-- Un renglón por día marcado como "hay venta". Quitar el día = borrar el renglón.
create table if not exists whatsapp_reenvio_dias (
  fecha     date primary key,
  hora      time not null default '08:30',
  creado_en timestamptz not null default now()
);

-- Bitácora: una fila por ejecución del agente (envió, no había productos, falló…).
create table if not exists whatsapp_reenvio_envios (
  id           bigint generated always as identity primary key,
  ejecutado_en timestamptz not null default now(),
  fecha        date not null,
  resultado    text not null check (resultado in ('enviado', 'sin_productos', 'fallo', 'pausado', 'aviso')),
  fijos        int not null default 0,
  productos    int not null default 0,
  destinos     text[] not null default '{}',
  detalle      text,
  -- Hasta dónde se reenvió: texto y hora del último producto enviado, para
  -- que el siguiente envío empiece en el mensaje que sigue.
  marcador     text
);
create index if not exists whatsapp_reenvio_envios_fecha_idx on whatsapp_reenvio_envios (ejecutado_en desc);

-- Solo se leen y escriben desde el servidor (service role) y desde el agente.
alter table whatsapp_reenvio_config enable row level security;
alter table whatsapp_reenvio_dias   enable row level security;
alter table whatsapp_reenvio_envios enable row level security;
