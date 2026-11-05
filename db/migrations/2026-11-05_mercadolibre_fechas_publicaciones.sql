-- MercadoLibre: fecha de creación y de última modificación de cada publicación.
-- (Sirve para saber cuándo se publicó y para detectar productos estancados.)
alter table public.ml_publicaciones
  add column if not exists creada_en timestamptz,
  add column if not exists actualizada_en timestamptz;
