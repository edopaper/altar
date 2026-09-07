-- Apply before deploying share-altar. Existing anonymous links remain readable.
begin;
alter table public.altars add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.altars add column if not exists owner_slot smallint;
alter table public.altars add constraint altars_owner_slot_check check (
  (owner_id is null and owner_slot is null) or (owner_id is not null and owner_slot is not null and owner_slot between 1 and 3)
);
create unique index altars_owner_slot_unique on public.altars(owner_id, owner_slot);

create or replace function public.assign_altar_slot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and old.owner_id is not null and new.owner_id is not null and new.owner_id <> old.owner_id then
    raise exception 'No se puede transferir el altar a otra cuenta' using errcode = '42501';
  end if;
  if new.owner_id is null then new.owner_slot := null; return new; end if;
  if TG_OP = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    new.owner_slot := old.owner_slot; return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select slot into new.owner_slot from generate_series(1, 3) slot
    where not exists (select 1 from public.altars a where a.owner_id = new.owner_id and a.owner_slot = slot)
    order by slot limit 1;
  if new.owner_slot is null then raise exception 'Máximo 3 altares por cuenta' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger assign_altar_slot before insert or update of owner_id, owner_slot on public.altars
for each row execute function public.assign_altar_slot();

-- Ownership stays private; expose only the authenticated user's records.
create or replace function public.my_altars() returns table (
  slug text, name text, objects jsonb, photo_url text, cloth_color text, status text, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select a.slug, a.name, a.objects, a.photo_url, a.cloth_color, a.status::text, a.created_at
  from public.altars a where a.owner_id = auth.uid() order by a.created_at desc;
$$;
create or replace function public.delete_my_altar(p_slug text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.altars where slug = p_slug and owner_id = auth.uid();
  return found;
end $$;
revoke all on function public.my_altars() from public, anon;
revoke all on function public.delete_my_altar(text) from public, anon;
grant execute on function public.my_altars(), public.delete_my_altar(text) to authenticated;
commit;
