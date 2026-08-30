-- Registro de ventas por WhatsApp con preaprobación. Ver
-- claude/ventas-whatsapp-preaprobacion-diseno.md (proyecto "Sitio web Denog")
-- para el diseño completo.
--
-- Flujo: Eduardo reenvía desde su número personal, en dos mensajes separados,
-- lo que se vende en el grupo "compras del día" (foto con precio en pesos,
-- luego texto con cliente/costo en USD/piezas/talla). La IA extrae los datos
-- y los deja aquí mismo, en `pedidos`, como un borrador sin aprobar — nunca
-- se registra una venta sin que una persona la revise y apruebe.
--
-- Mismo patrón que ya usa el catálogo para "necesita revisión de admin"
-- (ver 2026-07-11_catalogo_aprobacion.sql): una columna en la propia tabla,
-- no una tabla de pendientes aparte. Así esto vive dentro de Encargos/Pedidos
-- y no se mezcla con los pendientes de WhatsApp (comprobantes, etc.), que
-- resuelven un problema distinto.
--
-- "Descartar" en el panel NO borra la fila — mismo motivo que
-- 2026-08-15_pendientes_descartados.sql: queda como rastro y como material
-- para revisar si la IA se está equivocando seguido con algo en concreto.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table pedidos add column if not exists pendiente_aprobacion boolean not null default false;
alter table pedidos add column if not exists creado_via text not null default 'manual';

alter table pedidos drop constraint if exists pedidos_creado_via_check;
alter table pedidos add constraint pedidos_creado_via_check
  check (creado_via in ('manual', 'whatsapp'));

-- Vista rápida de "Por aprobar" en el panel.
create index if not exists idx_pedidos_pendiente_aprobacion
  on pedidos(creado_en) where pendiente_aprobacion = true;

-- Lista blanca de números autorizados a registrar ventas por este medio.
-- Separada de `clientes` a propósito: el número de Eduardo (6623533906) ya
-- existe ahí como cuenta de prueba ("PRUEBA ANDANDO") con historial de
-- pedidos/pagos de pruebas anteriores — no se toca ese registro para no
-- arriesgar reportes o saldos de esa cuenta.
create table if not exists vendedores_whatsapp_ventas (
  telefono text primary key, -- a 10 dígitos, mismo formato que clientes.telefono
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

insert into vendedores_whatsapp_ventas (telefono, nombre)
values ('6623533906', 'Eduardo (número personal)')
on conflict (telefono) do nothing;

grant select, insert, update, delete on vendedores_whatsapp_ventas to anon, authenticated, service_role;

alter table vendedores_whatsapp_ventas enable row level security;
-- RLS activado, sin políticas: solo la llave de servicio puede leer/escribir,
-- mismo criterio que el resto de las tablas de WhatsApp.
