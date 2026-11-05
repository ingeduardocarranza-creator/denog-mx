-- MercadoLibre: más datos de cada publicación para entender por qué algunas
-- (las de tipo_envio = 'not_specified', sin Mercado Envíos) no aparecen en el
-- panel de vendedor: sub-estado, etiquetas internas y canal (marketplace/mshops).
alter table public.ml_publicaciones
  add column if not exists sub_estado text,
  add column if not exists etiquetas text,
  add column if not exists canales text;
