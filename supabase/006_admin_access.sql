-- Acceso de administrador vía login con GitHub (Supabase Auth).
-- No hay cuentas de usuario normales en la app; esto es exclusivamente para
-- moderar (ver/ocultar altares reportados) desde un dashboard propio.

-- Lista de usuarios de GitHub autorizados como admin. Bloqueada por RLS sin
-- policies: solo la función is_admin() (security definer) puede leerla.
create table if not exists public.admin_github_users (
  username text primary key
);

alter table public.admin_github_users enable row level security;

insert into public.admin_github_users (username)
values ('edopaper')
on conflict do nothing;

-- true si el usuario autenticado (JWT de la sesión) es un admin permitido.
-- El username de GitHub llega en user_metadata.user_name via Supabase Auth.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_github_users
    where username = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  );
$$;

-- El dashboard llama a is_admin() vía RPC para saber si mostrar el panel.
grant execute on function public.is_admin() to authenticated;

-- Un admin autenticado puede actualizar cualquier altar (para moderar:
-- ocultar/restaurar). Sigue sin haber policy de update para anon.
create policy "altars_update_admin"
  on public.altars
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
