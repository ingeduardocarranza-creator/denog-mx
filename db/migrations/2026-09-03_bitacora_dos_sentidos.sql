-- Un mismo número puede estar en los DOS sentidos de la lista blanca.
--
-- POR QUÉ
-- Probado el 3 sep: los ecos NO propagan la referencia de respuesta. Eduardo
-- respondió a la foto en el chat de Denog consigo mismo y el eco llegó con
-- `context` vacío. O sea que por el camino del eco el emparejamiento exacto es
-- imposible, y con varias personas mandando a la bitácora eso es grave: todos
-- los mensajes llegan bajo el mismo número y el orden no separa a nadie.
--
-- LA SALIDA: partir la venta en sus dos mitades, cada una por el camino que sí
-- sabe hacer su trabajo.
--   - La FOTO con su precio sale del celular de Denog hacia un contacto real
--     (el número personal de Eduardo), marcado en el mismo envío que el grupo.
--     Llega por eco. No necesita enlace: cada foto abre su propia venta.
--   - El CLIENTE lo escribe Eduardo desde su celular, RESPONDIENDO a esa foto
--     en ese mismo chat. Llega como mensaje entrante, y los mensajes entrantes
--     sí traen `context.id` — con el wamid de la foto que Denog mandó, que es
--     el mismo id con el que se encoló el eco. El enlace cierra exacto.
-- Ninguna de las dos mitades depende del orden, y ya no hay que reenviar nada.
--
-- Para eso 6623533906 tiene que estar como 'eco' (lo que Denog le manda) y como
-- 'entrante' (lo que él responde). La llave primaria era solo el teléfono, así
-- que no cabían los dos sentidos: pasa a ser (telefono, origen).
--
-- OJO: con esto Eduardo NO debe seguir reenviando fotos desde su personal. La
-- foto ya entra por el eco; si además la reenvía, la misma venta entra dos
-- veces (son mensajes distintos, con ids distintos — la deduplicación por
-- mensaje_wa_id no lo puede ver).
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table vendedores_whatsapp_ventas drop constraint if exists vendedores_whatsapp_ventas_pkey;
alter table vendedores_whatsapp_ventas add primary key (telefono, origen);

-- El número personal de Eduardo, ahora también como destino de bitácora.
insert into vendedores_whatsapp_ventas (telefono, nombre, origen)
values ('6623533906', 'Eduardo — bitácora (Denog le manda la foto)', 'eco')
on conflict (telefono, origen) do update set activo = true;
