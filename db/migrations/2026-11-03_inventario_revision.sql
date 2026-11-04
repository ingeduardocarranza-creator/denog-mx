-- Inventario: las diferencias que encuentra un COLABORADOR al contar ya no
-- cambian el stock solas. Quedan "pendientes" hasta que un admin las apruebe
-- o las rechace. Si cuenta un admin, se aplica al momento como siempre.
--
-- Correr en Supabase (SQL Editor) ANTES de subir el código a GitHub.
-- Es seguro correrla primero: el código que está hoy en producción sigue
-- funcionando igual (aplica al momento) hasta que se suba el código nuevo.
-- Hoy hay 0 conteos guardados, así que no hay datos viejos que migrar.

-- 1) Estado de revisión de cada renglón contado.
--    revisado_por NO lleva llave foránea a propósito: una segunda relación con
--    clientes haría ambigua la consulta que ya usa Inventario para mostrar
--    quién contó (mismo problema que pagos/clientes).
alter table conteos_inventario_detalle
  add column if not exists estado_revision text not null default 'aplicado',
  add column if not exists revisado_por uuid,
  add column if not exists revisado_en timestamptz,
  add column if not exists nota_revision text;

alter table conteos_inventario_detalle
  drop constraint if exists conteos_inventario_detalle_estado_revision_check;
alter table conteos_inventario_detalle
  add constraint conteos_inventario_detalle_estado_revision_check
  check (estado_revision in ('aplicado', 'pendiente', 'aprobado', 'rechazado'));

-- aplicado  = el stock ya quedó igual a lo contado (sin diferencia, o contó un admin)
-- pendiente = hay diferencia y espera al admin; el stock NO se ha tocado
-- aprobado  = el admin aceptó la diferencia y se ajustó el stock
-- rechazado = el admin no la aceptó; el stock sigue como estaba

create index if not exists conteos_inventario_detalle_pendientes_idx
  on conteos_inventario_detalle (contado_en desc)
  where estado_revision = 'pendiente';

-- 2) Contar un producto. Cambia la firma (agrega p_requiere_revision y regresa
--    el estado), por eso se borra la anterior. El parámetro nuevo tiene valor
--    por defecto "false": el código viejo lo sigue llamando igual que antes.
drop function if exists public.aplicar_conteo_inventario(uuid, bigint, integer, text, uuid);

create or replace function public.aplicar_conteo_inventario(
  p_conteo_id uuid,
  p_producto_id bigint,
  p_cantidad_contada integer,
  p_justificacion text,
  p_contado_por uuid,
  p_requiere_revision boolean default false
)
returns table(
  out_producto_id bigint,
  out_stock_sistema integer,
  out_cantidad_contada integer,
  out_diferencia integer,
  out_estado_revision text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stock_sistema integer;
  v_diferencia integer;
  v_estado text;
begin
  if p_cantidad_contada is null or p_cantidad_contada < 0 then
    raise exception 'La cantidad contada debe ser un número mayor o igual a cero';
  end if;

  select stock into v_stock_sistema
    from productos_tienda
   where id = p_producto_id
   for update;

  if v_stock_sistema is null then
    raise exception 'El producto % no existe', p_producto_id;
  end if;

  v_diferencia := p_cantidad_contada - v_stock_sistema;

  if v_diferencia <> 0 and (p_justificacion is null or btrim(p_justificacion) = '') then
    raise exception 'Hay una diferencia de % piezas contra el sistema; hace falta justificación', v_diferencia;
  end if;

  if v_diferencia <> 0 and p_requiere_revision then
    -- Un colaborador contó algo distinto al sistema: se guarda, pero el stock
    -- NO cambia hasta que un admin lo apruebe.
    v_estado := 'pendiente';
  else
    v_estado := 'aplicado';
    update productos_tienda set stock = p_cantidad_contada where id = p_producto_id;
  end if;

  insert into conteos_inventario_detalle
    (conteo_id, producto_id, stock_sistema, cantidad_contada, diferencia, justificacion, contado_por,
     estado_revision, revisado_por, revisado_en, nota_revision)
  values
    (p_conteo_id, p_producto_id, v_stock_sistema, p_cantidad_contada, v_diferencia, p_justificacion, p_contado_por,
     v_estado, null, null, null)
  on conflict (conteo_id, producto_id) do update set
    stock_sistema = excluded.stock_sistema,
    cantidad_contada = excluded.cantidad_contada,
    diferencia = excluded.diferencia,
    justificacion = excluded.justificacion,
    contado_por = excluded.contado_por,
    estado_revision = excluded.estado_revision,
    revisado_por = null,
    revisado_en = null,
    nota_revision = null,
    contado_en = now();

  return query select p_producto_id, v_stock_sistema, p_cantidad_contada, v_diferencia, v_estado;
end;
$function$;

-- 3) El admin resuelve una diferencia pendiente.
--    APROBAR suma la diferencia al stock de HOY (no lo pisa con el número
--    contado): así no se borran las ventas que hubo entre el conteo y la
--    revisión. RECHAZAR deja el stock como está.
create or replace function public.resolver_diferencia_inventario(
  p_detalle_id uuid,
  p_aprobar boolean,
  p_revisado_por uuid,
  p_nota text default null
)
returns table(
  out_detalle_id uuid,
  out_estado_revision text,
  out_stock_nuevo integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_det conteos_inventario_detalle%rowtype;
  v_stock integer;
  v_nuevo integer;
  v_estado text;
begin
  select * into v_det
    from conteos_inventario_detalle
   where id = p_detalle_id
   for update;

  if not found then
    raise exception 'Esa diferencia no existe';
  end if;
  if v_det.estado_revision <> 'pendiente' then
    raise exception 'Esa diferencia ya fue revisada';
  end if;

  select stock into v_stock
    from productos_tienda
   where id = v_det.producto_id
   for update;

  if p_aprobar then
    v_nuevo := v_stock + v_det.diferencia;
    if v_nuevo < 0 then
      raise exception 'Aprobar esto dejaría el stock en negativo (hoy el sistema tiene %). Pide un conteo nuevo de este producto.', v_stock;
    end if;
    update productos_tienda set stock = v_nuevo where id = v_det.producto_id;
    v_estado := 'aprobado';
  else
    v_nuevo := v_stock;
    v_estado := 'rechazado';
  end if;

  update conteos_inventario_detalle
     set estado_revision = v_estado,
         revisado_por = p_revisado_por,
         revisado_en = now(),
         nota_revision = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_detalle_id;

  return query select p_detalle_id, v_estado, v_nuevo;
end;
$function$;

-- 4) Solo el servidor (service_role) puede llamar estas funciones, igual que
--    la función de conteo que ya existía.
revoke all on function public.aplicar_conteo_inventario(uuid, bigint, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.aplicar_conteo_inventario(uuid, bigint, integer, text, uuid, boolean) to service_role;

revoke all on function public.resolver_diferencia_inventario(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.resolver_diferencia_inventario(uuid, boolean, uuid, text) to service_role;
