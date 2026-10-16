-- Guarda con qué tipo de cambio e impuesto se calculó el costo en USD de un
-- artículo, para que al editarlo se vea el cotizador completo. (Ya aplicada en
-- Supabase el 16 oct 2026. costo_usd ya existía.)
alter table productos_tienda add column if not exists costo_tipo_cambio numeric;
alter table productos_tienda add column if not exists costo_impuesto_pct numeric;
