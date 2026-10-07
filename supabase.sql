-- Ejecutar como administrador desde SQL Editor. No reemplaza el documento existente.
-- Primera ejecución: prepara esquema y control de versiones. Agregar los emails
-- autorizados a app_authorized_users y volver a ejecutar para aplicar la allowlist.
begin;

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

alter table public.app_state add column if not exists version integer not null default 1;

create table if not exists public.app_authorized_users (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.app_state enable row level security;
alter table public.app_authorized_users enable row level security;

create or replace function public.is_lunamia_authorized()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_authorized_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_lunamia_authorized() from public;
grant execute on function public.is_lunamia_authorized() to authenticated;

-- También protege frente a pestañas antiguas que no envían la versión.
create or replace function public.guard_lunamia_state_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.version is distinct from old.version + 1 then
    raise exception 'La base cambió o la aplicación necesita recargarse.' using errcode = '40001';
  end if;
  if pg_catalog.jsonb_typeof(new.data) is distinct from 'object' then
    raise exception 'El estado debe ser un documento JSON válido.' using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

drop trigger if exists guard_lunamia_state_update on public.app_state;
create trigger guard_lunamia_state_update
before update on public.app_state
for each row execute function public.guard_lunamia_state_update();

drop policy if exists "auth read own allowlist row" on public.app_authorized_users;
create policy "auth read own allowlist row"
on public.app_authorized_users
for select to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select on public.app_authorized_users to authenticated;
grant select, insert, update on public.app_state to authenticated;
commit;

-- No bloquear a toda la tienda si todavía no se provisionó su allowlist.
do $$
declare
  policy_row record;
begin
  if not exists (select 1 from public.app_authorized_users where trim(email) <> '') then
    raise notice 'Esquema preparado. Agregá los emails autorizados a app_authorized_users y ejecutá este archivo otra vez para activar la allowlist.';
    return;
  end if;

  -- Las políticas RLS se combinan con OR: quitar también las políticas antiguas
  -- con otros nombres, para que una regla amplia no anule la allowlist.
  for policy_row in select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'app_state' loop
    execute format('drop policy %I on public.app_state', policy_row.policyname);
  end loop;

create policy "auth read app state"
on public.app_state
for select
to authenticated
using (id = 'main' and is_lunamia_authorized());

create policy "auth insert app state"
on public.app_state
for insert
to authenticated
with check (id = 'main' and is_lunamia_authorized());

create policy "auth update app state"
on public.app_state
for update
to authenticated
using (id = 'main' and is_lunamia_authorized())
with check (id = 'main' and is_lunamia_authorized());
end;
$$;
