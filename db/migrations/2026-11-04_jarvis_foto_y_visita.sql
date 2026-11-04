alter table public.jarvis_hechas add column if not exists foto_url text;
update jarvis_plantillas set verif='foto', detalle='Toma una foto de cómo quedó. Con la foto se marca sola.' where para='colaborador' and titulo in ('Orden rápido de la tienda','Limpieza final del turno','Recibir la tienda','Limpieza y cierre de la tienda');
update jarvis_plantillas set verif='visita' where titulo in ('Revisar los domicilios de hoy','Revisar los domicilios de la tarde','Revisar pedidos del Mercadito','Ver las ventas de ayer y de la semana','Decidir qué vender hoy');
