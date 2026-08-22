-- Ocultamiento automático de altares muy reportados + revisión manual.
alter table public.altars
  add column if not exists status text not null default 'visible';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'altars_status_check'
  ) then
    alter table public.altars
      add constraint altars_status_check check (status in ('visible', 'hidden'));
  end if;
end $$;

create index if not exists altars_status_idx on public.altars (status);
