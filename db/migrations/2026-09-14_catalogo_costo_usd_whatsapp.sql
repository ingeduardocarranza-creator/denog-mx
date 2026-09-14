-- TIENDA por WhatsApp → Catálogo > Por aprobar.
-- Guarda el costo en USD tal como llegó por WhatsApp, para poder precargarlo
-- en el cotizador del formulario de Catálogo cuando se completa el artículo
-- (precio de venta, stock, etc.). No sustituye a `costo` (que sigue siendo el
-- costo ya convertido a MXN) — es el dato crudo antes de aplicar tipo de
-- cambio e impuesto del día.
--
-- Ya aplicada en producción vía Supabase MCP (14 sep 2026). Este archivo
-- queda como historial del repo, igual que las demás migraciones.
alter table productos_tienda add column if not exists costo_usd numeric;
