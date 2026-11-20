-- Weekly and Monthly are available to client-role users, but the UPDATE
-- policy added in 20261120120000 only allowed admins. A client's edit would
-- therefore be rejected by RLS and the list would keep showing old data.
--
-- Permissive policies are ORed together, so keep the admin policy and add a
-- separate client policy. Clients may only touch their own loan products
-- (weekly/monthly); they must not be able to reach Daily or Interest-Only
-- loans through the API. Both USING and WITH CHECK check finance_type so a
-- client cannot move a loan into an admin-only product either.
--
-- Workspace isolation remains enforced by the restrictive
-- finance_workspace_isolation_guard policy. Roles are resolved with
-- current_user_role() (email binding first) so a revoked binding takes effect
-- even when profiles.role still holds the old value.
drop policy if exists "finance_records_admin_update_guard"
  on public.finance_records;

drop policy if exists "finance_records_loan_edit_update_guard"
  on public.finance_records;

drop policy if exists "finance_records_client_update_guard"
  on public.finance_records;

create policy "finance_records_loan_edit_update_guard"
  on public.finance_records
  as permissive
  for update
  to authenticated
  using (
    public.current_user_role() = 'admin'
  )
  with check (
    public.current_user_role() = 'admin'
  );

create policy "finance_records_client_update_guard"
  on public.finance_records
  as permissive
  for update
  to authenticated
  using (
    public.current_user_role() = 'client'
    and finance_type in ('weekly', 'monthly')
  )
  with check (
    public.current_user_role() = 'client'
    and finance_type in ('weekly', 'monthly')
  );

-- Editing a loan rebuilds its installment plan, which deletes the old rows.
-- Allow admins to delete any schedule, and clients only schedules belonging
-- to a weekly/monthly loan. Workspace isolation still applies.
drop policy if exists "repayment_schedule_loan_edit_delete_guard"
  on public.repayment_schedule;

create policy "repayment_schedule_loan_edit_delete_guard"
  on public.repayment_schedule
  as permissive
  for delete
  to authenticated
  using (
    public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'client'
      and exists (
        select 1
        from public.finance_records finance
        where finance.id = repayment_schedule.finance_record_id
          and finance.finance_type in ('weekly', 'monthly')
      )
    )
  );
