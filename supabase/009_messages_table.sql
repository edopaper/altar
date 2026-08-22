-- Migra los mensajes de "localStorage por navegador" a una tabla compartida,
-- para que se vean entre visitantes del mismo altar y el admin pueda
-- moderarlos de verdad.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  slug text not null references public.altars (slug) on delete cascade,
  text text not null,
  author text not null default '',
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

create index if not exists messages_slug_created_idx
  on public.messages (slug, created_at);

alter table public.messages enable row level security;

-- Cualquiera (incluido un admin logueado, que también pasa por `authenticated`)
-- ve los mensajes visibles de un altar.
create policy "messages_select_public"
  on public.messages
  for select
  to anon, authenticated
  using (status = 'visible');

-- Un admin ve además los ocultos (policies permisivas se combinan con OR).
create policy "messages_select_admin"
  on public.messages
  for select
  to authenticated
  using (public.is_admin());

-- Ocultar/restaurar.
create policy "messages_update_admin"
  on public.messages
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Borrado definitivo.
create policy "messages_delete_admin"
  on public.messages
  for delete
  to authenticated
  using (public.is_admin());

-- Sin policy de insert para anon/authenticated: se crea vía la Edge Function
-- `add-message` (service role), que valida longitud, palabras prohibidas y
-- rate limit por IP — mismo patrón que `share-altar`.

create table if not exists public.message_rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists message_rate_limits_ip_created_idx
  on public.message_rate_limits (ip, created_at desc);

alter table public.message_rate_limits enable row level security;
