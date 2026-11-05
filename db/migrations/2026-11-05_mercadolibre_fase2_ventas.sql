-- MercadoLibre · Fase 2: ventas, lista "Por comprar" y empaque con doble escaneo.
--
-- ml_ventas: una fila por orden de MercadoLibre. Las órdenes que comparten envío
--   (mismo shipment_id) forman un "paquete" y se empacan juntas.
-- ml_venta_items: los productos de cada orden y su estado
--   (reservado | por_comprar | comprado | disponible | empacado | cancelado).
--   NO guarda datos del comprador: los colaboradores nunca ven clientes ni precios.
-- ml_fichas_compra: dónde se compra cada publicación (tienda, enlace, costo en USD).
-- ml_codigos_producto: códigos de barras confirmados para productos que no están
--   en el catálogo (se aprenden con el primer escaneo confirmado).
-- ml_eventos: bitácora de lo que pasa (compra, escaneo, descuento de stock).
--
-- Reglas:
--  * Nunca se crea ni modifica un producto del catálogo desde aquí.
--  * El stock del catálogo solo se descuenta al TERMINAR el paquete
--    (ml_empacar_paquete), y solo de productos que estaban en stock al vender.
--  * Todo es solo-servidor (RLS prendido, sin políticas).

alter table public.ml_notificaciones add column if not exists proc_intentos integer not null default 0;

create table if not exists public.ml_ventas (
  id                     bigserial primary key,
  order_id               bigint not null unique,
  pack_id                bigint,
  shipment_id            bigint,
  paquete                text not null,
  estado_orden           text,
  fecha_venta            timestamptz,
  envio_estado           text,
  envio_subestado        text,
  tipo_logistica         text,
  limite_despacho        timestamptz,
  etiqueta_lista         boolean not null default false,
  etiqueta_disponible_en timestamptz,
  empaque_estado         text not null default 'pendiente',   -- pendiente | empacada | cancelada
  empacada_en            timestamptz,
  empacada_por           text,
  creada_en              timestamptz not null default now(),
  actualizada_en         timestamptz not null default now()
);
create index if not exists ml_ventas_paquete_idx on public.ml_ventas (paquete);
create index if not exists ml_ventas_empaque_idx on public.ml_ventas (empaque_estado);

create table if not exists public.ml_venta_items (
  id                  bigserial primary key,
  venta_id            bigint not null references public.ml_ventas(id) on delete cascade,
  item_id             text not null,
  variacion_id        bigint not null default 0,
  titulo              text,
  sku                 text,
  miniatura           text,
  cantidad            integer not null default 1,
  precio_unitario     numeric,
  producto_id         bigint references public.productos_tienda(id) on delete set null,
  origen              text not null default 'compra',          -- stock | compra
  estado              text not null default 'por_comprar',
  cantidad_reservada  integer not null default 0,
  urgente             boolean not null default false,
  cantidad_escaneada  integer not null default 0,
  comprado_en         timestamptz,
  comprado_por        text,
  llego_en            timestamptz,
  unique (venta_id, item_id, variacion_id)
);
create index if not exists ml_venta_items_estado_idx on public.ml_venta_items (estado);
create index if not exists ml_venta_items_producto_idx on public.ml_venta_items (producto_id);

create table if not exists public.ml_fichas_compra (
  item_id        text not null,
  variacion_id   bigint not null default 0,
  tienda         text,
  enlace_compra  text,
  costo_usd      numeric,
  notas          text,
  actualizada_en timestamptz not null default now(),
  primary key (item_id, variacion_id)
);

create table if not exists public.ml_codigos_producto (
  item_id       text not null,
  variacion_id  bigint not null default 0,
  codigo        text not null,
  confirmado_por text,
  creado_en     timestamptz not null default now(),
  primary key (item_id, variacion_id, codigo)
);

create table if not exists public.ml_eventos (
  id        bigserial primary key,
  venta_id  bigint references public.ml_ventas(id) on delete set null,
  paquete   text,
  tipo      text not null,
  detalle   jsonb,
  hecho_por text,
  hecho_en  timestamptz not null default now()
);
create index if not exists ml_eventos_paquete_idx on public.ml_eventos (paquete);

alter table public.ml_ventas enable row level security;
alter table public.ml_venta_items enable row level security;
alter table public.ml_fichas_compra enable row level security;
alter table public.ml_codigos_producto enable row level security;
alter table public.ml_eventos enable row level security;

grant all on public.ml_ventas, public.ml_venta_items, public.ml_fichas_compra,
             public.ml_codigos_producto, public.ml_eventos to service_role;
grant usage, select on sequence public.ml_ventas_id_seq, public.ml_venta_items_id_seq,
                                public.ml_eventos_id_seq to service_role;

-- Termina un paquete: descuenta del catálogo (de un solo golpe y sin dejar
-- negativos) lo que estaba en stock, y marca todo como empacado.
create or replace function public.ml_empacar_paquete(p_paquete text, p_por text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_n integer;
  v_desc jsonb := '[]'::jsonb;
begin
  select count(*) into v_n from ml_ventas where paquete = p_paquete and empaque_estado = 'pendiente';
  if v_n = 0 then
    raise exception 'Ese paquete ya fue empacado o no existe';
  end if;

  if exists (
    select 1 from ml_venta_items i join ml_ventas v on v.id = i.venta_id
     where v.paquete = p_paquete and v.empaque_estado = 'pendiente'
       and i.estado not in ('reservado', 'disponible')
  ) then
    raise exception 'Faltan productos por comprar o recibir en este paquete';
  end if;

  for r in
    select i.id, i.producto_id, i.cantidad, i.origen, i.titulo
      from ml_venta_items i join ml_ventas v on v.id = i.venta_id
     where v.paquete = p_paquete and v.empaque_estado = 'pendiente'
  loop
    if r.origen = 'stock' and r.producto_id is not null then
      update productos_tienda set stock = stock - r.cantidad
       where id = r.producto_id and stock >= r.cantidad;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception 'No hay stock suficiente de "%" para descontar. Avisa a Lalo.', r.titulo;
      end if;
      v_desc := v_desc || jsonb_build_object('producto_id', r.producto_id, 'cantidad', r.cantidad);
    end if;
  end loop;

  update ml_venta_items set estado = 'empacado', cantidad_reservada = 0
   where venta_id in (select id from ml_ventas where paquete = p_paquete and empaque_estado = 'pendiente');
  update ml_ventas set empaque_estado = 'empacada', empacada_en = now(), empacada_por = p_por, actualizada_en = now()
   where paquete = p_paquete and empaque_estado = 'pendiente';
  insert into ml_eventos (paquete, tipo, detalle, hecho_por)
  values (p_paquete, 'empacado', jsonb_build_object('descuentos', v_desc), p_por);

  return jsonb_build_object('ok', true, 'descuentos', v_desc);
end;
$$;
revoke all on function public.ml_empacar_paquete(text, text) from public, anon, authenticated;
grant execute on function public.ml_empacar_paquete(text, text) to service_role;
