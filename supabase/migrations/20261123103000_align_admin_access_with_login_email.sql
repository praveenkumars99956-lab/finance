-- ============================================================================
-- Access must follow the login email
-- ----------------------------------------------------------------------------
-- Most baseline admin policies still read profiles.role. The authoritative
-- role is current_user_role(), which resolves the verified login email first.
-- A stale profiles.role could therefore grant or deny admin access contrary
-- to the email binding. Workspace scope is likewise resolved from
-- role_bindings.workspace_id when present, then from the profile.
--
-- Permission levels are unchanged; only the source of the role/workspace is
-- made consistent with the signed-in email.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Email-bound workspace scope
-- ---------------------------------------------------------------------------

create or replace function public.finance_current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then
      null
    else
      coalesce(
        (
          select rb.workspace_id
          from public.role_bindings rb
          where rb.email = lower(coalesce(auth.jwt() ->> 'email', ''))
            and rb.active
            and rb.workspace_id is not null
          order by rb.updated_at desc
          limit 1
        ),
        (
          select p.workspace_id
          from public.profiles p
          where p.id = auth.uid()
        ),
        '00000000-0000-4000-8000-000000000001'::uuid
      )
  end;
$$;

-- Existing email bindings have no workspace recorded. Seed them from the
-- profile that matches the same login email so the email becomes authoritative
-- without changing any effective scope.
update public.role_bindings rb
set workspace_id = p.workspace_id
from public.profiles p
join auth.users u on u.id = p.id
where rb.workspace_id is null
  and p.workspace_id is not null
  and lower(trim(rb.email)) = lower(trim(u.email));

-- ---------------------------------------------------------------------------
-- 2. Admin policies use the email-bound role
-- ---------------------------------------------------------------------------

-- agents
drop policy if exists "Admin can view agents" on public.agents;
create policy "Admin can view agents" on public.agents
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can create agents" on public.agents;
create policy "Admins can create agents" on public.agents
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can update agents" on public.agents;
create policy "Admins can update agents" on public.agents
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete agents" on public.agents;
create policy "Admins can delete agents" on public.agents
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- app_settings
drop policy if exists "Admins can view app settings" on public.app_settings;
create policy "Admins can view app settings" on public.app_settings
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings" on public.app_settings
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- collection_categories
drop policy if exists "Admins can view collection categories" on public.collection_categories;
create policy "Admins can view collection categories" on public.collection_categories
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admins can create collection categories" on public.collection_categories;
create policy "Admins can create collection categories" on public.collection_categories
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can update collection categories" on public.collection_categories;
create policy "Admins can update collection categories" on public.collection_categories
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admins can delete collection categories" on public.collection_categories;
create policy "Admins can delete collection categories" on public.collection_categories
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- customers
drop policy if exists "Admin can view customers" on public.customers;
create policy "Admin can view customers" on public.customers
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admin can add customers" on public.customers;
create policy "Admin can add customers" on public.customers
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can update customers" on public.customers;
create policy "Admin can update customers" on public.customers
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can delete customers" on public.customers;
create policy "Admin can delete customers" on public.customers
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- finance_records
drop policy if exists "Admin can view all records" on public.finance_records;
create policy "Admin can view all records" on public.finance_records
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admin can update all records" on public.finance_records;
create policy "Admin can update all records" on public.finance_records
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can delete all records" on public.finance_records;
create policy "Admin can delete all records" on public.finance_records
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- finance_payments
drop policy if exists "Admin can view all payments" on public.finance_payments;
create policy "Admin can view all payments" on public.finance_payments
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admin can add payments" on public.finance_payments;
create policy "Admin can add payments" on public.finance_payments
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can update payments" on public.finance_payments;
create policy "Admin can update payments" on public.finance_payments
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can delete payments" on public.finance_payments;
create policy "Admin can delete payments" on public.finance_payments
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- repayment_schedule
drop policy if exists "Admin can view repayment schedule" on public.repayment_schedule;
create policy "Admin can view repayment schedule" on public.repayment_schedule
  for select to authenticated
  using (public.current_user_role() = 'admin');

drop policy if exists "Admin can add repayment schedule" on public.repayment_schedule;
create policy "Admin can add repayment schedule" on public.repayment_schedule
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "Admin can update repayment schedule" on public.repayment_schedule;
create policy "Admin can update repayment schedule" on public.repayment_schedule
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- finance_principal_adjustments
drop policy if exists "Admins can view principal adjustments" on public.finance_principal_adjustments;
create policy "Admins can view principal adjustments" on public.finance_principal_adjustments
  for select to authenticated
  using (public.current_user_role() = 'admin');

-- security_audit_logs
drop policy if exists "Admins can view audit logs" on public.security_audit_logs;
create policy "Admins can view audit logs" on public.security_audit_logs
  for select to authenticated
  using (public.current_user_role() = 'admin');

-- Combined admin/agent policies keep their own-record clauses.
drop policy if exists "Agents can view own settlements" on public.agent_settlements;
create policy "Agents can view own settlements" on public.agent_settlements
  for select to authenticated
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.agents
      where agents.id = agent_settlements.agent_id
        and agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Agents can view own collection evidence" on public.collection_evidence;
create policy "Agents can view own collection evidence" on public.collection_evidence
  for select to authenticated
  using (
    public.current_user_role() = 'admin'
    or exists (
      select 1 from public.agents
      where agents.id = collection_evidence.agent_id
        and agents.auth_user_id = auth.uid()
    )
    or created_by = auth.uid()
  );

notify pgrst, 'reload schema';
