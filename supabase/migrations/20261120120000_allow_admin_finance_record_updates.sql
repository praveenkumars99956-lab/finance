-- Editing a loan from the Live Daily Loans list (and the other loan pages)
-- issues a direct UPDATE on finance_records. There is an admin INSERT guard
-- but no permissive UPDATE policy, so RLS silently drops the update and the
-- list keeps showing the old values.
--
-- Use current_user_role() (email binding first) rather than profiles.role,
-- which is not kept in sync when a role binding changes.
drop policy if exists "finance_records_admin_update_guard"
  on public.finance_records;

create policy "finance_records_admin_update_guard"
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
