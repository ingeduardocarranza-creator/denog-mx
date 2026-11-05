-- Guarda cuántos días de entrega prometía la publicación al momento de la venta,
-- para calcular "tienes hasta tal día" cuando MercadoLibre no da la fecha límite.
alter table public.ml_venta_items add column if not exists dias_prometidos integer;

update public.ml_venta_items i
   set dias_prometidos = p.tiempo_preparacion
  from public.ml_publicaciones p
 where p.item_id = i.item_id
   and p.variacion_id = i.variacion_id
   and i.dias_prometidos is null;

update public.ml_venta_items i
   set dias_prometidos = (select p.tiempo_preparacion from public.ml_publicaciones p where p.item_id = i.item_id limit 1)
 where i.dias_prometidos is null;
