-- La rama de "actualizar" (mismo slug + editToken) no tenía ningún límite:
-- un loop descontrolado podría hamartear la Edge Function y Storage sin
-- freno. Límite propio, más laxo que el de creación (30/hora vs 5/hora),
-- solo para cortar ese caso.
create table if not exists public.share_update_rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists share_update_rate_limits_ip_created_idx
  on public.share_update_rate_limits (ip, created_at desc);

alter table public.share_update_rate_limits enable row level security;

create or replace function public.take_share_update_rate_limit_slot(p_ip text, p_window_seconds int, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.share_update_rate_limits
  where ip = p_ip and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.share_update_rate_limits (ip) values (p_ip);
  return true;
end;
$$;

-- Suma esta tabla al housekeeping diario de rate limits (011).
create or replace function public.cleanup_rate_limits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.share_rate_limits where created_at < now() - interval '1 day';
  delete from public.share_update_rate_limits where created_at < now() - interval '1 day';
  delete from public.report_rate_limits where created_at < now() - interval '1 day';
  delete from public.message_rate_limits where created_at < now() - interval '1 day';
  delete from public.message_report_rate_limits where created_at < now() - interval '1 day';
end;
$$;
