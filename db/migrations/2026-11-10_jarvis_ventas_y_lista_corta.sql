-- Jarvis: cuenta "ventas" propias del día (tickets distintos) y deja 6 tareas por turno.
create or replace function public.jarvis_progreso(p_usuario uuid, p_fecha date)
 returns jsonb language sql stable set search_path to 'public'
as $function$
select public.jarvis_progreso_base(p_usuario, p_fecha) || jsonb_build_object(
  'relevos', (select count(*) from jarvis_avisos where tipo='relevo' and creado_por = p_usuario
               and (creado_en at time zone 'America/Hermosillo')::date = p_fecha),
  'avisos', (select count(*) from jarvis_avisos where tipo<>'relevo' and creado_por = p_usuario
              and (creado_en at time zone 'America/Hermosillo')::date = p_fecha),
  'entregas', (select count(*) from pedidos p
                where p.entregado_en::date = p_fecha
                  and p.entregado_por = (select nombre from clientes where id = p_usuario)),
  'wa_atendidos', (select count(distinct registro_id) from bitacora
                    where tabla='pendientes' and operacion='UPDATE' and actor_id = p_usuario::text
                      and ocurrio_en::date = p_fecha),
  'catalogo_cero', (select case when count(*) = 0 then 1 else 0 end from productos_tienda where pendiente_aprobacion),
  'limbo', (select count(distinct registro_id) from bitacora
             where tabla='pedidos' and operacion='UPDATE' and actor_id = p_usuario::text
               and ocurrio_en::date = p_fecha and cambios @> array['estado']),
  'corte_dia', (select count(*) from cortes_caja where tipo='corte' and creado_en::date = p_fecha),
  -- ventas de tienda hechas por esta persona ese día (un ticket = una venta)
  'ventas', (select count(distinct coalesce(transaccion_id::text, pago_id::text, id::text)) from ventas_tienda
              where vendedor_id = p_usuario
                and (creado_en at time zone 'America/Hermosillo')::date = p_fecha)
);
$function$;
