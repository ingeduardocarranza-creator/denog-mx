-- Guardián de disponibilidad (aplicada en Supabase como migración ml_guardian)
alter table ml_publicaciones add column if not exists riesgo text, add column if not exists riesgo_motivo text, add column if not exists verificada_en timestamptz, add column if not exists tope_aplicado boolean not null default false, add column if not exists tope_stock_previo int, add column if not exists guardian_pausada boolean not null default false;
alter table ml_fichas_compra add column if not exists disponible boolean, add column if not exists revisada_en timestamptz, add column if not exists revision_nota text;
-- tablas ml_guardian_config (interruptor, apagado por defecto) y ml_alertas con grants a service_role
