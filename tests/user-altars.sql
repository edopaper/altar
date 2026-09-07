-- Run after migration 016 inside a transaction; the caller must ROLLBACK.
do $$
declare
  account_a uuid := gen_random_uuid();
  account_b uuid := gen_random_uuid();
  prefix text := 'test-' || gen_random_uuid()::text;
  total integer;
begin
  insert into auth.users(id) values (account_a), (account_b);
  for i in 1..3 loop
    insert into public.altars(slug, objects, owner_id) values (prefix || i, '[]', account_a);
  end loop;
  begin
    insert into public.altars(slug, objects, owner_id) values (prefix || 'fourth', '[]', account_a);
    raise exception 'FAIL: fourth altar accepted' using errcode = 'XX000';
  exception when sqlstate 'P0001' then null;
  end;
  update public.altars set name = 'Updated', owner_id = account_a where slug = prefix || '1';
  insert into public.altars(slug, objects, owner_id) values (prefix || 'other', '[]', account_b);
  perform set_config('request.jwt.claim.sub', account_a::text, true);
  select count(*) into total from public.my_altars();
  if total <> 3 then raise exception 'FAIL: owner isolation'; end if;
  if public.delete_my_altar(prefix || 'other') then raise exception 'FAIL: deleted another owner'; end if;
  if not public.delete_my_altar(prefix || '1') then raise exception 'FAIL: own delete'; end if;
  insert into public.altars(slug, objects, owner_id) values (prefix || 'replacement', '[]', account_a);
  select count(*) into total from public.my_altars();
  if total <> 3 then raise exception 'FAIL: quota not reusable'; end if;
  begin
    update public.altars set owner_id = account_b where slug = prefix || '2';
    raise exception 'FAIL: owner transfer allowed' using errcode = 'XX000';
  exception when insufficient_privilege then null;
  end;
end $$;
