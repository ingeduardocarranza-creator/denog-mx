-- Clasificación del empaque de cada pedido para que el POS muestre de
-- inmediato en qué tipo de bolsa viene el pedido del cliente y así se
-- encuentre más rápido entre los 200+ pedidos de una entrega.
--
-- 'chico':   bolsa blanca o de cartón.
-- 'mediano': bolsa blanca.
-- 'grande':  bolsa de plástico TJ Maxx.
--
-- Se guarda por pedido (no por cliente) porque la tabla pedidos es la única
-- unidad que existe hoy; al marcar a un cliente como empacado en
-- /admin/empacado se escribe el mismo valor en todos sus artículos de esa
-- entrega, así que en la práctica queda uniforme por cliente+entrega.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table pedidos
  add column tipo_empaque text check (tipo_empaque in ('chico', 'mediano', 'grande'));
