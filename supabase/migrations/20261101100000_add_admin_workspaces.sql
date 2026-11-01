-- Workspace isolation is additive. Existing rows remain unmodified and are
-- treated as belonging to the legacy workspace while their workspace_id is NULL.
do $$
declare
  requirement text;
  target_table text;
  parts text[];
  requirements text[] := array[
    'profiles.id',
    'profiles.role',
    'profiles.full_name',
    'customers.id',
    'customers.customer_id',
    'customers.created_by',
    'finance_records.id',
    'finance_records.customer_id',
    'finance_records.collection_category_id',
    'finance_records.user_id',
    'finance_payments.id',
    'finance_payments.finance_record_id',
    'finance_payments.user_id',
    'repayment_schedule.id',
    'repayment_schedule.finance_record_id',
    'app_settings.id',
    'app_settings.business_name',
    'app_settings.currency_symbol',
    'app_settings.default_interest_rate',
    'app_settings.overdue_grace_days',
    'app_settings.require_gps',
    'app_settings.require_collection_proof',
    'app_settings.updated_at',
    'agents.id',
    'agents.agent_id',
    'agents.auth_user_id',
    'agents.created_by',
    'category_agent_assignments.agent_id',
    'category_agent_assignments.category_id',
    'collection_categories.id',
    'collection_evidence.finance_record_id',
    'collection_evidence.payment_id',
    'collection_evidence.agent_id',
    'collection_evidence.created_by',
    'agent_settlements.agent_id',
    'finance_principal_adjustments.finance_record_id',
    'finance_principal_adjustments.created_by',
    'security_audit_logs.actor_user_id'
  ];
  workspace_tables text[] := array[
    'profiles',
    'customers',
    'finance_records',
    'finance_payments',
    'repayment_schedule',
    'app_settings',
    'agents',
    'category_agent_assignments',
    'collection_categories',
    'collection_evidence',
    'agent_settlements',
    'finance_principal_adjustments',
    'security_audit_logs'
  ];
begin
  if to_regclass('public.workspaces') is not null then
    raise exception 'public.workspaces already exists; review its schema before applying this migration';
  end if;

  foreach requirement in array requirements loop
    parts := string_to_array(requirement, '.');

    if to_regclass(format('public.%I', parts[1])) is null then
      raise exception 'Workspace migration requires existing table public.%', parts[1];
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = parts[1]
        and column_name = parts[2]
    ) then
      raise exception 'Workspace migration requires existing column public.%.%', parts[1], parts[2];
    end if;
  end loop;

  foreach target_table in array workspace_tables loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = target_table
        and column_name = 'workspace_id'
    ) then
      raise exception 'public.% already has workspace_id; review existing tenant configuration', target_table;
    end if;
  end loop;

  if not exists (
    select 1
    from storage.buckets
    where id = 'collection-proofs'
  ) then
    raise exception 'Workspace migration requires the collection-proofs storage bucket';
  end if;

  if to_regprocedure('public.record_agent_payment(bigint,numeric,date)') is null
     or to_regprocedure('public.record_interest_only_payment(bigint,numeric,date)') is null
     or to_regprocedure(
       'public.adjust_interest_only_principal(bigint,date,text,numeric,text)'
     ) is null
     or to_regprocedure('public.schedule_interest_only_due_date(bigint,date)') is null then
    raise exception 'Workspace migration requires the existing payment and scheduling RPCs';
  end if;
end;
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into public.workspaces (id, name)
values (
  '00000000-0000-4000-8000-000000000001',
  'Existing Admin Workspace'
);

do $$
declare
  table_name text;
  workspace_tables text[] := array[
    'profiles',
    'customers',
    'finance_records',
    'finance_payments',
    'repayment_schedule',
    'app_settings',
    'agents',
    'category_agent_assignments',
    'collection_categories',
    'collection_evidence',
    'agent_settlements',
    'finance_principal_adjustments',
    'security_audit_logs'
  ];
begin
  foreach table_name in array workspace_tables loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id)',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (workspace_id)',
      'finance_' || table_name || '_workspace_id_idx',
      table_name
    );
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
  end loop;
end;
$$;

create unique index if not exists app_settings_workspace_unique_idx
  on public.app_settings (workspace_id)
  where workspace_id is not null;

-- Preserve global uniqueness for legacy rows while allowing independent
-- customer and agent identifiers in each new workspace.
alter table public.customers
  drop constraint customers_customer_id_key;

create unique index customers_workspace_customer_id_key
  on public.customers (
    (coalesce(
      workspace_id,
      '00000000-0000-4000-8000-000000000001'::uuid
    )),
    customer_id
  );

alter table public.agents
  drop constraint agents_agent_id_key;

create unique index agents_workspace_agent_id_key
  on public.agents (
    (coalesce(
      workspace_id,
      '00000000-0000-4000-8000-000000000001'::uuid
    )),
    agent_id
  );

alter table public.workspaces enable row level security;

create function public.finance_current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
    )
    then coalesce(
      (
        select profiles.workspace_id
        from public.profiles
        where profiles.id = auth.uid()
      ),
      '00000000-0000-4000-8000-000000000001'::uuid
    )
  end
  where auth.uid() is not null;
$$;

revoke all on function public.finance_current_workspace_id() from public, anon;
grant execute on function public.finance_current_workspace_id() to authenticated, service_role;

create function public.finance_assign_and_check_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_workspace uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  current_workspace := public.finance_current_workspace_id();

  if tg_op = 'INSERT' then
    if current_workspace is null then
      raise exception 'A workspace is required for this operation';
    end if;

    new.workspace_id := current_workspace;
    return new;
  end if;

  if coalesce(old.workspace_id, '00000000-0000-4000-8000-000000000001'::uuid)
       is distinct from current_workspace then
    raise exception 'You cannot modify data outside your workspace';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'Workspace membership cannot be changed here';
  end if;

  return new;
end;
$$;

create function public.finance_validate_workspace_relationships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  relation_spec text;
  relation_specs text[];
  relation_parts text[];
  relation_id text;
  related_workspace uuid;
  row_workspace uuid;
begin
  row_workspace := coalesce(
    new.workspace_id,
    '00000000-0000-4000-8000-000000000001'::uuid
  );

  case tg_table_name
    when 'agents' then
      relation_specs := array[
        'auth_user_id:profiles:id',
        'created_by:profiles:id'
      ];
    when 'customers' then
      relation_specs := array['created_by:profiles:id'];
    when 'finance_records' then
      relation_specs := array[
        'customer_id:customers:id',
        'collection_category_id:collection_categories:id',
        'user_id:profiles:id'
      ];
    when 'finance_payments' then
      relation_specs := array[
        'finance_record_id:finance_records:id',
        'user_id:profiles:id'
      ];
    when 'repayment_schedule' then
      relation_specs := array['finance_record_id:finance_records:id'];
    when 'finance_principal_adjustments' then
      relation_specs := array[
        'finance_record_id:finance_records:id',
        'created_by:profiles:id'
      ];
    when 'category_agent_assignments' then
      relation_specs := array[
        'agent_id:agents:id',
        'category_id:collection_categories:id'
      ];
    when 'agent_settlements' then
      relation_specs := array['agent_id:agents:id'];
    when 'collection_evidence' then
      relation_specs := array[
        'finance_record_id:finance_records:id',
        'payment_id:finance_payments:id',
        'agent_id:agents:id',
        'created_by:profiles:id'
      ];
    when 'security_audit_logs' then
      relation_specs := array['actor_user_id:profiles:id'];
    else
      relation_specs := array[]::text[];
  end case;

  foreach relation_spec in array relation_specs loop
    relation_parts := string_to_array(relation_spec, ':');
    relation_id := to_jsonb(new) ->> relation_parts[1];

    if relation_id is null then
      continue;
    end if;

    related_workspace := null;
    execute format(
      'select coalesce(workspace_id, $1) from public.%I where %I::text = $2',
      relation_parts[2],
      relation_parts[3]
    )
    into related_workspace
    using '00000000-0000-4000-8000-000000000001'::uuid, relation_id;

    if related_workspace is null or related_workspace is distinct from row_workspace then
      raise exception 'Related data must belong to the same workspace';
    end if;
  end loop;

  return new;
end;
$$;

do $$
declare
  table_name text;
  workspace_tables text[] := array[
    'profiles',
    'customers',
    'finance_records',
    'finance_payments',
    'repayment_schedule',
    'app_settings',
    'agents',
    'category_agent_assignments',
    'collection_categories',
    'collection_evidence',
    'agent_settlements',
    'finance_principal_adjustments',
    'security_audit_logs'
  ];
begin
  foreach table_name in array workspace_tables loop
    execute format(
      'create trigger finance_workspace_10_scope_guard before insert or update or delete on public.%I for each row execute function public.finance_assign_and_check_workspace()',
      table_name
    );

    execute format(
      'create trigger finance_workspace_20_relationship_guard before insert or update on public.%I for each row execute function public.finance_validate_workspace_relationships()',
      table_name
    );

    execute format(
      'create policy finance_workspace_isolation_guard on public.%I as restrictive for all to authenticated using (workspace_id = public.finance_current_workspace_id() or (workspace_id is null and public.finance_current_workspace_id() = %L::uuid)) with check (workspace_id = public.finance_current_workspace_id() or (workspace_id is null and public.finance_current_workspace_id() = %L::uuid))',
      table_name,
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001'
    );

    execute format(
      'create policy finance_workspace_anonymous_guard on public.%I as restrictive for all to anon using (false) with check (false)',
      table_name
    );
  end loop;
end;
$$;

create policy finance_workspace_membership_read
  on public.workspaces
  for select
  to authenticated
  using (id = public.finance_current_workspace_id());

-- The collection-proofs bucket is already private. Its storage.objects RLS
-- policies are installed separately via the Supabase SQL Editor because the
-- migration role does not own Supabase's managed storage.objects table.

create function public.finance_assert_record_workspace(p_finance_record_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.finance_current_workspace_id() is null
     or not exists (
       select 1
       from public.finance_records
       where id = p_finance_record_id
         and coalesce(
           workspace_id,
           '00000000-0000-4000-8000-000000000001'::uuid
         ) = public.finance_current_workspace_id()
     ) then
    raise exception 'Finance record not found';
  end if;
end;
$$;

revoke all on function public.finance_assert_record_workspace(bigint)
  from public, anon, authenticated;

alter function public.record_agent_payment(bigint, numeric, date)
  rename to finance_unscoped_record_agent_payment;
revoke all on function public.finance_unscoped_record_agent_payment(bigint, numeric, date)
  from public, anon, authenticated;
create function public.record_agent_payment(
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.finance_assert_record_workspace(p_finance_record_id);
  return public.finance_unscoped_record_agent_payment(
    p_finance_record_id,
    p_payment_amount,
    p_payment_date
  );
end;
$$;
revoke all on function public.record_agent_payment(bigint, numeric, date)
  from public, anon;
grant execute on function public.record_agent_payment(bigint, numeric, date)
  to authenticated;

alter function public.record_interest_only_payment(bigint, numeric, date)
  rename to finance_unscoped_record_interest_only_payment;
revoke all on function public.finance_unscoped_record_interest_only_payment(bigint, numeric, date)
  from public, anon, authenticated;
create function public.record_interest_only_payment(
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.finance_assert_record_workspace(p_finance_record_id);
  return public.finance_unscoped_record_interest_only_payment(
    p_finance_record_id,
    p_payment_amount,
    p_payment_date
  );
end;
$$;
revoke all on function public.record_interest_only_payment(bigint, numeric, date)
  from public, anon;
grant execute on function public.record_interest_only_payment(bigint, numeric, date)
  to authenticated;

alter function public.adjust_interest_only_principal(
  bigint,
  date,
  text,
  numeric,
  text
)
  rename to finance_unscoped_adjust_interest_only_principal;
revoke all on function public.finance_unscoped_adjust_interest_only_principal(
  bigint,
  date,
  text,
  numeric,
  text
)
  from public, anon, authenticated;
create function public.adjust_interest_only_principal(
  p_finance_record_id bigint,
  p_adjustment_date date,
  p_adjustment_type text,
  p_adjustment_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.finance_assert_record_workspace(p_finance_record_id);
  return public.finance_unscoped_adjust_interest_only_principal(
    p_finance_record_id,
    p_adjustment_date,
    p_adjustment_type,
    p_adjustment_amount,
    p_reason
  );
end;
$$;
revoke all on function public.adjust_interest_only_principal(
  bigint,
  date,
  text,
  numeric,
  text
)
  from public, anon;
grant execute on function public.adjust_interest_only_principal(
  bigint,
  date,
  text,
  numeric,
  text
)
  to authenticated;

alter function public.schedule_interest_only_due_date(bigint, date)
  rename to finance_unscoped_schedule_interest_only_due_date;
revoke all on function public.finance_unscoped_schedule_interest_only_due_date(bigint, date)
  from public, anon, authenticated;
create function public.schedule_interest_only_due_date(
  p_finance_record_id bigint,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.finance_assert_record_workspace(p_finance_record_id);
  return public.finance_unscoped_schedule_interest_only_due_date(
    p_finance_record_id,
    p_due_date
  );
end;
$$;
revoke all on function public.schedule_interest_only_due_date(bigint, date)
  from public, anon;
grant execute on function public.schedule_interest_only_due_date(bigint, date)
  to authenticated;

notify pgrst, 'reload schema';
