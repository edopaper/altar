-- Cierra el insert directo desde el cliente (anon): compartir un altar pasa
-- a hacerse a través de la Edge Function `share-altar`, que valida el rate
-- limit por IP y usa la service role key (bypassea RLS).
drop policy if exists "altars_insert_anon" on public.altars;
drop policy if exists "altar_photos_insert_anon" on storage.objects;

-- Tabla interna de conteo de altares compartidos por IP. No tiene policies
-- para anon/authenticated, así que RLS la deja inaccesible desde el
-- cliente; solo la Edge Function (service role) puede leerla/escribirla.
create table if not exists public.share_rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists share_rate_limits_ip_created_idx
  on public.share_rate_limits (ip, created_at desc);

alter table public.share_rate_limits enable row level security;
