-- Segundo número autorizado a registrar ventas por WhatsApp.
--
-- Hasta ahora solo reenviaba Eduardo desde su número personal. Se agrega el
-- contacto "Clienta" (6622064353) para que también pueda reenviar fotos y
-- datos de venta al número de Denog.
--
-- OJO — lo que implica estar en esta lista: los mensajes de este número YA NO
-- pasan por el clasificador de comprobantes/pedidos. Todo lo que mande se
-- interpreta como registro de venta y termina en "Por aprobar". Por eso el
-- número no debe ser el de una clienta que además mande comprobantes de pago:
-- se verificó que 6622064353 no existe en la tabla `clientes`.
--
-- El armado lleva una venta abierta POR REMITENTE (ver
-- lib/whatsapp/ventasBandeja.js), así que dos personas pueden reenviar al mismo
-- tiempo sin que el texto de una cierre la foto de la otra.
--
-- Correr una sola vez en el SQL editor de Supabase.

insert into vendedores_whatsapp_ventas (telefono, nombre)
values ('6622064353', 'Clienta')
on conflict (telefono) do update set activo = true;
