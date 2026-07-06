-- Rediseño POS "Tienda" — costo/utilidad por línea de venta.
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar el
-- código nuevo de app/pos/punto-venta y app/admin/punto-venta.

-- productos_tienda: foto de referencia para la búsqueda de productos en Tienda.
alter table productos_tienda add column if not exists imagen_url text;

-- ventas_tienda: costo por línea, origen, y auditoría del descuento aplicado.
alter table ventas_tienda add column if not exists costo_unitario numeric;
alter table ventas_tienda add column if not exists origen text
  check (origen in ('catalogo', 'manual_producto', 'manual_monto')) default 'catalogo';
alter table ventas_tienda add column if not exists descuento_tipo text
  check (descuento_tipo in ('percent', 'amount'));
alter table ventas_tienda add column if not exists descuento_valor numeric default 0;
alter table ventas_tienda alter column producto_id drop not null;

-- Auditoría de conciliación: quién y cuándo capturó el costo de una línea manual.
alter table ventas_tienda add column if not exists costo_conciliado_en timestamptz;
alter table ventas_tienda add column if not exists costo_conciliado_por uuid references clientes(id);

-- Nota: "por conciliar" se deriva de costo_unitario is null, no se guarda aparte.
-- Nota: precio_unitario (ya existente) sigue siendo el precio_venta efectivo por
-- unidad, con cualquier override/descuento de línea y el prorrateo del descuento
-- de venta ya aplicados — no se renombra para no romper
-- app/api/reportes/ventas-tienda/route.js.
