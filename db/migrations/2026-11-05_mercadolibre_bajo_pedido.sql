-- MercadoLibre: la mayoría de las publicaciones NO están en el catálogo porque
-- se compran hasta que se venden ("bajo pedido"). Eso es normal, no un
-- problema a revisar. Estados de liga_estado:
--   ligada       → la publicación está ligada a un producto del catálogo
--   bajo_pedido  → no está en el catálogo; se compra cuando se vende
--   ambigua      → su SKU coincide con varios productos del catálogo (revisar)
alter table public.ml_publicaciones alter column liga_estado set default 'bajo_pedido';
update public.ml_publicaciones set liga_estado = 'bajo_pedido' where liga_estado in ('sin_sku','sin_coincidencia') and liga_manual = false;
