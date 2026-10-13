-- Cobranza: seguimiento por cliente de lo que tiene en tienda sin pagar.
--
-- Una fila por cliente (solo si alguna vez se le pausó o se le anotó una
-- promesa). Lo demás -- saldo, entregas vencidas, último recordatorio, si
-- contestó -- se calcula al vuelo desde pedidos, pagos, entregas,
-- whatsapp_envios y whatsapp_ventana. Solo lo usa el admin, por API.

create table if not exists public.cobranza_seguimiento (
  cliente_id       uuid primary key references public.clientes(id) on delete cascade,
  -- "Pausar hasta": el cliente avisó que no puede venir (fuera de la ciudad,
  -- etc). Mientras pausado_hasta >= hoy no se le manda recordatorio.
  pausado_hasta    date,
  pausa_nota       text,
  -- "Paso el viernes": si llega esa fecha y sigue debiendo, la pantalla lo
  -- marca como promesa incumplida.
  promesa_fecha    date,
  promesa_nota     text,
  actualizado_por  uuid references public.clientes(id),
  actualizado_en   timestamptz not null default now()
);

alter table public.cobranza_seguimiento enable row level security;
grant all on public.cobranza_seguimiento to service_role;

-- La bitácora de envíos de WhatsApp ahora también guarda los recordatorios
-- de cobranza.
alter table public.whatsapp_envios drop constraint if exists whatsapp_envios_tipo_check;
alter table public.whatsapp_envios add constraint whatsapp_envios_tipo_check
  check (tipo = any (array['ticket'::text, 'estado_cuenta'::text, 'recordatorio'::text]));

create index if not exists whatsapp_envios_recordatorio_cliente
  on public.whatsapp_envios (cliente_id, creado_en desc) where tipo = 'recordatorio';
