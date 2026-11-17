-- ============================================================
-- Agent portal performance fix
--
-- The agents' SELECT policies on customers and collection_categories
-- re-join finance_records for every embedded row. With the app's
-- finance_records?select=*,customers(...),collection_categories(...)
-- query, PostgREST exceeded its 8s statement timeout and returned 500,
-- leaving Agent Today / Customers / Pending / Loans stuck loading.
--
-- This migration:
--   1. Adds the indexes those policies need.
--   2. Simplifies the collection_categories policy so it no longer
--      re-scans finance_records (an agent assigned to a category may
--      see that category's name; the finance_records policy still
--      enforces loan-type visibility).
--
-- No data or permissions are widened: the same agents see the same
-- finance records. Only the planner cost changes.
-- ============================================================

-- ---------- supporting indexes ----------

create index if not exists idx_finance_records_customer
  on public.finance_records (customer_id);

create index if not exists idx_finance_records_category_status
  on public.finance_records (collection_category_id, loan_status);

create index if not exists idx_finance_records_loan_status_due
  on public.finance_records (loan_status, next_due_date);

create index if not exists idx_category_assignments_category_status
  on public.category_agent_assignments (category_id, status);

create index if not exists idx_agents_auth_user
  on public.agents (auth_user_id);

create index if not exists idx_finance_payments_record_date
  on public.finance_payments (finance_record_id, payment_date);

-- ---------- collection_categories: agent policy ----------
-- Previously joined finance_records for every category row. Category
-- visibility only needs the assignment, so keep it to that.

drop policy if exists "Agents can view assigned categories"
  on public.collection_categories;

create policy "Agents can view assigned categories"
  on public.collection_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.category_agent_assignments assignment
      join public.agents agent
        on agent.id = assignment.agent_id
      where assignment.category_id = collection_categories.id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
    )
  );

-- ---------- customers: agent policy ----------
-- Same semantics, rewritten so each lookup can use the indexes above.

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
        and (
          lower(trim(coalesce(assignment.collection_type, 'all'))) = 'all'
          or lower(trim(coalesce(assignment.collection_type, 'all')))
             = lower(trim(coalesce(finance.finance_type, '')))
        )
    )
  );

-- ---------- finance_records: agent policy ----------
-- Same logic as before; recreated so it uses the new indexes if the
-- planner had cached an older plan.

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
        and lower(trim(coalesce(assignment.collection_type, 'all'))) = any (
          array[
            'all',
            lower(trim(coalesce(finance_records.finance_type, '')))
          ]
        )
    )
  );

analyze public.finance_records;
analyze public.customers;
analyze public.collection_categories;
analyze public.category_agent_assignments;
analyze public.agents;
analyze public.finance_payments;
