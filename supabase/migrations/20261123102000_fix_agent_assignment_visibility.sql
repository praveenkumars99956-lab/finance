-- ============================================================================
-- Make admin loan assignments visible on the agent portal
-- ----------------------------------------------------------------------------
-- Agent SELECT policies and every agent portal page only expose a loan when
-- finance_records.collection_category_id matches an active assignment. Two
-- admin-side cases break that contract:
--
--   1. Legacy loans were saved with a NULL collection_category_id, so no
--      assignment can ever match them.
--   2. An assignment whose collection_type does not match the loan's
--      finance_type is saved successfully, but the loan is filtered out
--      everywhere on the agent side (including by RLS).
--
-- This migration backfills existing loans, guarantees future loans always get
-- a category, normalises the interest_only spelling in RLS, and aligns the
-- admin assignment policies with the authoritative current_user_role().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Cache-version trigger must tolerate legacy rows without a workspace
-- ---------------------------------------------------------------------------
-- finance_records still contains legacy rows whose workspace_id is NULL. A
-- bulk backfill bumps the workspace cache version for those rows, and the
-- existing function tried to insert NULL into a NOT NULL column, aborting the
-- whole operation. Legacy rows belong to the legacy workspace, so normalise
-- the value here.

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
  values (
    coalesce(v_workspace, '00000000-0000-4000-8000-000000000001'::uuid),
    1,
    now()
  )
  on conflict (workspace_id) do update
    set version = public.workspace_cache_versions.version + 1,
        updated_at = now();

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Shared finance-type normaliser (mirrors frontend agentAssignments.js)
-- ---------------------------------------------------------------------------

create or replace function public.finance_normalize_type(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(trim(coalesce(p_value, ''))) in ('interest-only', 'interestonly')
      then 'interest_only'
    else lower(trim(coalesce(p_value, '')))
  end;
$$;

grant execute on function public.finance_normalize_type(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Resolve the default collection category for a loan product in a workspace
-- ---------------------------------------------------------------------------

create or replace function public.finance_default_category_id(
  p_finance_type text,
  p_workspace_id uuid
)
returns bigint
language sql
stable
set search_path = public
as $$
  select c.id
  from public.collection_categories c
  where c.status = 'active'
    and c.category_type = case
      when public.finance_normalize_type(p_finance_type) = 'interest_only' then 'interest'
      when public.finance_normalize_type(p_finance_type) = 'weekly' then 'weekly'
      when public.finance_normalize_type(p_finance_type) = 'monthly' then 'monthly'
      else 'daily'
    end
    and (
      c.workspace_id is not distinct from
        coalesce(p_workspace_id, '00000000-0000-4000-8000-000000000001'::uuid)
      or (
        c.workspace_id is null
        and coalesce(p_workspace_id, '00000000-0000-4000-8000-000000000001'::uuid)
              = '00000000-0000-4000-8000-000000000001'::uuid
      )
    )
  order by (c.workspace_id is null), c.id
  limit 1;
$$;

grant execute on function public.finance_default_category_id(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing loans that have no category
-- ---------------------------------------------------------------------------

update public.finance_records f
set collection_category_id =
  public.finance_default_category_id(f.finance_type, f.workspace_id)
where f.collection_category_id is null
  and public.finance_default_category_id(f.finance_type, f.workspace_id) is not null;

-- ---------------------------------------------------------------------------
-- 4. Guarantee future loans always have a category
-- ---------------------------------------------------------------------------
-- Named "finance_workspace_15_..." so it fires after the workspace guard
-- (..._10_...) sets new.workspace_id and before the relationship guard
-- (..._20_...) validates the category/workspace pair.

create or replace function public.finance_assign_default_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.collection_category_id is null then
    new.collection_category_id :=
      public.finance_default_category_id(new.finance_type, new.workspace_id);
  end if;

  return new;
end;
$$;

drop trigger if exists finance_workspace_15_assign_default_category
  on public.finance_records;

create trigger finance_workspace_15_assign_default_category
  before insert on public.finance_records
  for each row execute function public.finance_assign_default_category();

-- ---------------------------------------------------------------------------
-- 5. Normalise interest_only spellings in agent SELECT policies
-- ---------------------------------------------------------------------------

drop policy if exists "Agents can view assigned finance records"
  on public.finance_records;

create policy "Agents can view assigned finance records"
  on public.finance_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.category_agent_assignments assignment
      join public.agents agent
        on agent.id = assignment.agent_id
      where assignment.category_id = finance_records.collection_category_id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and public.finance_normalize_type(assignment.collection_type) = any (
          array['all', public.finance_normalize_type(finance_records.finance_type)]
        )
    )
  );

drop policy if exists "Agents can view assigned customers"
  on public.customers;

create policy "Agents can view assigned customers"
  on public.customers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.finance_records finance
      join public.category_agent_assignments assignment
        on assignment.category_id = finance.collection_category_id
      join public.agents agent
        on agent.id = assignment.agent_id
      where finance.customer_id = customers.id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and public.finance_normalize_type(assignment.collection_type) = any (
          array['all', public.finance_normalize_type(finance.finance_type)]
        )
    )
  );

drop policy if exists "Agents can view assigned payments"
  on public.finance_payments;

create policy "Agents can view assigned payments"
  on public.finance_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.finance_records finance
      join public.category_agent_assignments assignment
        on assignment.category_id = finance.collection_category_id
      join public.agents agent
        on agent.id = assignment.agent_id
      where finance.id = finance_payments.finance_record_id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and public.finance_normalize_type(assignment.collection_type) = any (
          array['all', public.finance_normalize_type(finance.finance_type)]
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Admin assignment/agent policies use the authoritative role source
-- ---------------------------------------------------------------------------
-- Baseline projects already have these policies keyed on profiles.role.
-- Recreating them on current_user_role() keeps email-bound RBAC authoritative
-- while remaining backwards compatible (it falls back to profiles.role).

drop policy if exists "Admins can view category assignments"
  on public.category_agent_assignments;
create policy "Admins can view category assignments"
  on public.category_agent_assignments
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can create category assignments"
  on public.category_agent_assignments;
create policy "Admins can create category assignments"
  on public.category_agent_assignments
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can update category assignments"
  on public.category_agent_assignments;
create policy "Admins can update category assignments"
  on public.category_agent_assignments
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete category assignments"
  on public.category_agent_assignments;
create policy "Admins can delete category assignments"
  on public.category_agent_assignments
  for delete to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can view agents"
  on public.agents;
create policy "Admins can view agents"
  on public.agents
  for select to authenticated
  using (public.current_user_role() = 'admin');

analyze public.finance_records;
