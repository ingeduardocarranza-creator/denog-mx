-- Capturar ventas desde el propio celular de Denog, por eco.
--
-- EL HALLAZGO (3 sep 2026, ver claude/whatsapp-ecos-smb-hallazgo.md)
-- El campo `smb_message_echoes` está vivo y entrega lo que el celular de Denog
-- manda: probado con foto (caption "$165") y texto ("Monserrat Ibarra $4.79").
-- Se confirmaron las dos incógnitas que faltaban:
--   1. El chat "Mensajéate a ti mismo" SÍ dispara eco — el eco llega con
--      from = to = 5216625486432. Sirve como bitácora sin involucrar a nadie.
--   2. La foto del eco SÍ se puede descargar con nuestro token — bajó un JPEG
--      de 154 KB.
--
-- QUÉ CAMBIA PARA EDUARDO
-- Antes: publicar en el grupo desde el celular de Denog, cambiarse al WhatsApp
-- personal, reenviar cada foto y escribir el cliente. Ahora: publicar el
-- producto marcando también el chat consigo mismo en el mismo envío, y
-- responder ahí a la foto con el cliente. Un solo celular, cero reenvíos.
--
-- EL MODELO
-- La lista blanca pasa a tener dos sentidos, por eso la columna `origen`:
--   'entrante' — mensajes QUE MANDA ese número al de Denog (el reenvío de
--                siempre, desde el número personal).
--   'eco'      — mensajes QUE DENOG MANDA a ese número (la bitácora).
-- Están separados a propósito: 6623533906 sigue siendo 'entrante', así que si
-- Denog le escribe eso NO se registra como venta. Si el mismo número estuviera
-- en los dos sentidos, una venta podría entrar dos veces.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table vendedores_whatsapp_ventas
  add column if not exists origen text not null default 'entrante';

alter table vendedores_whatsapp_ventas drop constraint if exists vendedores_whatsapp_ventas_origen_check;
alter table vendedores_whatsapp_ventas add constraint vendedores_whatsapp_ventas_origen_check
  check (origen in ('entrante', 'eco'));

-- La bitácora: el número de Denog escribiéndose a sí mismo.
insert into vendedores_whatsapp_ventas (telefono, nombre, origen)
values ('6625486432', 'Denog — chat consigo mismo (bitácora)', 'eco')
on conflict (telefono) do update set origen = 'eco', activo = true;
