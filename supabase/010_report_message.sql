-- Reportar un mensaje puntual (no solo el altar completo).
alter table public.messages
  add column if not exists reported_count integer not null default 0;

-- Mismo patrón que report_rate_limits: rate limit por IP + una IP no puede
-- reportar el mismo mensaje más de una vez.
create table if not exists public.message_report_rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  message_id bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists message_report_rate_limits_ip_created_idx
  on public.message_report_rate_limits (ip, created_at desc);

create unique index if not exists message_report_rate_limits_ip_message_key
  on public.message_report_rate_limits (ip, message_id);

alter table public.message_report_rate_limits enable row level security;

-- Incremento atómico (una sola sentencia SQL), mismo motivo que
-- increment_altar_report: evita que reportes casi simultáneos se pisen.
create or replace function public.increment_message_report(p_message_id bigint, p_hide_threshold int)
returns table(reported_count int, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.messages as m
  set reported_count = m.reported_count + 1,
      status = case
        when m.reported_count + 1 >= p_hide_threshold then 'hidden'
        else m.status
      end
  where m.id = p_message_id
  returning m.reported_count, m.status;
end;
$$;
