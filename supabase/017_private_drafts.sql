-- Apply after 016, before deploying the updated share-altar and frontend.
begin;
alter table public.altars add column is_published boolean not null default true;
create table public.altar_drafts (
  slug text primary key references public.altars(slug) on delete cascade,
  content jsonb not null,
  revision integer not null default 1,
  published_revision integer,
  updated_at timestamptz not null default now()
);
alter table public.altar_drafts enable row level security;
-- No client policies: private content is returned only through my_altars.
insert into public.altar_drafts(slug, content, published_revision)
select slug, jsonb_build_object('name', name, 'objects', objects, 'photo', photo_url, 'clothColor', cloth_color), 1
from public.altars where owner_id is not null;

drop policy altars_select_anon on public.altars;
drop policy altars_select_authenticated on public.altars;
create policy altars_select_anon on public.altars for select to anon using (is_published);
create policy altars_select_authenticated on public.altars for select to authenticated using (is_published or public.is_admin());

drop function public.my_altars();
create function public.my_altars() returns table (
  slug text, name text, objects jsonb, photo_url text, cloth_color text, status text,
  created_at timestamptz, revision integer, published_revision integer, updated_at timestamptz, is_published boolean
) language sql stable security definer set search_path = public as $$
  select a.slug, coalesce(d.content->>'name', a.name), coalesce(d.content->'objects', a.objects),
    case when d.slug is null then a.photo_url else d.content->>'photo' end,
    case when d.slug is null then a.cloth_color else d.content->>'clothColor' end,
    a.status::text, a.created_at, coalesce(d.revision, 0), d.published_revision,
    coalesce(d.updated_at, a.created_at), a.is_published
  from public.altars a left join public.altar_drafts d using(slug)
  where a.owner_id = auth.uid() order by coalesce(d.updated_at, a.created_at) desc;
$$;
revoke all on function public.my_altars() from public, anon;
grant execute on function public.my_altars() to authenticated;

-- Edge Function validates payload and JWT. The row lock makes revision checking
-- and publication atomic; saves never touch the public snapshot or moderation.
create function public.commit_altar_draft(
  p_slug text, p_user uuid, p_revision integer, p_content jsonb,
  p_publish boolean, p_photo_url text, p_edit_token text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.altars; d public.altar_drafts; next_revision integer; stamp timestamptz := now();
begin
  select * into a from public.altars where slug = p_slug for update;
  if not found then
    if p_revision <> 0 then raise exception 'El altar ya no existe' using errcode = '40001'; end if;
    insert into public.altars(slug, name, objects, owner_id, edit_token, is_published)
      values(p_slug, 'Borrador privado', '[]', p_user, p_edit_token, false) returning * into a;
  elsif a.owner_id is distinct from p_user then
    if a.owner_id is not null or p_edit_token is null or a.edit_token is distinct from p_edit_token then
      raise exception 'Sin permiso' using errcode = '42501';
    end if;
    update public.altars set owner_id = p_user where slug = p_slug;
  end if;
  select * into d from public.altar_drafts where slug = p_slug;
  if coalesce(d.revision, 0) <> p_revision then
    raise exception 'Hay cambios más recientes en otro dispositivo' using errcode = '40001';
  end if;
  next_revision := coalesce(d.revision, 0) + 1;
  insert into public.altar_drafts(slug, content, revision, published_revision, updated_at)
    values(p_slug, p_content, next_revision, case when p_publish then next_revision else d.published_revision end, stamp)
    on conflict(slug) do update set content = excluded.content, revision = excluded.revision,
      published_revision = excluded.published_revision, updated_at = excluded.updated_at;
  if p_publish then
    update public.altars set name = p_content->>'name', objects = p_content->'objects',
      photo_url = p_photo_url, cloth_color = p_content->>'clothColor', is_published = true where slug = p_slug;
  end if;
  return jsonb_build_object('slug', p_slug, 'revision', next_revision, 'updated_at', stamp,
    'is_published', a.is_published or p_publish,
    'published_revision', case when p_publish then next_revision else d.published_revision end);
end $$;
revoke all on function public.commit_altar_draft(text, uuid, integer, jsonb, boolean, text, text) from public, anon, authenticated;
grant execute on function public.commit_altar_draft(text, uuid, integer, jsonb, boolean, text, text) to service_role;
commit;
