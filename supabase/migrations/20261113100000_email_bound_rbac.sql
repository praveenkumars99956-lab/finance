-- ============================================================================
-- Email-bound role access control (admin / agent / client)
-- ----------------------------------------------------------------------------
-- Additive migration: it never drops or rewrites existing rows.
--
-- Identity flow:
--   1. role_bindings maps a verified login email to exactly one role.
--   2. public.current_user_role() resolves the role from the JWT email first,
--      then falls back to public.profiles.role.
--   3. Admin and agent workflows are isolated: agents cannot create finance
--      records, and a profile role cannot silently drift from its email
--      binding.
--
-- Apply with:  supabase db push
-- ============================================================================

create table if not exists public.role_bindings (
  email text primary key,
  role text not null check (role in ('admin', 'agent', 'client')),
  workspace_id uuid null,
  active boolean not null default true,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_bindings_email_lowercase check (email = lower(email))
);

comment on table public.role_bindings is
  'Authoritative email → role bindings. Used by public.current_user_role() and enforced by database triggers.';

create index if not exists role_bindings_role_idx
  on public.role_bindings (role)
  where active;

create index if not exists role_bindings_workspace_idx
  on public.role_bindings (workspace_id)
  where active;

-- Keep updated_at honest.
create or replace function public.touch_role_binding_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(new.email);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists role_bindings_touch_updated_at on public.role_bindings;
create trigger role_bindings_touch_updated_at
  before insert or update on public.role_bindings
  for each row
  execute function public.touch_role_binding_updated_at();

-- Seed existing identities without overwriting deliberate bindings.
do $$
begin
  if to_regclass('public.profiles') is not null and to_regclass('auth.users') is not null then
    insert into public.role_bindings (email, role)
    select lower(u.email), lower(p.role)
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.email is not null
      and lower(p.role) in ('admin', 'agent', 'client')
    on conflict (email) do nothing;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Server-side role resolution
-- ----------------------------------------------------------------------------

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

comment on function public.current_user_email() is
  'Verified login email from the current JWT (lower-cased), empty string when anonymous.';

create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_role text;
begin
  if v_email <> '' then
    select rb.role
      into v_role
      from public.role_bindings rb
     where rb.email = v_email
       and rb.active
     order by rb.updated_at desc
     limit 1;

    if v_role is not null then
      return v_role;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    select lower(p.role)
      into v_role
      from public.profiles p
     where p.id = auth.uid();
  end if;

  return coalesce(v_role, 'client');
end;
$$;

comment on function public.current_user_role() is
  'Authoritative role for the current session: email binding first, profiles.role second, client last.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'agent';
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_email() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_agent() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_agent() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS for the binding table: admins read, nobody writes through the API
-- ----------------------------------------------------------------------------

alter table public.role_bindings enable row level security;

drop policy if exists role_bindings_admin_select on public.role_bindings;
create policy role_bindings_admin_select
  on public.role_bindings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists role_bindings_no_client_writes on public.role_bindings;
drop policy if exists role_bindings_admin_write on public.role_bindings;
create policy role_bindings_admin_write
  on public.role_bindings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Guard 1: a profile role cannot diverge from its email binding
-- ----------------------------------------------------------------------------

create or replace function public.enforce_profile_role_binding()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_bound_role text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  select lower(u.email) into v_email
    from auth.users u
   where u.id = new.id;

  if v_email is null then
    return new;
  end if;

  select rb.role into v_bound_role
    from public.role_bindings rb
   where rb.email = v_email
     and rb.active
   order by rb.updated_at desc
   limit 1;

  if v_bound_role is not null and lower(new.role) <> v_bound_role then
    raise exception
      'profiles.role is bound to "%" for %; refusing change to "%"',
      v_bound_role, v_email, new.role
      using errcode = '42501';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists profiles_enforce_role_binding on public.profiles;
    create trigger profiles_enforce_role_binding
      before update of role on public.profiles
      for each row
      execute function public.enforce_profile_role_binding();
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Guard 2: only admins may INSERT finance records
-- (Agents record collections/payments through their scoped RPCs; they never
--  create lending products. Service-role and direct SQL are unaffected.)
-- ----------------------------------------------------------------------------

create or replace function public.enforce_finance_insert_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.current_user_role() <> 'admin' then
    raise exception 'Only administrators may create finance records (role=%)',
      public.current_user_role()
      using errcode = '42501';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.finance_records') is not null then
    drop trigger if exists finance_records_enforce_insert_role on public.finance_records;
    create trigger finance_records_enforce_insert_role
      before insert on public.finance_records
      for each row
      execute function public.enforce_finance_insert_role();
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Guard 3: role changes are auditable
-- ----------------------------------------------------------------------------

create or replace function public.audit_role_binding_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_old_role text;
  v_new_role text;
  v_active boolean;
begin
  if to_regclass('public.security_audit_logs') is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_email := old.email;
    v_old_role := old.role;
    v_new_role := null;
    v_active := old.active;
  else
    v_email := new.email;
    v_old_role := case when tg_op = 'UPDATE' then old.role else null end;
    v_new_role := new.role;
    v_active := new.active;
  end if;

  insert into public.security_audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    auth.uid(),
    coalesce(public.current_user_role(), 'system'),
    lower(tg_op),
    'role_bindings',
    v_email,
    jsonb_build_object(
      'email', v_email,
      'old_role', v_old_role,
      'new_role', v_new_role,
      'active', v_active
    )
  );

  return null;
exception
  when others then
    -- Auditing must never block an administrative correction.
    return null;
end;
$$;

do $$
begin
  drop trigger if exists role_bindings_audit_change on public.role_bindings;
  create trigger role_bindings_audit_change
    after insert or update or delete on public.role_bindings
    for each row
    execute function public.audit_role_binding_change();
end;
$$;
