-- Corrige una condición de carrera: report-altar hacía select + update
-- separados, así que reportes casi simultáneos se pisaban entre sí y
-- `reported_count` se quedaba corto. Este RPC hace todo en un solo UPDATE
-- (atómico a nivel de fila en Postgres) y de paso aplica el ocultamiento
-- automático si se llega al umbral.
create or replace function public.increment_altar_report(p_slug text, p_hide_threshold int)
returns table(reported_count int, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.altars as a
  set reported_count = a.reported_count + 1,
      status = case
        when a.reported_count + 1 >= p_hide_threshold then 'hidden'
        else a.status
      end
  where a.slug = p_slug
  returning a.reported_count, a.status;
end;
$$;
