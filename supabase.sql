create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table app_state enable row level security;

drop policy if exists "auth read app state" on app_state;
create policy "auth read app state"
on app_state
for select
to authenticated
using (id = 'main');

drop policy if exists "auth insert app state" on app_state;
create policy "auth insert app state"
on app_state
for insert
to authenticated
with check (id = 'main');

drop policy if exists "auth update app state" on app_state;
create policy "auth update app state"
on app_state
for update
to authenticated
using (id = 'main')
with check (id = 'main');
