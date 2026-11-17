-- ============================================================================
-- Concurrency, idempotency and cache-coherence primitives
-- ----------------------------------------------------------------------------
-- Additive only: no table is dropped, no row is rewritten.
--
-- Production Postgres settings that pair with this migration (see
-- deploy/postgresql.conf):
--   synchronous_commit = on
--   default_transaction_isolation = 'read committed'
--   statement_timeout = '30s'
--   idle_in_transaction_session_timeout = '15s'
-- Financial write RPCs should run at SERIALIZABLE or acquire the workspace
-- advisory lock below. Both guarantee a single serial history per workspace.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotency ledger — makes retries safe under concurrent requests
-- ----------------------------------------------------------------------------

create table if not exists public.idempotency_keys (
  workspace_id uuid not null default '00000000-0000-4000-8000-000000000001',
  scope text not null,
  key text not null,
  request_hash text null,
  response jsonb null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  primary key (workspace_id, scope, key)
);

comment on table public.idempotency_keys is
  'Deduplicates retried mutations across all application servers. A repeated (workspace, scope, key) is rejected atomically.';

create index if not exists idempotency_keys_expiry_idx
  on public.idempotency_keys (expires_at);

alter table public.idempotency_keys enable row level security;

drop policy if exists idempotency_service_only on public.idempotency_keys;
create policy idempotency_service_only
  on public.idempotency_keys
  for all
  to authenticated
  using (false)
  with check (false);

-- Returns TRUE exactly once per key. Safe under concurrent inserts.
create or replace function public.claim_idempotency_key(
  p_scope text,
  p_key text,
  p_workspace_id uuid default '00000000-0000-4000-8000-000000000001',
  p_request_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.idempotency_keys (workspace_id, scope, key, request_hash)
  values (p_workspace_id, p_scope, p_key, p_request_hash)
  on conflict (workspace_id, scope, key) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_idempotency_key(text, text, uuid, text) from public;
grant execute on function public.claim_idempotency_key(text, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Cross-node cache versioning
-- ----------------------------------------------------------------------------

create table if not exists public.workspace_cache_versions (
  workspace_id uuid primary key,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.workspace_cache_versions is
  'Monotonic version per workspace. Every API node compares it before serving cached reads, eliminating stale data across servers.';

insert into public.workspace_cache_versions (workspace_id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (workspace_id) do nothing;

alter table public.workspace_cache_versions enable row level security;

drop policy if exists workspace_cache_versions_read on public.workspace_cache_versions;
create policy workspace_cache_versions_read
  on public.workspace_cache_versions
  for select
  to authenticated
  using (true);

create or replace function public.bump_workspace_cache_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
begin
  if tg_op = 'DELETE' then
    v_workspace := old.workspace_id;
  else
    v_workspace := new.workspace_id;
  end if;

  insert into public.workspace_cache_versions (workspace_id, version, updated_at)
  values (v_workspace, 1, now())
  on conflict (workspace_id) do update
    set version = public.workspace_cache_versions.version + 1,
        updated_at = now();

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when undefined_column then
    -- Legacy deployments without workspace_id still get a global version bump.
    insert into public.workspace_cache_versions (workspace_id, version, updated_at)
    values ('00000000-0000-4000-8000-000000000001', 1, now())
    on conflict (workspace_id) do update
      set version = public.workspace_cache_versions.version + 1,
          updated_at = now();
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'customers',
    'finance_records',
    'finance_payments',
    'repayment_schedule',
    'agents',
    'category_agent_assignments',
    'collection_categories',
    'collection_evidence',
    'agent_settlements'
  ];
begin
  foreach v_table in array v_tables loop
    -- Only tables that actually carry workspace_id get the per-row trigger.
    -- This avoids raising (and catching) an exception on every row.
    if to_regclass('public.' || v_table) is not null
       and exists (
         select 1
           from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = v_table
            and c.column_name = 'workspace_id'
       )
    then
      execute format('drop trigger if exists %I on public.%I', v_table || '_bump_cache_version', v_table);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.bump_workspace_cache_version()',
        v_table || '_bump_cache_version',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Workspace advisory lock — serialises financial mutations per workspace
-- ----------------------------------------------------------------------------

create or replace function public.finance_lock_workspace(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select pg_advisory_xact_lock(
    hashtextextended(
      coalesce(p_workspace_id, '00000000-0000-4000-8000-000000000001')::text,
      0
    )
  );
$$;

comment on function public.finance_lock_workspace(uuid) is
  'Transaction-scoped lock for payment/settlement writes. Guarantees serialised balance updates across all API nodes.';

revoke all on function public.finance_lock_workspace(uuid) from public;
grant execute on function public.finance_lock_workspace(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Hot-path indexes for concurrent reads
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.finance_payments') is not null then
    execute 'create index if not exists finance_payments_workspace_date_idx on public.finance_payments (workspace_id, payment_date desc)';
    execute 'create index if not exists finance_payments_finance_idx on public.finance_payments (finance_record_id, payment_date desc)';
  end if;

  if to_regclass('public.finance_records') is not null then
    execute 'create index if not exists finance_records_workspace_type_idx on public.finance_records (workspace_id, finance_type)';
    execute 'create index if not exists finance_records_workspace_pending_idx on public.finance_records (workspace_id, pending) where pending > 0';
  end if;

  if to_regclass('public.repayment_schedule') is not null then
    execute 'create index if not exists repayment_schedule_finance_due_idx on public.repayment_schedule (finance_record_id, due_date)';
  end if;

  if to_regclass('public.customers') is not null then
    execute 'create index if not exists customers_workspace_status_idx on public.customers (workspace_id, status)';
  end if;

  if to_regclass('public.agents') is not null then
    execute 'create index if not exists agents_auth_user_idx on public.agents (auth_user_id)';
    execute 'create index if not exists agents_workspace_status_idx on public.agents (workspace_id, status)';
  end if;
end;
$$;

-- Refresh PostgREST's schema cache so new RPCs are immediately callable.
notify pgrst, 'reload schema';
