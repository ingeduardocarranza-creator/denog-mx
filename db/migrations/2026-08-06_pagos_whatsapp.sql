-- Permite aprobar comprobantes de transferencia del grupo de WhatsApp desde
-- /admin/pendientes y que queden en la misma tabla de pagos que usan
-- Mercadito y Encargos — incluso cuando el cliente no tiene cuenta en el
-- sitio (la venta por grupo de WhatsApp es un canal aparte). Ver
-- docs/PLAN.md, sección B4.
--
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar el
-- botón "Aprobar pago" de app/admin/pendientes.

alter table pagos alter column cliente_id drop not null;
alter table pagos add column if not exists nombre_suelto text;
alter table pagos add column if not exists telefono_suelto text;
alter table pagos add column if not exists pendiente_id uuid references pendientes(id);

create index if not exists idx_pagos_pendiente on pagos(pendiente_id);
