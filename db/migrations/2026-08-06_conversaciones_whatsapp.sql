-- Estado de cada conversación de WhatsApp: cuándo escribió el cliente por
-- última vez y cuándo le contestó alguien del equipo (incluye ecos de
-- mensajes mandados desde el celular, coexistencia). Con esto se detecta
-- "sin_responder" sin tener que releer todo el historial cada vez, y se
-- cierra solo cuando el cliente vuelve a escribir o alguien contesta.
-- Ver docs/PLAN.md, sección B5.
--
-- También crea el bucket privado donde se guardan las imágenes que manda
-- el cliente (comprobantes, fotos de pedidos de otra tienda) — privado
-- porque pueden traer datos bancarios. app/api/pendientes firma URLs
-- temporales para mostrarlas en el admin.
--
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar
-- app/api/whatsapp/webhook.

create table conversaciones_whatsapp (
  telefono_whatsapp text primary key,
  nombre_whatsapp text,
  cliente_id uuid references clientes(id),
  ultimo_mensaje_cliente_en timestamptz,
  ultimo_mensaje_cliente_wa_id text,
  ultima_respuesta_staff_en timestamptz,
  actualizado_en timestamptz not null default now()
);

grant select, insert, update, delete on conversaciones_whatsapp to anon, authenticated, service_role;

-- RLS activado, sin políticas: solo la llave de servicio puede leer/escribir.
alter table conversaciones_whatsapp enable row level security;

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;
