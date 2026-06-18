create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

alter table app_state add column if not exists version integer not null default 1;

create table if not exists app_authorized_users (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table app_state enable row level security;
alter table app_authorized_users enable row level security;

create or replace function is_lunamia_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from app_authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "auth read app state" on app_state;
create policy "auth read app state"
on app_state
for select
to authenticated
using (id = 'main' and is_lunamia_authorized());

drop policy if exists "auth insert app state" on app_state;
create policy "auth insert app state"
on app_state
for insert
to authenticated
with check (id = 'main' and is_lunamia_authorized());

drop policy if exists "auth update app state" on app_state;
create policy "auth update app state"
on app_state
for update
to authenticated
using (id = 'main' and is_lunamia_authorized())
with check (id = 'main' and is_lunamia_authorized());

drop policy if exists "auth read own allowlist row" on app_authorized_users;
create policy "auth read own allowlist row"
on app_authorized_users
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
