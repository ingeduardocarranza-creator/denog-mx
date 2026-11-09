-- Dinero real de cada venta de MercadoLibre: comisión y costo de envío del vendedor.
alter table public.ml_ventas add column if not exists total_orden numeric;
alter table public.ml_ventas add column if not exists comision_total numeric;
alter table public.ml_ventas add column if not exists envio_costo numeric;
alter table public.ml_ventas add column if not exists finanzas_en timestamptz;
alter table public.ml_venta_items add column if not exists comision numeric;
alter table public.ml_ventas add column if not exists impuestos numeric; -- ISR 2.5% + IVA retenido 8% sobre (total/1.16)
alter table public.ml_publicaciones add column if not exists comision_pct_est numeric; alter table public.ml_publicaciones add column if not exists comision_est_en timestamptz;
