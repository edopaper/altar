-- Housekeeping: las tablas de rate limit (share_rate_limits,
-- report_rate_limits, message_rate_limits, message_report_rate_limits) solo
-- necesitan ver la última hora para funcionar, pero nunca se borra nada de
-- ellas — crecen para siempre. Este cron diario borra lo que ya tiene más
-- de un día (margen de sobra sobre la ventana de 1 hora que usa cada rate
-- limit).
create extension if not exists pg_cron with schema extensions;

create or replace function public.cleanup_rate_limits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.share_rate_limits where created_at < now() - interval '1 day';
  delete from public.report_rate_limits where created_at < now() - interval '1 day';
  delete from public.message_rate_limits where created_at < now() - interval '1 day';
  delete from public.message_report_rate_limits where created_at < now() - interval '1 day';
end;
$$;

-- cron.schedule no es idempotente con el mismo job_name en todas las
-- versiones; se chequea antes para poder correr esta migración más de una vez.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup-rate-limits-daily') then
    perform cron.schedule(
      'cleanup-rate-limits-daily',
      '17 4 * * *', -- todos los días a las 04:17 UTC (horario de bajo tráfico)
      $sql$select public.cleanup_rate_limits();$sql$
    );
  end if;
end $$;
