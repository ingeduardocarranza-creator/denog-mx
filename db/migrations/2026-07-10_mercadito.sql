-- Sección "Mercadito" — venta directa desde catálogo local.
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar el
-- código nuevo de app/mercadito, app/admin/mercadito y la sección
-- "Compras de tu Mercadito" del Estado de Cuenta.
--
-- Nota: los literales de texto usan comillas dobles de signo de pesos
-- ($$texto$$) en vez de comillas simples, para evitar el error de sintaxis
-- que da Postgres cuando el copiar/pegar convierte comillas rectas en
-- comillas tipográficas ("inteligentes").

-- Catálogo público de Mercadito (separado de productos_tienda, que es el
-- catálogo operativo del POS presencial).
create table if not exists productos_mercadito (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  categoria text,
  precio_venta numeric not null default 0,
  stock int not null default 0,
  imagen_url text,
  galeria text[],
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Folios legibles tipo "MK-1001".
create sequence if not exists mercadito_folio_seq start 1001;

create table if not exists pedidos_mercadito (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  cliente_id uuid references clientes(id),
  invitado_nombre text,
  invitado_telefono text,
  items jsonb not null default $$[]$$,
  estado text not null default $$nuevo$$
    check (estado in ($$nuevo$$, $$confirmado$$, $$esperando_anticipo$$, $$aprobado$$, $$agregado$$, $$cancelado$$)),
  anticipo_estado text
    check (anticipo_estado in ($$recibido$$, $$autorizado_sin_anticipo$$, $$esperando$$)),
  motivo_cancelacion text,
  historial jsonb not null default $$[]$$,
  notas_internas jsonb not null default $$[]$$,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table pedidos_mercadito alter column folio set default ($$MK-$$ || nextval($$mercadito_folio_seq$$));
alter table pedidos_mercadito add constraint pedidos_mercadito_folio_key unique (folio);

create index if not exists idx_pedidos_mercadito_cliente on pedidos_mercadito(cliente_id);
create index if not exists idx_pedidos_mercadito_estado on pedidos_mercadito(estado);

create table if not exists mercadito_resenas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_mercadito(id),
  cliente_id uuid not null references clientes(id),
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  creado_en timestamptz not null default now(),
  unique(producto_id, cliente_id)
);

-- Descuento/restitución atómica de stock, para evitar sobreventa cuando dos
-- clientes hacen checkout del mismo producto al mismo tiempo (el checkout lo
-- dispara el navegador del cliente, no personal interno).
create or replace function mercadito_descontar_stock(p_producto_id uuid, p_cantidad int)
returns boolean language plpgsql as $body$
declare
  v_rows int;
begin
  update productos_mercadito
  set stock = stock - p_cantidad
  where id = p_producto_id and stock >= p_cantidad;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$body$;

create or replace function mercadito_restituir_stock(p_producto_id uuid, p_cantidad int)
returns void language sql as $body$
  update productos_mercadito set stock = stock + p_cantidad where id = p_producto_id;
$body$;
