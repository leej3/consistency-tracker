create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  is_default boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default timezone('UTC', now()),
  updated_at timestamptz not null default timezone('UTC', now())
);

create unique index if not exists people_default_one_only on public.people (is_default) where is_default;

create table if not exists public.consistency_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  at timestamptz not null default timezone('UTC', date_trunc('hour', now())),
  score smallint not null check (score >= 1 and score <= 7),
  comment text,
  created_at timestamptz not null default timezone('UTC', now()),
  updated_at timestamptz not null default timezone('UTC', now()),
  constraint consistency_entries_hourly unique (person_id, at),
  constraint consistency_entries_comment_length check (char_length(coalesce(comment, '')) <= 1000),
  constraint consistency_entries_at_hour check (
    date_part('minute', at AT TIME ZONE 'UTC') = 0
    and date_part('second', at AT TIME ZONE 'UTC') = 0
    and date_part('milliseconds', at AT TIME ZONE 'UTC') = 0
  )
);

create index if not exists consistency_entries_person_idx on public.consistency_entries (person_id, at desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('UTC', now());
  return new;
end;
$$ language plpgsql;

create trigger consistency_entries_set_updated_at
before update on public.consistency_entries
for each row execute function public.touch_updated_at();

create or replace function public.touch_people_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('UTC', now());
  return new;
end;
$$ language plpgsql;

create trigger people_set_updated_at
before update on public.people
for each row execute function public.touch_people_updated_at();

alter table public.people enable row level security;
alter table public.consistency_entries enable row level security;

create policy people_read_write on public.people
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy entries_read_write on public.consistency_entries
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
