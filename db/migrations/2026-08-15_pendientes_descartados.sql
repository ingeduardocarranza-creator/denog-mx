-- Botón "Esto no era": un pendiente que la IA no debió generar se marca como
-- descartado en vez de borrarse.
--
-- Por qué no se borra: desde el 15/ago/2026 el clasificador genera de más a
-- propósito (ver docs/PENDIENTES.md §5 — "ante la duda, avisa"). Los falsos
-- positivos son el material con el que después se afina el prompt. Si se
-- borran, ese aprendizaje se pierde y se corrige lo mismo cada tres meses.
--
-- Además, en comprobantes borrar es riesgoso: es el aviso de un pago. Un
-- borrado por error deja sin rastro que un cliente dijo haber pagado.
--
-- Correr una sola vez en el SQL editor de Supabase.

-- 1) Nuevo estado permitido.
alter table pendientes drop constraint if exists pendientes_estado_check;
alter table pendientes add constraint pendientes_estado_check
  check (estado in ('nuevo', 'visto', 'resuelto', 'descartado'));

-- 2) Quién lo descartó y cuándo. El motivo es opcional: el botón descarta de
--    un clic para no estorbar al barrer la lista. La columna queda lista por
--    si más adelante se quiere pedir una razón.
alter table pendientes add column if not exists descartado_por uuid references clientes(id);
alter table pendientes add column if not exists descartado_en timestamptz;
alter table pendientes add column if not exists descartado_motivo text;

-- 3) Índice para la vista de descartados (y para revisarlos al afinar el
--    clasificador).
create index if not exists idx_pendientes_descartados
  on pendientes(descartado_en desc) where estado = 'descartado';
