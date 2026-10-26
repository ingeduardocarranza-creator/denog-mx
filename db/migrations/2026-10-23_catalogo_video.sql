-- Pantalla de la tienda: video corto opcional por producto.
-- Correr en Supabase (SQL Editor) ANTES de subir el código a GitHub.
alter table productos_tienda add column if not exists video_url text;

-- Si el bucket "productos" solo acepta imágenes, esto le agrega los videos
-- (si no tiene lista de tipos permitidos, no cambia nada).
update storage.buckets
set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['video/mp4','video/webm']))
where id = 'productos' and allowed_mime_types is not null;
