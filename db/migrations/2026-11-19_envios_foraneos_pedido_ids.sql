-- Envíos foráneos: guardar qué piezas (pedidos) viajan en cada envío, para
-- que un cliente deje de aparecer como "pendiente de enviar" una vez que
-- sus piezas ya van en un envío activo (borrador, aprobado o notificado).
alter table public.envios_foraneos
  add column if not exists pedido_ids uuid[] not null default '{}';
