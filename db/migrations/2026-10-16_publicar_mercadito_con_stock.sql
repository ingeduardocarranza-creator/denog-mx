-- Publica solo en el Mercadito un artículo cuando entra stock:
--  · al crearse con stock (ya aprobado),
--  · al volver a tener stock después de estar en cero,
--  · al aprobarse un artículo pendiente que ya tiene stock.
-- Si el mismo cambio mueve a mano la casilla "Mostrar en Mercadito", se respeta.
-- El ocultar con stock 0 NO se hace aquí: lo hacen las consultas del Mercadito
-- (stock > 0), así al reponer vuelve a aparecer solo.
create or replace function public.publicar_en_mercadito_si_hay_stock()
returns trigger
language plpgsql
as $$
begin
  if coalesce(NEW.activo, true)
     and not coalesce(NEW.pendiente_aprobacion, false)
     and coalesce(NEW.stock, 0) > 0 then
    if TG_OP = 'INSERT' then
      NEW.mostrar_en_mercadito := true;
    elsif NEW.mostrar_en_mercadito is not distinct from OLD.mostrar_en_mercadito
          and (coalesce(OLD.stock, 0) <= 0 or coalesce(OLD.pendiente_aprobacion, false)) then
      NEW.mostrar_en_mercadito := true;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists productos_publicar_mercadito on public.productos_tienda;
create trigger productos_publicar_mercadito
  before insert or update of stock, pendiente_aprobacion on public.productos_tienda
  for each row execute function public.publicar_en_mercadito_si_hay_stock();
