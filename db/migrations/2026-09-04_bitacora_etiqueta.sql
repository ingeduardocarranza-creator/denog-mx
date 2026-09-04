-- Nombre corto de cada bitácora, para separarlas en "Por aprobar".
--
-- Eduardo revisa conversación por conversación: se mete a una, aprueba todo lo
-- de ahí, termina, y luego se mete a la otra. Mezclarlas en una sola lista lo
-- obliga a entrar y salir. La pantalla ahora separa las ventas por la bitácora
-- de la que vinieron, y esta columna es el nombre que se ve en la pestaña.
--
-- Va aquí y no en el código para que agregar una bitácora nueva (una tercera
-- persona con el celular de Denog) no requiera tocar nada: se da de alta el
-- número con su etiqueta y la pestaña aparece sola.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table vendedores_whatsapp_ventas add column if not exists etiqueta text;

update vendedores_whatsapp_ventas set etiqueta = 'Denog ↔ Denog'
  where telefono = '6625486432' and origen = 'eco';

update vendedores_whatsapp_ventas set etiqueta = 'Denog → Eduardo'
  where telefono = '6623533906' and origen = 'eco';
