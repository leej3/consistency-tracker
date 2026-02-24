create or replace function public.is_allowed_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = any (
      array[
        'johnlee3@gmail.com',
        'emily.langhorne@gmail.com'
      ]
    ),
    false
  );
$$;

create or replace function public.set_default_person(person_uuid uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_allowed_admin() then
    raise exception 'not authorized to set default person' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.people
    where id = person_uuid
  ) then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  update public.people
  set is_default = false
  where is_default = true
    and id <> person_uuid;

  update public.people
  set is_default = true
  where id = person_uuid;
end;
$$;

drop policy if exists people_read_write on public.people;
drop policy if exists entries_read_write on public.consistency_entries;
drop policy if exists people_admin_select on public.people;
drop policy if exists people_admin_insert on public.people;
drop policy if exists people_admin_update on public.people;
drop policy if exists people_admin_delete on public.people;
drop policy if exists entries_admin_select on public.consistency_entries;
drop policy if exists entries_admin_insert on public.consistency_entries;
drop policy if exists entries_admin_update on public.consistency_entries;
drop policy if exists entries_admin_delete on public.consistency_entries;

create policy people_admin_select
  on public.people
  for select
  using (public.is_allowed_admin());

create policy people_admin_insert
  on public.people
  for insert
  with check (public.is_allowed_admin());

create policy people_admin_update
  on public.people
  for update
  using (public.is_allowed_admin())
  with check (public.is_allowed_admin());

create policy people_admin_delete
  on public.people
  for delete
  using (public.is_allowed_admin());

create policy entries_admin_select
  on public.consistency_entries
  for select
  using (public.is_allowed_admin());

create policy entries_admin_insert
  on public.consistency_entries
  for insert
  with check (public.is_allowed_admin());

create policy entries_admin_update
  on public.consistency_entries
  for update
  using (public.is_allowed_admin())
  with check (public.is_allowed_admin());

create policy entries_admin_delete
  on public.consistency_entries
  for delete
  using (public.is_allowed_admin());
