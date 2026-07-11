-- Unifica el catálogo del Mercadito con el catálogo de Operaciones
-- (productos_tienda) — ya NO se usa una tabla de productos aparte para
-- Mercadito. El inventario vive en un solo lugar; cada producto tiene un
-- interruptor "Mostrar en Mercadito" para decidir si aparece en la tienda
-- pública en línea.
--
-- Importante: productos_tienda.id es un entero (no uuid, a diferencia de
-- productos_mercadito). Por eso mercadito_resenas.producto_id y las
-- funciones de stock cambian de tipo aquí.

alter table productos_tienda add column if not exists descripcion text;
alter table productos_tienda add column if not exists galeria text[];
alter table productos_tienda add column if not exists mostrar_en_mercadito boolean not null default false;

-- mercadito_resenas ahora califica productos de productos_tienda (id
-- entero) — se recrea vacía porque aún no hay reseñas reales.
drop table if exists mercadito_resenas;
create table mercadito_resenas (
  id uuid primary key default gen_random_uuid(),
  producto_id bigint not null references productos_tienda(id),
  cliente_id uuid not null references clientes(id),
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  creado_en timestamptz not null default now(),
  unique(producto_id, cliente_id)
);
grant select, insert, update, delete on mercadito_resenas to anon, authenticated, service_role;

-- Las funciones de descuento/restitución atómica de stock ahora operan
-- sobre productos_tienda (mismo inventario que usa el POS presencial) y
-- reciben un id entero, no uuid.
drop function if exists mercadito_descontar_stock(uuid, int);
drop function if exists mercadito_restituir_stock(uuid, int);

create function mercadito_descontar_stock(p_producto_id bigint, p_cantidad int)
returns boolean language plpgsql as $body$
declare
  v_rows int;
begin
  update productos_tienda
  set stock = stock - p_cantidad
  where id = p_producto_id and stock >= p_cantidad;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$body$;

create function mercadito_restituir_stock(p_producto_id bigint, p_cantidad int)
returns void language sql as $body$
  update productos_tienda set stock = stock + p_cantidad where id = p_producto_id;
$body$;

grant execute on function mercadito_descontar_stock(bigint, int) to anon, authenticated, service_role;
grant execute on function mercadito_restituir_stock(bigint, int) to anon, authenticated, service_role;

-- Ya no se usa: el catálogo del Mercadito ahora vive en productos_tienda.
drop table if exists productos_mercadito;
