-- Variantes: cada variante es un artículo normal de productos_tienda (con su
-- propio costo, precio, stock y código). grupo_id apunta al artículo "cabeza"
-- del grupo; la cabeza tiene grupo_id null. variante es la etiqueta corta
-- ("Talla M · Azul"). Sin ON DELETE: no se puede borrar una cabeza que aún
-- tiene variantes. (Ya aplicada en Supabase el 16 oct 2026.)
alter table productos_tienda add column if not exists grupo_id bigint references productos_tienda(id);
alter table productos_tienda add column if not exists variante text;
create index if not exists productos_tienda_grupo_id_idx on productos_tienda(grupo_id) where grupo_id is not null;
