-- Configuración de la pantalla CIET: una rotación de altares visible solo
-- para administradores autenticados.
create table if not exists public.ciet_config (
  id text primary key default 'default',
  selected_slugs text[] not null default '{}',
  rotation_seconds integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint ciet_config_singleton check (id = 'default'),
  constraint ciet_config_rotation_seconds_check check (rotation_seconds >= 5)
);

alter table public.ciet_config enable row level security;

create or replace function public.set_ciet_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_ciet_config_updated_at on public.ciet_config;
create trigger set_ciet_config_updated_at
before update on public.ciet_config
for each row execute function public.set_ciet_config_updated_at();

create policy "ciet_config_select_admin"
  on public.ciet_config
  for select
  to authenticated
  using (public.is_admin());

create policy "ciet_config_insert_admin"
  on public.ciet_config
  for insert
  to authenticated
  with check (public.is_admin());

create policy "ciet_config_update_admin"
  on public.ciet_config
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.ciet_config (id, selected_slugs, rotation_seconds)
values ('default', '{}', 30)
on conflict (id) do nothing;
