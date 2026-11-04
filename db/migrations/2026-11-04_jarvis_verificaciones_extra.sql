-- Jarvis: más actividades que se comprueban solas (entregas, WhatsApp, catálogo, limbo, corte del día).
-- Ver la función public.jarvis_progreso en la base (migración jarvis_progreso_mas_verificaciones).
update jarvis_plantillas set verif='wa_atendidos', meta=5, titulo='Atender 5 pedidos de WhatsApp' where para='admin' and titulo like '%pedidos de WhatsApp';
update jarvis_plantillas set verif='catalogo_cero' where para='admin' and titulo='Aprobar productos nuevos del catálogo';
update jarvis_plantillas set verif='limbo', meta=5 where para='admin' and titulo='Limpiar 5 pedidos en limbo';
update jarvis_plantillas set verif='corte_dia' where para='admin' and titulo='Revisar el corte de caja del día';
update jarvis_plantillas set verif='entregas' where para='colaborador' and titulo='Entregar pedidos que ya llegaron';
