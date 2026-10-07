-- SOLO para la base aislada lunamia_qa; nunca ejecutar en producción.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'lunamia_qa' then raise exception 'Esta prueba requiere una base aislada llamada lunamia_qa.'; end if;
end $$;
create role anon;
create role authenticated;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

\ir ../supabase.sql
insert into public.app_authorized_users(email) values ('dueno@ejemplo.test'), ('otro@ejemplo.test');
update public.app_state set data = '{"qa":"conservado"}', version = version + 1 where id = 'main';
create policy "legacy wide access" on public.app_state for all to authenticated using (true) with check (true);
insert into public.app_state(id,data) values ('fuera-de-la-app','{}');
\ir ../supabase.sql
do $$ begin
  if exists(select 1 from pg_policies where tablename='app_state' and policyname='legacy wide access') then raise exception 'No se quitó la política amplia anterior.'; end if;
  if (select data->>'qa' from public.app_state where id='main') <> 'conservado' then raise exception 'La migración reemplazó datos existentes.'; end if;
end $$;

grant select on public.app_state to anon;
set role anon;
set request.jwt.claims = '{}';
do $$ begin
  if (select count(*) from public.app_state) <> 0 then raise exception 'Anon puede leer datos.'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"email":"intruso@ejemplo.test"}';
do $$ declare changed integer; begin
  if (select count(*) from public.app_state) <> 0 then raise exception 'Usuario no autorizado puede leer datos.'; end if;
  update public.app_state set data='{"intruso":true}',version=version+1 where id='main';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Usuario no autorizado puede modificar datos.'; end if;
  begin
    insert into public.app_state(id,data) values('nuevo-id','{}');
    raise exception 'Se permitió insertar un estado ajeno.';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claims = '{"email":"DUENO@EJEMPLO.TEST"}';
do $$ begin
  if (select count(*) from public.app_state) <> 1 then raise exception 'El usuario autorizado no ve únicamente main.'; end if;
  if (select count(*) from public.app_authorized_users) <> 1 then raise exception 'Se expone la allowlist de otros usuarios.'; end if;
  update public.app_state set data=data||'{"guardado":true}',version=version+1 where id='main';
  begin
    update public.app_state set data='{"sin_version":true}' where id='main';
    raise exception 'Se permitió un guardado sin avanzar la versión.';
  exception when sqlstate '40001' then null;
  end;
  begin
    update public.app_state set data='[]',version=version+1 where id='main';
    raise exception 'Se permitió un documento JSON inválido.';
  exception when check_violation then null;
  end;
  if (select data->>'guardado' from public.app_state where id='main') <> 'true' then raise exception 'Se perdió el guardado válido.'; end if;
end $$;
reset role;
select 'OK: migración idempotente, RLS, allowlist y control de versiones' as resultado;
