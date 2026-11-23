-- Cuenta de tienda por cliente: artículos del catálogo que el cliente apartó.
-- No dependen de una fecha de entrega: el cliente pasa cuando quiere.
--
--   apartado  → ya salió del stock; el cliente todavía no lo recoge.
--   entregado → se cobró y se entregó en el POS (nacen las ventas_tienda con
--               costo y precio final; ahí se cuenta la utilidad).
--   liberado  → pasaron 30 días y el admin lo liberó: el stock regresa al
--               catálogo y el anticipo de ese artículo pasa a utilidad.
--
-- El anticipo de tienda se guarda en `pagos` con tipo 'Anticipo Tienda' (no
-- 'Anticipo'): así el POS, Anticipos, envíos foráneos, Jarvis y la app móvil,
-- que leen tipo = 'Anticipo', nunca lo confunden con un anticipo de encargo.

create table if not exists public.apartados_tienda (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  producto_id       bigint references public.productos_tienda(id) on delete set null,
  nombre_producto   text not null,
  categoria         text,
  cantidad          integer not null check (cantidad > 0),
  precio_catalogo   numeric not null default 0,   -- el del catálogo al apartar
  precio_unitario   numeric not null,             -- el que se le cobra (remate = menor)
  costo_unitario    numeric,                      -- foto del costo al apartar
  autorizado_por    text,                         -- quién autorizó un descuento grande
  estado            text not null default 'apartado'
                    check (estado in ('apartado', 'entregado', 'liberado')),
  creado_en         timestamp without time zone not null default timezone('America/Hermosillo', now()),
  creado_por        uuid references public.clientes(id) on delete set null,
  entregado_en      timestamp without time zone,
  pago_id           uuid references public.pagos(id) on delete set null,  -- el cobro al entregar
  liberado_en       timestamp without time zone,
  liberado_por      uuid references public.clientes(id) on delete set null,
  aviso_visto_en    timestamp without time zone
);

create index if not exists apartados_tienda_cliente on public.apartados_tienda (cliente_id);
create index if not exists apartados_tienda_estado on public.apartados_tienda (estado, creado_en);

alter table public.apartados_tienda enable row level security;
-- Lección del proyecto: una tabla nueva no trae permisos para service_role.
grant select, insert, update, delete on public.apartados_tienda to service_role;

-- Un anticipo de tienda se liga al artículo que paga.
alter table public.pagos add column if not exists apartado_id uuid references public.apartados_tienda(id);
-- pagos_cancelados guarda la fila completa de pagos al cancelar (ver DELETE de
-- /api/anticipos): sin esta columna, cancelar un anticipo de tienda tronaría.
alter table public.pagos_cancelados add column if not exists apartado_id uuid;
create index if not exists pagos_apartado on public.pagos (apartado_id) where apartado_id is not null;

-- Apartar: baja el stock y crea el renglón en un solo paso, con el producto
-- bloqueado (FOR UPDATE) para no pisar una venta que entra al mismo tiempo.
create or replace function public.apartar_producto(
  p_cliente uuid, p_producto bigint, p_cantidad integer,
  p_precio numeric, p_autorizado text, p_por uuid
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  prod productos_tienda%rowtype;
  nuevo uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  select * into prod from productos_tienda where id = p_producto for update;
  if not found then
    raise exception 'El producto no existe';
  end if;
  if coalesce(prod.stock, 0) < p_cantidad then
    raise exception 'Sin stock suficiente: quedan %', coalesce(prod.stock, 0);
  end if;
  update productos_tienda set stock = coalesce(stock, 0) - p_cantidad where id = p_producto;
  insert into apartados_tienda
    (cliente_id, producto_id, nombre_producto, categoria, cantidad,
     precio_catalogo, precio_unitario, costo_unitario, autorizado_por, creado_por)
  values
    (p_cliente, prod.id, prod.nombre, prod.categoria, p_cantidad,
     coalesce(prod.precio_venta, 0), coalesce(p_precio, prod.precio_venta, 0),
     prod.costo, nullif(trim(coalesce(p_autorizado, '')), ''), p_por)
  returning id into nuevo;
  return nuevo;
end;
$$;

-- Liberar: el stock regresa al catálogo y el artículo queda liberado. El dinero
-- del anticipo no se mueve de `pagos`; el reporte lo cuenta como utilidad.
create or replace function public.liberar_apartado(p_id uuid, p_por uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  a apartados_tienda%rowtype;
begin
  select * into a from apartados_tienda where id = p_id for update;
  if not found then
    raise exception 'El apartado no existe';
  end if;
  if a.estado <> 'apartado' then
    raise exception 'Este artículo ya está %', a.estado;
  end if;
  if a.producto_id is not null then
    update productos_tienda set stock = coalesce(stock, 0) + a.cantidad where id = a.producto_id;
  end if;
  update apartados_tienda
     set estado = 'liberado',
         liberado_en = timezone('America/Hermosillo', now()),
         liberado_por = p_por
   where id = p_id;
end;
$$;

revoke execute on function public.apartar_producto(uuid, bigint, integer, numeric, text, uuid) from public, anon, authenticated;
revoke execute on function public.liberar_apartado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apartar_producto(uuid, bigint, integer, numeric, text, uuid) to service_role;
grant execute on function public.liberar_apartado(uuid, uuid) to service_role;
