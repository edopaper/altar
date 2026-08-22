-- Corrige la misma condición de carrera que ya habíamos arreglado en
-- reported_count (007): cada rate limit hacía "select count" y luego
-- "insert" (a veces dos inserts: uno para el conteo por IP y otro para el
-- índice único anti-duplicados) como llamadas separadas. Con pedidos muy
-- seguidos, el select de uno podía no ver todavía el insert del anterior,
-- dejando pasar más pedidos de los que el límite permite. Estas funciones
-- hacen todo (contar + insertar) en una sola sentencia/transacción.

create or replace function public.take_share_rate_limit_slot(p_ip text, p_window_seconds int, p_limit int)
returns table(allowed boolean, remaining int, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_oldest timestamptz;
begin
  select count(*), min(created_at) into v_count, v_oldest
  from public.share_rate_limits
  where ip = p_ip and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return query select
      false,
      0,
      greatest(1, ceil(extract(epoch from (v_oldest + (p_window_seconds || ' seconds')::interval - now())))::int);
    return;
  end if;

  insert into public.share_rate_limits (ip) values (p_ip);
  return query select true, greatest(0, p_limit - (v_count + 1)), 0;
end;
$$;

-- 'ok' | 'rate_limited' | 'duplicate' (ya habías reportado ese altar).
create or replace function public.take_report_rate_limit_slot(p_ip text, p_slug text, p_window_seconds int, p_limit int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.report_rate_limits
  where ip = p_ip and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return 'rate_limited';
  end if;

  begin
    insert into public.report_rate_limits (ip, slug) values (p_ip, p_slug);
  exception when unique_violation then
    return 'duplicate';
  end;

  return 'ok';
end;
$$;

create or replace function public.take_message_rate_limit_slot(p_ip text, p_window_seconds int, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.message_rate_limits
  where ip = p_ip and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.message_rate_limits (ip) values (p_ip);
  return true;
end;
$$;

-- 'ok' | 'rate_limited' | 'duplicate' (ya habías reportado ese mensaje).
create or replace function public.take_message_report_rate_limit_slot(p_ip text, p_message_id bigint, p_window_seconds int, p_limit int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.message_report_rate_limits
  where ip = p_ip and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return 'rate_limited';
  end if;

  begin
    insert into public.message_report_rate_limits (ip, message_id) values (p_ip, p_message_id);
  exception when unique_violation then
    return 'duplicate';
  end;

  return 'ok';
end;
$$;
