-- Conecta el Mercadito al cobro real: un pago puede atarse a un pedido de
-- Mercadito específico (igual que ya se ata a una entrega de Encargo), y se
-- agrega un estado "entregado" para distinguir "aprobado, pendiente de
-- cobrar" (agregado) de "ya se cobró y se lo llevó" (entregado). También se
-- corrige que una venta de tienda pagada con dos métodos pueda guardar el
-- vínculo a ambos pagos, no solo al segundo.
--
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar el
-- código nuevo de app/admin/mercadito, app/admin/punto-venta, app/pos/punto-venta
-- y app/api/mercadito/pedidos.

alter table pagos add column if not exists pedido_mercadito_id uuid references pedidos_mercadito(id);
create index if not exists idx_pagos_pedido_mercadito on pagos(pedido_mercadito_id);

alter table pedidos_mercadito drop constraint if exists pedidos_mercadito_estado_check;
alter table pedidos_mercadito add constraint pedidos_mercadito_estado_check
  check (estado in ($$nuevo$$, $$confirmado$$, $$esperando_anticipo$$, $$aprobado$$, $$agregado$$, $$entregado$$, $$cancelado$$));

alter table ventas_tienda add column if not exists pago_id_2 uuid references pagos(id);
