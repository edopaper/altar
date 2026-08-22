-- Tabla de altares compartidos (sin login, anónimo).
create table if not exists public.altars (
  slug text primary key,
  name text not null default 'Altar de muertos',
  objects jsonb not null,
  photo_url text,
  cloth_color text,
  created_at timestamptz not null default now()
);

-- El slug ya es PK (único e indexado), no hace falta índice aparte.

alter table public.altars enable row level security;

-- Cualquiera puede crear un altar (anon, sin login).
create policy "altars_insert_anon"
  on public.altars
  for insert
  to anon
  with check (true);

-- Cualquiera puede leer cualquier altar (para que el link compartido funcione).
create policy "altars_select_anon"
  on public.altars
  for select
  to anon
  using (true);

-- Sin políticas de update/delete para anon => quedan bloqueados por RLS.
