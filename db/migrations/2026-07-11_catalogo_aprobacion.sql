-- Catálogo: flujo de aprobación para productos agregados/editados por
-- colaboradores desde su menú restringido (solo nombre, categoría, código
-- de barras, fotos y descripción — costo/precio/stock los completa admin).
alter table productos_tienda add column if not exists pendiente_aprobacion boolean not null default false;
alter table productos_tienda add column if not exists creado_por uuid references clientes(id);
