-- Soporte para reportar un altar compartido.
alter table public.altars
  add column if not exists reported_count integer not null default 0;

-- Tabla interna de rate limit por IP para reportes (mismo patrón que
-- share_rate_limits). Sin policies para anon/authenticated: solo la Edge
-- Function `report-altar` (service role) puede leerla/escribirla.
create table if not exists public.report_rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  slug text not null,
  created_at timestamptz not null default now()
);

create index if not exists report_rate_limits_ip_created_idx
  on public.report_rate_limits (ip, created_at desc);

-- Una IP no debería poder reportar el mismo altar más de una vez.
create unique index if not exists report_rate_limits_ip_slug_key
  on public.report_rate_limits (ip, slug);

alter table public.report_rate_limits enable row level security;
