-- Jarvis (fase 3): tablero de actividades por turno para colaboradores y admin.
-- Tablas nuevas, no toca nada existente. Sin llaves foráneas a clientes a
-- propósito (evita el problema de relaciones ambiguas en PostgREST).
-- Solo el servidor (service_role) las lee: RLS activo y sin políticas.

create table if not exists jarvis_plantillas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  emoji text not null default '✅',
  para text not null default 'colaborador' check (para in ('colaborador','admin')),
  dias int[] not null default '{1,2,3,4,5}',   -- 1=lunes ... 7=domingo
  hora time not null,
  xp int not null default 10,
  enlace text,
  activa boolean not null default true,
  orden int not null default 0,
  creada_en timestamptz not null default now()
);

create table if not exists jarvis_horarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  dia int not null check (dia between 1 and 7),
  desde time not null,
  hasta time not null,
  unique (usuario_id, dia)
);

create table if not exists jarvis_hechas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  plantilla_id uuid not null references jarvis_plantillas(id) on delete cascade,
  usuario_id uuid not null,
  estado text not null check (estado in ('hecha','saltada')),
  xp int not null default 0,
  hecha_en timestamptz not null default now(),
  unique (fecha, plantilla_id, usuario_id)
);
create index if not exists jarvis_hechas_fecha_idx on jarvis_hechas (fecha, usuario_id);

create table if not exists jarvis_retros (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  usuario_id uuid not null,
  animo int check (animo between 1 and 3),
  dificil text,
  ayuda text,
  creada_en timestamptz not null default now(),
  unique (fecha, usuario_id)
);

alter table jarvis_plantillas enable row level security;
alter table jarvis_horarios enable row level security;
alter table jarvis_hechas enable row level security;
alter table jarvis_retros enable row level security;

-- Horarios: Miguel L-V 10-14; Carlos L-V 15-19 y sábado 10-17.
insert into jarvis_horarios (usuario_id, dia, desde, hasta)
select 'be2fb705-3c37-4307-965c-178fea58d1d5'::uuid, d, '10:00', '14:00' from generate_series(1,5) d
on conflict do nothing;
insert into jarvis_horarios (usuario_id, dia, desde, hasta)
select '14bb4224-008b-4d54-b81e-9f0363df8a82'::uuid, d, '15:00', '19:00' from generate_series(1,5) d
on conflict do nothing;
insert into jarvis_horarios (usuario_id, dia, desde, hasta)
values ('14bb4224-008b-4d54-b81e-9f0363df8a82', 6, '10:00', '17:00')
on conflict do nothing;

-- Actividades iniciales (se pueden cambiar después).
insert into jarvis_plantillas (titulo, detalle, emoji, para, dias, hora, xp, enlace, orden) values
-- Mañana (Miguel L-V, Carlos sábado)
('Abrir la tienda y la caja','Prende luces y pantalla, y abre la caja.','🔑','colaborador','{1,2,3,4,5,6}','10:00',10,'/pos/apertura',1),
('Orden rápido de la tienda','Mostrador y entrada limpios, producto acomodado.','🧹','colaborador','{1,2,3,4,5,6}','10:10',10,null,2),
('Revisar los domicilios de hoy','Mira cuáles hay que preparar y salir a entregar.','🚚','colaborador','{1,2,3,4,5,6}','10:20',10,'/admin/domicilios',3),
('Revisar pedidos del Mercadito','Atiende los que estén esperando.','🛍️','colaborador','{1,2,3,4,5,6}','10:30',10,'/admin/mercadito',4),
('Contar 1 categoría del inventario','Cuenta lo que hay en el anaquel. Si no coincide, escribe el motivo.','🗃️','colaborador','{1,2,3,4,5,6}','11:00',30,'/admin/inventario',5),
('Ponerle foto a 5 productos sin foto','Toma la foto y súbela en el catálogo.','📸','colaborador','{1,2,3,4,5,6}','11:45',20,'/pos/catalogo',6),
('Cambiar 5 códigos GEN- por el código real','Escanea el código de barras del producto.','🏷️','colaborador','{1,2,3,4,5,6}','12:30',20,'/pos/catalogo',7),
('Revisar 5 productos en cero','¿De verdad no hay? Si hay, cuéntalos.','🔎','colaborador','{1,2,3,4,5,6}','13:00',20,'/admin/inventario',8),
('Subir 1 video de un producto (opcional)','Un video corto de 10–15 segundos.','🎬','colaborador','{1,2,3,4,5,6}','13:30',10,'/pos/catalogo',9),
('Limpieza final del turno','Deja todo listo para quien sigue.','🧽','colaborador','{1,2,3,4,5}','13:50',10,null,10),
-- Tarde (Carlos L-V)
('Recibir la tienda','Revisa que todo esté en orden y que haya cambio en caja.','🔑','colaborador','{1,2,3,4,5}','15:00',10,null,11),
('Revisar los domicilios de la tarde','Prepara y sal a entregar los que toquen.','🚚','colaborador','{1,2,3,4,5}','15:10',10,'/admin/domicilios',12),
('Revisar pedidos del Mercadito','Atiende los que estén esperando.','🛍️','colaborador','{1,2,3,4,5}','15:20',10,'/admin/mercadito',13),
('Entregar pedidos que ya llegaron','Avisa a los clientes y entrega lo que ya está en tienda.','📦','colaborador','{1,2,3,4,5}','15:40',20,'/admin/entregas',14),
('Contar 1 categoría del inventario','Cuenta lo que hay en el anaquel. Si no coincide, escribe el motivo.','🗃️','colaborador','{1,2,3,4,5}','16:15',30,'/admin/inventario',15),
('Ponerle foto a 5 productos sin foto','Toma la foto y súbela en el catálogo.','📸','colaborador','{1,2,3,4,5}','17:00',20,'/pos/catalogo',16),
('Cambiar 5 códigos GEN- por el código real','Escanea el código de barras del producto.','🏷️','colaborador','{1,2,3,4,5}','17:45',20,'/pos/catalogo',17),
('Revisar 5 productos en cero','¿De verdad no hay? Si hay, cuéntalos.','🔎','colaborador','{1,2,3,4,5}','18:15',20,'/admin/inventario',18),
('Limpieza y cierre de la tienda','Barrer, limpiar mostrador y apagar lo que no se usa.','🧽','colaborador','{1,2,3,4,5}','18:30',10,null,19),
('Corte de caja','Cuenta el dinero y haz el corte del día.','💵','colaborador','{1,2,3,4,5}','18:45',20,'/pos/corte',20),
-- Sábado (Carlos, tarde)
('Contar otra categoría del inventario','Cuenta lo que hay en el anaquel. Si no coincide, escribe el motivo.','🗃️','colaborador','{6}','15:00',30,'/admin/inventario',21),
('Entregar pedidos que ya llegaron','Avisa a los clientes y entrega lo que ya está en tienda.','📦','colaborador','{6}','15:45',20,'/admin/entregas',22),
('Limpieza y cierre de la tienda','Barrer, limpiar mostrador y apagar lo que no se usa.','🧽','colaborador','{6}','16:30',10,null,23),
('Corte de caja','Cuenta el dinero y haz el corte del día.','💵','colaborador','{6}','16:40',20,'/pos/corte',24);

insert into jarvis_plantillas (titulo, detalle, emoji, para, dias, hora, xp, enlace, orden) values
('Ver las ventas de ayer y de la semana','Un vistazo a cómo vamos.','📊','admin','{1,2,3,4,5,6,7}','09:00',10,'/admin/reportes',1),
('Aprobar diferencias de inventario','Lo que los colaboradores contaron distinto al sistema.','✅','admin','{1,2,3,4,5,6,7}','09:15',10,'/admin/inventario',2),
('Aprobar productos nuevos del catálogo','Ponles precio y stock a los que subieron los colaboradores.','🆕','admin','{1,2,3,4,5,6,7}','09:30',10,'/admin/catalogo',3),
('Aprobar pedidos de WhatsApp','Los pedidos que esperan tu visto bueno.','💬','admin','{1,2,3,4,5,6,7}','10:00',20,'/admin/pendientes',4),
('Limpiar 5 pedidos en limbo','Marca si ya llegaron, ya se entregaron o no llegaron.','📦','admin','{1,2,3,4,5,6,7}','10:30',20,'/admin/pedidos',5),
('Decidir qué vender hoy','Mira tendencias y publica en el grupo de WhatsApp.','🎯','admin','{1,2,3,4,5,6,7}','12:00',10,'/admin/tendencias',6),
('Revisar el corte de caja del día','Que cuadre lo que dijo el colaborador.','💵','admin','{1,2,3,4,5,6}','19:15',10,'/admin/caja',7);

-- Permiso para el servidor (sin esto, "permission denied for table ...").
grant all on table jarvis_plantillas, jarvis_horarios, jarvis_hechas, jarvis_retros to service_role;

-- ── Verificación automática: Jarvis comprueba en la base lo que se hizo ──
alter table jarvis_plantillas add column if not exists verif text, add column if not exists meta int not null default 1;
alter table jarvis_hechas add column if not exists auto boolean not null default false;

create or replace function public.jarvis_progreso(p_usuario uuid, p_fecha date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
select jsonb_build_object(
  'fotos', (select count(distinct registro_id) from bitacora
             where tabla='productos_tienda' and operacion='UPDATE' and actor_id = p_usuario::text
               and ocurrio_en::date = p_fecha and cambios @> array['imagen_url']
               and coalesce(antes->>'imagen_url','')='' and coalesce(despues->>'imagen_url','')<>''),
  'codigos', (select count(distinct registro_id) from bitacora
               where tabla='productos_tienda' and operacion='UPDATE' and actor_id = p_usuario::text
                 and ocurrio_en::date = p_fecha and cambios @> array['codigo_barras']
                 and coalesce(antes->>'codigo_barras','') like 'GEN-%' and coalesce(despues->>'codigo_barras','') not like 'GEN-%'),
  'videos', (select count(distinct registro_id) from bitacora
              where tabla='productos_tienda' and operacion='UPDATE' and actor_id = p_usuario::text
                and ocurrio_en::date = p_fecha and cambios @> array['video_url']
                and coalesce(antes->>'video_url','')='' and coalesce(despues->>'video_url','')<>''),
  'conteos', (select count(*) from conteos_inventario
               where cerrado_por = p_usuario and (cerrado_en at time zone 'America/Hermosillo')::date = p_fecha),
  'ceros', (select count(distinct producto_id) from conteos_inventario_detalle
             where contado_por = p_usuario and stock_sistema = 0
               and (contado_en at time zone 'America/Hermosillo')::date = p_fecha),
  'apertura', (select count(*) from cortes_caja where colaborador_id = p_usuario and tipo='apertura' and creado_en::date = p_fecha),
  'corte', (select count(*) from cortes_caja where colaborador_id = p_usuario and tipo='corte' and creado_en::date = p_fecha),
  'dif_cero', (select case when count(*) = 0 then 1 else 0 end from conteos_inventario_detalle where estado_revision='pendiente'),
  'seguimientos', (select count(distinct cliente_id) from jarvis_seguimientos where usuario_id = p_usuario and fecha = p_fecha)
);
$function$;
revoke all on function public.jarvis_progreso(uuid, date) from public, anon, authenticated;
grant execute on function public.jarvis_progreso(uuid, date) to service_role;

update jarvis_plantillas set verif='apertura', meta=1 where titulo='Abrir la tienda y la caja';
update jarvis_plantillas set verif='conteos', meta=1 where titulo in ('Contar 1 categoría del inventario','Contar otra categoría del inventario');
update jarvis_plantillas set verif='fotos', meta=5 where titulo='Ponerle foto a 5 productos sin foto';
update jarvis_plantillas set verif='codigos', meta=5 where titulo='Cambiar 5 códigos GEN- por el código real';
update jarvis_plantillas set verif='ceros', meta=5 where titulo='Revisar 5 productos en cero';
update jarvis_plantillas set verif='videos', meta=1 where titulo like 'Subir 1 video%';
update jarvis_plantillas set verif='corte', meta=1 where titulo='Corte de caja';
update jarvis_plantillas set verif='dif_cero', meta=1 where titulo='Aprobar diferencias de inventario';

-- ── Seguimiento a clientes con pedido listo en tienda ──
-- (esta tabla debe existir ANTES de crear jarvis_progreso si corres todo de nuevo:
--  mueve este bloque arriba o corre el archivo dos veces.)
create table if not exists jarvis_seguimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  usuario_id uuid not null,
  fecha date not null,
  resultado text not null check (resultado in ('aviso','no_contesta','pasara','otro')),
  nota text,
  creada_en timestamptz not null default now()
);
create index if not exists jarvis_seguimientos_idx on jarvis_seguimientos (fecha, usuario_id);
create index if not exists jarvis_seguimientos_cliente_idx on jarvis_seguimientos (cliente_id, creada_en desc);
alter table jarvis_seguimientos enable row level security;
grant all on table jarvis_seguimientos to service_role;

insert into jarvis_plantillas (titulo, detalle, emoji, para, dias, hora, xp, enlace, orden, verif, meta) values
('Avisar a 3 clientes con pedido listo','Pedidos ya empacados esperando en la tienda. Llámales o mándales WhatsApp.','📞','colaborador','{1,2,3,4,5,6}','11:30',30,null,25,'seguimientos',3),
('Avisar a 3 clientes con pedido listo','Pedidos ya empacados esperando en la tienda. Llámales o mándales WhatsApp.','📞','colaborador','{1,2,3,4,5}','16:45',30,null,26,'seguimientos',3);

-- ── Avisos y relevo de turno ──
create table if not exists jarvis_avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('relevo','pidieron','se_acaba','danado','otro')),
  texto text not null,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  leido_por uuid[] not null default '{}',
  resuelto_en timestamptz,
  resuelto_por uuid
);
create index if not exists jarvis_avisos_idx on jarvis_avisos (tipo, creado_en desc);
alter table jarvis_avisos enable row level security;
grant all on table jarvis_avisos to service_role;

alter function public.jarvis_progreso(uuid, date) rename to jarvis_progreso_base;
create or replace function public.jarvis_progreso(p_usuario uuid, p_fecha date)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
select public.jarvis_progreso_base(p_usuario, p_fecha) || jsonb_build_object(
  'relevos', (select count(*) from jarvis_avisos where tipo='relevo' and creado_por = p_usuario
               and (creado_en at time zone 'America/Hermosillo')::date = p_fecha),
  'avisos', (select count(*) from jarvis_avisos where tipo<>'relevo' and creado_por = p_usuario
              and (creado_en at time zone 'America/Hermosillo')::date = p_fecha)
);
$function$;
revoke all on function public.jarvis_progreso_base(uuid, date) from public, anon, authenticated;
grant execute on function public.jarvis_progreso_base(uuid, date) to service_role;
revoke all on function public.jarvis_progreso(uuid, date) from public, anon, authenticated;
grant execute on function public.jarvis_progreso(uuid, date) to service_role;

insert into jarvis_plantillas (titulo, detalle, emoji, para, dias, hora, xp, enlace, orden, verif, meta) values
('Dejar nota de relevo','Cuéntale al siguiente turno qué quedó pendiente o qué debe saber.','📝','colaborador','{1,2,3,4,5}','13:45',10,null,27,'relevos',1),
('Dejar nota de relevo','Cuéntale al siguiente turno qué quedó pendiente o qué debe saber.','📝','colaborador','{1,2,3,4,5}','18:50',10,null,28,'relevos',1),
('Dejar nota de relevo','Cuéntale al siguiente turno qué quedó pendiente o qué debe saber.','📝','colaborador','{6}','16:50',10,null,29,'relevos',1);
